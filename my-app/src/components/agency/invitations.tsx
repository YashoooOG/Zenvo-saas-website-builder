'use client';
import { useActionState, useId, useState } from 'react';
import { createInvitationAction, revokeInvitationAction, acceptInvitationAction } from '@/app/agency/invitations/actions';
const initialState: { message: string; success: boolean; path?: string } = { message: '', success: false };

export function CreateInvitation({ agencyId }: { agencyId: string }) {
  const id = useId();
  const [state, action, pending] = useActionState(createInvitationAction, initialState);
  const [copied, setCopied] = useState('');
  return <section className="team-invitations"><h2>Invite a teammate</h2><p>Create a link for one email address. No email is sent automatically. Creating another invitation for the same address replaces its previous link.</p>
    <form action={action} className="team-invite-form" onSubmit={() => setCopied('')}>
      <input type="hidden" name="agencyId" value={agencyId} />
      <div className="agency-field"><label htmlFor={`${id}-email`}>Email address</label><input id={`${id}-email`} name="email" type="email" maxLength={320} required disabled={pending} autoComplete="off" /></div>
      <div className="agency-field"><label htmlFor={`${id}-role`}>Agency role</label><select id={`${id}-role`} name="role" defaultValue="MEMBER" disabled={pending}><option value="MEMBER">Member</option><option value="ADMIN">Admin</option></select></div>
      <button type="submit" className="action" disabled={pending}>{pending ? 'Creating…' : 'Create invitation'}</button>
    </form>
    {state.message && <p role={state.success ? 'status' : 'alert'} className={state.success ? 'agency-feedback' : 'agency-field-error'}>{state.message}</p>}
    {state.path && <div className="invitation-link"><label htmlFor={`${id}-link`}>Invitation path</label><input id={`${id}-link`} value={state.path} readOnly onFocus={event => event.target.select()} /><button type="button" className="text-action" onClick={async () => { try { await navigator.clipboard.writeText(new URL(state.path!, window.location.origin).href); setCopied('Invitation link copied.'); } catch { setCopied('Copy the path above and add this site’s address before sharing.'); } }}>Copy invitation link</button><p role="status">{copied}</p></div>}
  </section>;
}
export function RevokeInvitation({ agencyId, invitationId }: { agencyId: string; invitationId: string }) {
  const [state, action, pending] = useActionState(revokeInvitationAction, initialState);
  return <form action={action}><input type="hidden" name="agencyId" value={agencyId} /><input type="hidden" name="invitationId" value={invitationId} /><button className="text-action" disabled={pending}>{pending ? 'Revoking…' : 'Revoke invitation'}</button>{state.message && <p role={state.success ? 'status' : 'alert'}>{state.message}</p>}</form>;
}
export function AcceptInvitation({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, initialState);
  return <form action={action}><input type="hidden" name="token" value={token} /><button className="action" disabled={pending}>{pending ? 'Joining…' : 'Accept invitation'}</button>{state.message && <p className="agency-field-error" role="alert">{state.message}</p>}</form>;
}
