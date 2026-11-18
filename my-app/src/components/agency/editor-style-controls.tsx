'use client';
import { useState } from 'react';
import type { EditorNode, EditorStyle } from '@/lib/editor-content';
import type { EditorOperation } from '@/lib/editor-operations';

export function EditorStyleControls({ node, change }: { node: EditorNode; change: (operation: EditorOperation) => void }) {
  const style = node.style ?? {};
  const update = (patch: EditorStyle) => change({ type: 'style', id: node.id, style: { ...style, ...patch } });
  return <details><summary>Appearance</summary><div className="agency-field">
    <label>Text color<input type="color" value={style.color ?? '#1c1c1c'} onChange={e => update({ color: e.target.value })} /></label>
    <label>Background color<input type="color" value={style.backgroundColor ?? '#ffffff'} onChange={e => update({ backgroundColor: e.target.value })} /></label>
    <label>Padding: {style.padding ?? 0}px<input type="range" min={0} max={120} value={style.padding ?? 0} onChange={e => update({ padding: Number(e.target.value) })} /></label>
    <label>Text size: {style.fontSize ?? 16}px<input type="range" min={12} max={96} value={style.fontSize ?? 16} onChange={e => update({ fontSize: Number(e.target.value) })} /></label>
    <label>Corner radius: {style.borderRadius ?? 0}px<input type="range" min={0} max={64} value={style.borderRadius ?? 0} onChange={e => update({ borderRadius: Number(e.target.value) })} /></label>
    <label>Alignment<select value={style.textAlign ?? 'left'} onChange={e => update({ textAlign: e.target.value as EditorStyle['textAlign'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    <button type="button" className="text-action" onClick={() => change({ type: 'style', id: node.id, style: {} })}>Reset appearance</button>
  </div></details>;
}
export function ButtonDestination({ node, change }: { node: Extract<EditorNode, { type: 'button' }>; change: (operation: EditorOperation) => void }) {
  const [value, setValue] = useState(node.href);
  return <div className="agency-field"><label>Button destination<input value={value} maxLength={2048} onChange={e => setValue(e.target.value)} /></label><p>Applied destination: {node.href}</p><button type="button" className="text-action" onClick={() => change({ type: 'href', id: node.id, href: value })}>Apply destination</button><p>Use an HTTPS URL, /page-path, or #anchor. Apply the destination before saving.</p></div>;
}
