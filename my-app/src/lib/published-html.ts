import type { EditorMedia, EditorNode } from './editor-content';
import { validateEditorContent } from './editor-content';
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function publishedHtml(name: string, raw: unknown, media: EditorMedia[]) {
  const content = validateEditorContent(raw);
  function render(node: EditorNode): string {
    const style = Object.entries(node.style ?? {}).map(([key, value]) => `${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}:${typeof value === 'number' ? `${value}px` : value}`).join(';');
    const attrs = ` id="${escape(node.id)}" style="${escape(style)}"`;
    if (node.type === 'container') return `<div${attrs}>${node.children.map(render).join('')}</div>`;
    if (node.type === 'text') return `<p${attrs}>${escape(node.text)}</p>`;
    if (node.type === 'heading') return `<h${node.level}${attrs}>${escape(node.text)}</h${node.level}>`;
    if (node.type === 'button') return `<a${attrs} class="button" href="${escape(node.href)}" rel="noreferrer">${escape(node.text)}</a>`;
    const image = media.find(item => item.id === node.mediaId);
    return image ? `<img${attrs} src="${escape(image.url)}" alt="${escape(node.alt)}" loading="lazy" referrerpolicy="no-referrer">` : '<p>Image unavailable.</p>';
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(name)}</title><style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:system-ui,sans-serif;color:#1c1c1c;background:#fff}p,h1,h2,h3{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%;height:auto;display:block}.button{display:inline-block;padding:12px;border:1px solid currentColor;color:inherit;text-decoration:none}</style></head><body>${render(content.root)}</body></html>`;
}
