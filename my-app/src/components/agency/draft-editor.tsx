'use client';
import { useEffect, useState, useTransition } from 'react';
import { saveDraftAction } from '@/app/subaccount/draft-actions';
import { type EditorDocument, type EditorOperation } from '@/lib/editor-operations';
import { createEditorHistory, editorHasChanges, recordEditorChange, undoEditor, redoEditor, markEditorSaved } from '@/lib/editor-history';
import type { EditorNode } from '@/lib/editor-content';
import { ResponsiveDraftPreview } from './responsive-draft-preview';
import { EditorStructure } from './editor-structure';
import { EditorStyleControls, ButtonDestination } from './editor-style-controls';

function Controls({ node, root = false, disabled, change }: { node: EditorNode; root?: boolean; disabled: boolean; change: (operation: EditorOperation) => void }) {
  return <fieldset disabled={disabled} className="launchpad-section"><legend>{root ? 'Page content' : node.type === 'container' ? 'Section' : node.type === 'heading' ? 'Heading' : node.type === 'button' ? 'Button' : 'Text block'}</legend>
    {node.type !== 'container' ? <label className="agency-field">Text<textarea value={node.text} onChange={event => change({ type: 'text', id: node.id, text: event.target.value })} maxLength={node.type === 'text' ? 10000 : 200} rows={node.type === 'text' ? 4 : 2} /></label> : <>
      {node.children.map(child => <Controls key={child.id} node={child} disabled={disabled} change={change} />)}
      <button type="button" className="text-action" onClick={() => change({ type: 'add', parentId: node.id, node: { id: crypto.randomUUID(), type: 'text', text: 'Write your text here.' } })}>Add text</button>{' '}
      <button type="button" className="text-action" onClick={() => change({ type: 'add', parentId: node.id, node: { id: crypto.randomUUID(), type: 'container', children: [] } })}>Add section</button>{' '}
      <button type="button" className="text-action" onClick={() => change({ type: 'add', parentId: node.id, node: { id: crypto.randomUUID(), type: 'heading', text: 'Your heading', level: 2 } })}>Add heading</button>{' '}
      <button type="button" className="text-action" onClick={() => change({ type: 'add', parentId: node.id, node: { id: crypto.randomUUID(), type: 'button', text: 'Learn more', href: '/' } })}>Add button</button>
    </>}
    {node.type === 'heading' && <label>Heading level<select value={node.level} onChange={event => change({ type: 'level', id: node.id, level: Number(event.target.value) as 1 | 2 | 3 })}><option value={1}>Heading 1</option><option value={2}>Heading 2</option><option value={3}>Heading 3</option></select></label>}
    {node.type === 'button' && <ButtonDestination key={`${node.id}-${node.href}`} node={node} change={change} />}
    <EditorStyleControls node={node} change={change} />
    {!root && <div className="agency-overview-links"><button type="button" className="text-action" onClick={() => change({ type: 'move', id: node.id, direction: -1 })}>Move up</button><button type="button" className="text-action" onClick={() => change({ type: 'move', id: node.id, direction: 1 })}>Move down</button><button type="button" className="text-action" onClick={() => { if (window.confirm('Remove this block and any content inside it?')) change({ type: 'remove', id: node.id }); }}>Remove block</button></div>}
  </fieldset>;
}
export function DraftEditor({ subAccountId, funnelId, pageId, initial, initialRevision, editable }: { subAccountId: string; funnelId: string; pageId: string; initial: EditorDocument; initialRevision: number; editable: boolean }) {
  const [history, setHistory] = useState(() => createEditorHistory(initial)); const [revision, setRevision] = useState(initialRevision);
  const document = history.present; const dirty = editorHasChanges(history);
  const [message, setMessage] = useState(''); const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(operation: EditorOperation) {
    try { setHistory(recordEditorChange(history, operation)); setMessage(''); }
    catch { setMessage('That change is invalid. Check the destination, style values, or page limits.'); }
  }
  function travel(direction: 'undo' | 'redo') {
    if (!editable || pending) return;
    setHistory(current => direction === 'undo' ? undoEditor(current) : redoEditor(current)); setMessage('');
  }
  return <div onKeyDown={event => {
    const target = event.target as HTMLElement;
    // Keep native text-field undo intact. Document shortcuts apply elsewhere
    // inside the editor and never change a guest's read-only state.
    if (!editable || pending || target.closest('input, textarea, select, [contenteditable="true"]') || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') { event.preventDefault(); travel(key === 'y' || event.shiftKey ? 'redo' : 'undo'); }
  }}><div className="agency-overview-links">
    {editable && <><button className="text-action" disabled={pending || !history.past.length} onClick={() => travel('undo')}>Undo</button><button className="text-action" disabled={pending || !history.future.length} onClick={() => travel('redo')}>Redo</button></>}
    {editable && <button className="action" disabled={pending || !dirty} onClick={() => startTransition(async () => {
      try {
        const result = await saveDraftAction({ subAccountId, funnelId, pageId, revision, content: document });
        if (result.success) { setRevision(result.revision); setHistory(current => markEditorSaved(current, document)); setMessage('Draft saved.'); }
        else setMessage(result.message);
      } catch { setMessage('The save could not be confirmed. Your edits are still here.'); }
    })}>{pending ? 'Saving…' : 'Save draft'}</button>}
    <button className="text-action" disabled={pending} onClick={() => { if (!dirty || window.confirm('Discard unsaved edits and reload the saved draft?')) window.location.reload(); }}>Reload saved draft</button>
    <span role="status">{message || (dirty ? 'Unsaved changes' : editable ? 'Saved draft' : 'Read-only preview')}</span>
  </div><div className="agency-settings-grid">
    {editable && <section aria-label="Draft controls"><EditorStructure root={document.root} disabled={pending} change={change} /><Controls node={document.root} root disabled={pending} change={change} /></section>}
    <ResponsiveDraftPreview node={document.root} />
  </div></div>;
}
