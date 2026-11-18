'use client';
import { useActionState, useId } from 'react';
import { funnelAction } from '@/app/subaccount/funnel-actions';

export function FunnelForm({ hidden, name, path, label, confirmation }: { hidden: Record<string, string>; name?: string; path?: string; label: string; confirmation?: string }) {
  const id = useId(); const [state, action, pending] = useActionState(funnelAction, { message: '' });
  return <form action={action} className="pipeline-form">
    {Object.entries(hidden).map(([key, value]) => <input key={key} name={key} value={value} type="hidden" />)}
    {name !== undefined && <div className="agency-field"><label htmlFor={`${id}-name`}>Name</label><input id={`${id}-name`} name="name" defaultValue={name} minLength={2} maxLength={191} required disabled={pending} /></div>}
    {path !== undefined && <div className="agency-field"><label htmlFor={`${id}-path`}>Page path</label><input id={`${id}-path`} name="path" defaultValue={path} maxLength={191} placeholder="/contact" required disabled={pending} /><p>Use / for the homepage, or a path such as /contact. Paths are shared across this workspace.</p></div>}
    {confirmation && <label><input name="confirmed" type="checkbox" value="yes" required disabled={pending} /> {confirmation}</label>}
    <button className="action" disabled={pending}>{pending ? 'Saving…' : label}</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
