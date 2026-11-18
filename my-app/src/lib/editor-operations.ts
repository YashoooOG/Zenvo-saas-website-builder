import { validateEditorContent, type EditorNode, type EditorStyle } from './editor-content';
export type EditorDocument = ReturnType<typeof validateEditorContent>;
export type EditorOperation = { type: 'style'; id: string; style: EditorStyle } | { type: 'href'; id: string; href: string } | { type: 'level'; id: string; level: 1 | 2 | 3 } | { type: 'text'; id: string; text: string } | { type: 'add'; parentId: string; node: EditorNode } | { type: 'remove'; id: string } | { type: 'move'; id: string; direction: -1 | 1 };

export function applyEditorOperation(document: EditorDocument, operation: EditorOperation): EditorDocument {
  const next = structuredClone(document); let found = false;
  function visit(node: EditorNode) {
    if (operation.type === 'text' && node.id === operation.id && node.type !== 'container') { node.text = operation.text; found = true; }
    if (operation.type === 'style' && node.id === operation.id) { node.style = operation.style; found = true; }
    if (operation.type === 'href' && node.id === operation.id && node.type === 'button') { node.href = operation.href; found = true; }
    if (operation.type === 'level' && node.id === operation.id && node.type === 'heading') { node.level = operation.level; found = true; }
    if (node.type !== 'container') return;
    if (operation.type === 'add' && node.id === operation.parentId) { node.children.push(structuredClone(operation.node)); found = true; return; }
    if (operation.type === 'remove' || operation.type === 'move') {
      const index = node.children.findIndex(child => child.id === operation.id);
      if (index !== -1) {
        if (operation.type === 'remove') node.children.splice(index, 1);
        else { const target = index + operation.direction; if (target >= 0 && target < node.children.length) [node.children[index], node.children[target]] = [node.children[target], node.children[index]]; }
        found = true; return;
      }
    }
    node.children.forEach(visit);
  }
  visit(next.root);
  if (!found) throw new Error('Editor element unavailable.');
  return validateEditorContent(next);
}
