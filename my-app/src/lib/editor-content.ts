import { z } from 'zod';

export const editorStyleSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  padding: z.number().int().min(0).max(120).optional(), fontSize: z.number().int().min(12).max(96).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(), borderRadius: z.number().int().min(0).max(64).optional(),
}).strict();
export type EditorStyle = z.infer<typeof editorStyleSchema>;
export function safeEditorHref(value: string) {
  if (!value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export type EditorNode = { id: string; style?: EditorStyle } & (
  { type: 'text'; text: string } | { type: 'heading'; text: string; level: 1 | 2 | 3 } |
  { type: 'button'; text: string; href: string } | { type: 'image'; mediaId: string; alt: string } | { type: 'container'; children: EditorNode[] }
);
const nodeId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const common = { id: nodeId, style: editorStyleSchema.optional() };
const node: z.ZodType<EditorNode> = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('text'), text: z.string().max(10000) }).strict(),
  z.object({ ...common, type: z.literal('heading'), text: z.string().max(200), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(),
  z.object({ ...common, type: z.literal('button'), text: z.string().max(200), href: z.string().refine(safeEditorHref, 'Use HTTPS, a root-relative path, or an anchor.') }).strict(),
  z.object({ ...common, type: z.literal('image'), mediaId: z.string().min(1).max(191), alt: z.string().max(500) }).strict(),
  z.object({ ...common, type: z.literal('container'), children: z.array(node).max(100) }).strict(),
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

export type EditorMedia = { id: string; name: string; url: string };
export function editorMediaIds(content: ReturnType<typeof validateEditorContent>) {
  const ids = new Set<string>(); const stack = [content.root];
  while (stack.length) { const item = stack.pop()!; if (item.type === 'image') ids.add(item.mediaId); if (item.type === 'container') stack.push(...item.children); }
  return [...ids];
}
