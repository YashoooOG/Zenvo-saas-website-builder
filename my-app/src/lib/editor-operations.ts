import { validateEditorContent, type EditorNode, type EditorStyle } from './editor-content';
export type EditorDocument = ReturnType<typeof validateEditorContent>;
export type EditorOperation = { type: 'image'; id: string; mediaId: string; alt: string } | { type: 'place'; id: string; parentId: string; beforeId: string | null } | { type: 'style'; id: string; style: EditorStyle } | { type: 'href'; id: string; href: string } | { type: 'level'; id: string; level: 1 | 2 | 3 } | { type: 'text'; id: string; text: string } | { type: 'add'; parentId: string; node: EditorNode } | { type: 'remove'; id: string } | { type: 'move'; id: string; direction: -1 | 1 };

export function applyEditorOperation(document: EditorDocument, operation: EditorOperation): EditorDocument {
  const next = structuredClone(document); let found = false;
  if (operation.type === 'place') {
    const nodes = new Map<string, EditorNode>();
    const parents = new Map<string, Extract<EditorNode, { type: 'container' }>>();
    function index(node: EditorNode) {
      nodes.set(node.id, node);
      if (node.type === 'container') for (const child of node.children) { parents.set(child.id, node); index(child); }
    }
    index(next.root);
    const moving = nodes.get(operation.id), source = parents.get(operation.id), destination = nodes.get(operation.parentId);
    if (!moving || !source || destination?.type !== 'container') throw new Error('Invalid block destination.');
    for (let ancestor: EditorNode | undefined = destination; ancestor; ancestor = parents.get(ancestor.id)) {
      if (ancestor.id === moving.id) throw new Error('A section cannot be moved inside itself.');
    }
    if (operation.beforeId !== null && !destination.children.some(child => child.id === operation.beforeId)) throw new Error('Invalid insertion target.');
    if (operation.beforeId === moving.id) return validateEditorContent(next);
    source.children.splice(source.children.findIndex(child => child.id === moving.id), 1);
    const target = operation.beforeId === null ? destination.children.length : destination.children.findIndex(child => child.id === operation.beforeId);
    destination.children.splice(target, 0, moving);
    return validateEditorContent(next);
  }
  function visit(node: EditorNode) {
    if (operation.type === 'text' && node.id === operation.id && node.type !== 'container' && node.type !== 'image') { node.text = operation.text; found = true; }
    if (operation.type === 'image' && node.id === operation.id && node.type === 'image') { node.mediaId = operation.mediaId; node.alt = operation.alt; found = true; }
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
