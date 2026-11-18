import { validateEditorContent } from './editor-content';
import { applyEditorOperation, type EditorDocument, type EditorOperation } from './editor-operations';

export const EDITOR_HISTORY_LIMIT = 50;
export type EditorHistory = { past: EditorDocument[]; present: EditorDocument; future: EditorDocument[]; saved: string };
const serialize = (document: EditorDocument) => JSON.stringify(document);
export function createEditorHistory(document: EditorDocument): EditorHistory {
  const present = validateEditorContent(document);
  return { past: [], present, future: [], saved: serialize(present) };
}
export function editorHasChanges(history: EditorHistory) { return serialize(history.present) !== history.saved; }
export function recordEditorChange(history: EditorHistory, operation: EditorOperation): EditorHistory {
  const present = applyEditorOperation(history.present, operation);
  if (serialize(present) === serialize(history.present)) return history;
  return { ...history, past: [...history.past, history.present].slice(-EDITOR_HISTORY_LIMIT), present, future: [] };
}
export function undoEditor(history: EditorHistory): EditorHistory {
  const present = history.past.at(-1); if (!present) return history;
  return { ...history, past: history.past.slice(0, -1), present, future: [history.present, ...history.future].slice(0, EDITOR_HISTORY_LIMIT) };
}
export function redoEditor(history: EditorHistory): EditorHistory {
  const present = history.future[0]; if (!present) return history;
  return { ...history, past: [...history.past, history.present].slice(-EDITOR_HISTORY_LIMIT), present, future: history.future.slice(1) };
}
export function markEditorSaved(history: EditorHistory, savedDocument = history.present): EditorHistory {
  return { ...history, saved: serialize(savedDocument) };
}
