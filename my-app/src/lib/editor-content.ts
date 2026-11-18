import { z } from 'zod';

export type EditorNode = { id: string; type: 'text'; text: string } | { id: string; type: 'container'; children: EditorNode[] };
const nodeId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const node: z.ZodType<EditorNode> = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ id: nodeId, type: z.literal('text'), text: z.string().max(10000) }).strict(),
  z.object({ id: nodeId, type: z.literal('container'), children: z.array(node).max(100) }).strict(),
]));

export function validateEditorContent(input: unknown) {
  // Bound depth and count before recursive schema parsing (also detects cycles).
  const stack: { value: unknown; depth: number }[] = [{ value: input, depth: 0 }];
  let count = 0; const seen = new Set<object>();
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (depth > 20 || ++count > 4000) throw new Error('Editor content is too complex.');
    if (value && typeof value === 'object') {
      if (seen.has(value)) throw new Error('Editor content contains repeated objects.');
      seen.add(value);
      for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
    }
  }
  if (JSON.stringify(input)?.length > 100000) throw new Error('Editor content is too large.');
  const document = z.object({ version: z.literal(1), root: node }).strict().parse(input);
  if (document.root.type !== 'container') throw new Error('The document root must be a container.');
  const ids = new Set<string>(); const nodes = [document.root as EditorNode];
  while (nodes.length) {
    const item = nodes.pop()!;
    if (ids.has(item.id) || ids.size >= 500) throw new Error('Editor node IDs must be unique and limited to 500.');
    ids.add(item.id); if (item.type === 'container') nodes.push(...item.children);
  }
  return document;
}
export const emptyEditorContent = () => validateEditorContent({ version: 1, root: { id: 'root', type: 'container', children: [] } });
