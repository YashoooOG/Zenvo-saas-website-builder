import type { CSSProperties } from 'react';
import type { EditorNode, EditorMedia } from '@/lib/editor-content';

// Only validated style properties reach this renderer. Preview links intentionally
// do not navigate away from unsaved work; public rendering comes with publishing.
export function DraftPreview({ node, media = [] }: { node: EditorNode; media?: EditorMedia[] }) {
  const style: CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...node.style };
  if (node.type === 'text') return <p style={style}>{node.text}</p>;
  if (node.type === 'heading') { const Tag = node.level === 1 ? 'h1' : node.level === 2 ? 'h2' : 'h3'; return <Tag style={style}>{node.text}</Tag>; }
  if (node.type === 'button') return <button type="button" style={{ padding: 12, border: '1px solid currentColor', ...style }} title={`Preview only: ${node.href}`}>{node.text}</button>;
  if (node.type === 'image') {
    const image = media.find(item => item.id === node.mediaId);
    if (!image) return <p role="status">Image unavailable. Choose another image from this workspace.</p>;
    // Sources are resolved from authorized workspace media, not document URLs.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image.url} alt={node.alt} loading="lazy" referrerPolicy="no-referrer" style={{ maxWidth: '100%', height: 'auto', display: 'block', ...style }} />;
  }
  return <div style={style}>{node.children.map(child => <DraftPreview key={child.id} node={child} media={media} />)}</div>;
}
