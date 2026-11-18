import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyEditorContent } from '../src/lib/editor-content';
import { createEditorHistory, editorHasChanges, recordEditorChange, undoEditor, redoEditor, markEditorSaved, EDITOR_HISTORY_LIMIT } from '../src/lib/editor-history';
import { ResponsiveDraftPreview, previewWidths } from '../src/components/agency/responsive-draft-preview';

const initial = () => createEditorHistory(emptyEditorContent());
const add = (history = initial()) => recordEditorChange(history, { type: 'add', parentId: 'root', node: { id: 'text', type: 'text', text: 'First' } });

test('undo and redo restore exact documents without mutating prior snapshots', () => {
  const start = initial(), changed = add(start);
  assert.ok(editorHasChanges(changed)); assert.deepEqual(start.present, emptyEditorContent());
  const undone = undoEditor(changed); assert.equal(editorHasChanges(undone), false);
  assert.deepEqual(redoEditor(undone).present, changed.present);
  assert.equal(undoEditor(start), start); assert.equal(redoEditor(start), start);
});
test('saving updates the baseline but keeps undo/redo and correctly detects unsaved states', () => {
  const saved = markEditorSaved(add()); assert.equal(editorHasChanges(saved), false);
  const undone = undoEditor(saved); assert.equal(editorHasChanges(undone), true);
  assert.equal(editorHasChanges(redoEditor(undone)), false);
});
test('branching clears redo while no-op operations preserve it', () => {
  const changed = recordEditorChange(add(), { type: 'text', id: 'text', text: 'Second' });
  const undone = undoEditor(changed);
  assert.equal(recordEditorChange(undone, { type: 'text', id: 'text', text: 'First' }), undone);
  assert.equal(recordEditorChange(undone, { type: 'text', id: 'text', text: 'Different' }).future.length, 0);
});
test('save acknowledgments only mark the submitted document as saved', () => {
  const submitted = add();
  const newer = recordEditorChange(submitted, { type: 'text', id: 'text', text: 'Newer edit' });
  const acknowledged = markEditorSaved(newer, submitted.present);
  assert.equal(editorHasChanges(acknowledged), true);
  assert.equal(editorHasChanges(undoEditor(acknowledged)), false);
});
test('history is bounded and invalid operations cannot modify the history', () => {
  let history = add();
  for (let i = 0; i < 100; i++) history = recordEditorChange(history, { type: 'text', id: 'text', text: String(i) });
  assert.equal(history.past.length, EDITOR_HISTORY_LIMIT);
  const before = JSON.stringify(history);
  assert.throws(() => recordEditorChange(history, { type: 'text', id: 'text', text: 'x'.repeat(10001) }));
  assert.equal(JSON.stringify(history), before);
  for (let i = 0; i < 100; i++) history = undoEditor(history);
  assert.equal(history.past.length, 0); assert.equal(history.future.length, EDITOR_HISTORY_LIMIT);
});
test('removing a section can be undone with all nested content and styles intact', () => {
  let history = recordEditorChange(initial(), { type: 'add', parentId: 'root', node: { id: 'section', type: 'container', style: { padding: 24 }, children: [{ id: 'button', type: 'button', text: 'Contact', href: '/contact' }] } });
  const before = history.present;
  history = recordEditorChange(history, { type: 'remove', id: 'section' });
  assert.deepEqual(undoEditor(history).present, before);
});
test('responsive preview exposes three fixed canvas widths and starts at desktop width', () => {
  assert.deepEqual(previewWidths, { desktop: 1024, tablet: 768, phone: 375 });
  const html = renderToStaticMarkup(createElement(ResponsiveDraftPreview, { node: emptyEditorContent().root }));
  assert.match(html, /width:1024px/); assert.match(html, /overflow-x:auto/);
  assert.match(html, /Tablet/); assert.match(html, /Phone/); assert.match(html, /tabindex="0"/);
});
