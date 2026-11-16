'use client';
import { useActionState, useId, useState } from 'react';
import { createClientAction, updateClientAction, type ClientFormState } from '@/app/subaccount/actions';
export function ClientForm({ agencyId, creationKey, account }: { agencyId: string; creationKey?: string; account?: { id: string; name: string; revision: number; enabled: boolean } }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(account ? updateClientAction : createClientAction, {});
  const [name, setName] = useState(account?.name ?? '');
  const [enabled, setEnabled] = useState(account?.enabled ?? true);
  const id = useId();
  return <form action={action} className="agency-form">
    <input type="hidden" name="agencyId" value={agencyId} />
    <input type="hidden" name="creationKey" value={creationKey ?? ''} />
    <input type="hidden" name="id" value={account?.id ?? ''} />
    <input type="hidden" name="revision" value={state.revision ?? account?.revision ?? 0} />
    <input type="hidden" name="enabled" value={String(enabled)} />
    <fieldset disabled={pending} className="agency-fields"><legend className="sr-only">Client workspace details</legend>
      <div className="agency-field agency-field-wide"><label htmlFor={id}>Client workspace name</label><input id={id} name="name" required minLength={2} maxLength={191} value={name} onChange={event => setName(event.target.value)} /></div>
      {account && <div className="agency-field agency-field-wide"><label htmlFor={`${id}-status`}>Workspace status</label><select id={`${id}-status`} value={String(enabled)} onChange={event => setEnabled(event.target.value === 'true')} aria-describedby={`${id}-help`}><option value="true">Active</option><option value="false">Archived</option></select><p id={`${id}-help`}>Archiving blocks workspace access. Saved data and assignments remain available when you restore it.</p></div>}
    </fieldset>
    {state.message && <p role={state.success ? 'status' : 'alert'} className={state.success ? 'agency-feedback' : 'agency-field-error'}>{state.message}</p>}
    <div className="agency-form-footer"><button className="action" type="submit" disabled={pending}>{pending ? 'Saving…' : account ? 'Save workspace' : 'Create client workspace'}</button></div>
  </form>;
}
