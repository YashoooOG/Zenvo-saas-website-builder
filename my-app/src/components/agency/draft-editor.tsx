'use client';
import { useEffect, useState, useTransition } from 'react';
import { saveDraftAction } from '@/app/subaccount/draft-actions';
import { applyEditorOperation, type EditorDocument, type EditorOperation } from '@/lib/editor-operations';
import type { EditorNode } from '@/lib/editor-content';

function Preview({ node }: { node: EditorNode }) {
  return node.type === 'text' ? <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{node.text}</p> : <div>{node.children.map(child => <Preview key={child.id} node={child} />)}</div>;
}
function Controls({ node, root = false, disabled, change }: { node: EditorNode; root?: boolean; disabled: boolean; change: (operation: EditorOperation) => void }) {
  return <fieldset disabled={disabled} className="launchpad-section"><legend>{root ? 'Page content' : node.type === 'text' ? 'Text block' : 'Section'}</legend>
    {node.type === 'text' ? <label>Text<textarea value={node.text} onChange={event => change({ type: 'text', id: node.id, text: event.target.value })} maxLength={10000} rows={4} /></label> : <>
      {node.children.map(child => <Controls key={child.id} node={child} disabled={disabled} change={change} />)}
      <button type="button" className="text-action" onClick={() => change({ type: 'add', parentId: node.id, node: { id: crypto.randomUUID(), type: 'text', text: 'Write your text here.' } })}>Add text</button>{' '}
      <button type="button" className="text-action" onClick={() => change({ type: 'add', parentId: node.id, node: { id: crypto.randomUUID(), type: 'container', children: [] } })}>Add section</button>
    </>}
    {!root && <div className="agency-overview-links"><button type="button" className="text-action" onClick={() => change({ type: 'move', id: node.id, direction: -1 })}>Move up</button><button type="button" className="text-action" onClick={() => change({ type: 'move', id: node.id, direction: 1 })}>Move down</button><button type="button" className="text-action" onClick={() => { if (window.confirm('Remove this block and any content inside it?')) change({ type: 'remove', id: node.id }); }}>Remove block</button></div>}
  </fieldset>;
}
export function DraftEditor({ subAccountId, funnelId, pageId, initial, initialRevision, editable }: { subAccountId: string; funnelId: string; pageId: string; initial: EditorDocument; initialRevision: number; editable: boolean }) {
  const [document, setDocument] = useState(initial); const [revision, setRevision] = useState(initialRevision);
  const [dirty, setDirty] = useState(false); const [message, setMessage] = useState(''); const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(operation: EditorOperation) {
    try { setDocument(applyEditorOperation(document, operation)); setDirty(true); setMessage(''); }
    catch { setMessage('That change exceeds the page limits or refers to a missing block.'); }
  }
  return <><div className="agency-overview-links">
    {editable && <button className="action" disabled={pending || !dirty} onClick={() => startTransition(async () => {
      try {
        const result = await saveDraftAction({ subAccountId, funnelId, pageId, revision, content: document });
        if (result.success) { setRevision(result.revision); setDirty(false); setMessage('Draft saved.'); }
        else setMessage(result.message);
      } catch { setMessage('The save could not be confirmed. Your edits are still here.'); }
    })}>{pending ? 'Saving…' : 'Save draft'}</button>}
    <button className="text-action" disabled={pending} onClick={() => { if (!dirty || window.confirm('Discard unsaved edits and reload the saved draft?')) window.location.reload(); }}>Reload saved draft</button>
    <span role="status">{message || (dirty ? 'Unsaved changes' : editable ? 'Saved draft' : 'Read-only preview')}</span>
  </div><div className="agency-settings-grid">
    {editable && <section aria-label="Draft controls"><Controls node={document.root} root disabled={pending} change={change} /></section>}
    <section className="agency-empty" aria-label="Live draft preview"><h2>Draft preview</h2><Preview node={document.root} /></section>
  </div></>;
}
