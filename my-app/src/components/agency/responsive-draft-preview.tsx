'use client';
import { useState } from 'react';
import type { EditorNode } from '@/lib/editor-content';
import { DraftPreview } from './draft-preview';

export const previewWidths = { desktop: 1024, tablet: 768, phone: 375 } as const;
export function ResponsiveDraftPreview({ node }: { node: EditorNode }) {
  const [size, setSize] = useState<keyof typeof previewWidths>('desktop');
  return <section aria-label="Live draft preview" style={{ minWidth: 0 }}>
    <h2>Draft preview</h2>
    <label>Preview width <select value={size} onChange={event => setSize(event.target.value as keyof typeof previewWidths)}>
      <option value="desktop">Desktop — 1024px</option><option value="tablet">Tablet — 768px</option><option value="phone">Phone — 375px</option>
    </select></label>
    <p>Preview uses the same styles at each width. Scroll horizontally when the canvas is wider than this panel.</p>
    <div tabIndex={0} role="region" aria-label={`${size} preview canvas, ${previewWidths[size]} pixels wide`} style={{ overflowX: 'auto', border: '1px solid var(--border)', marginTop: 16 }}>
      <div style={{ width: previewWidths[size], minHeight: 360, boxSizing: 'border-box', backgroundColor: '#ffffff', color: '#1c1c1c', padding: 16 }}>
        <DraftPreview node={node} />
      </div>
    </div>
  </section>;
}
