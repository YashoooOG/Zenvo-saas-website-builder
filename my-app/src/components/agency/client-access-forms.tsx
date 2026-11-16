'use client';
import { useActionState, useId, useState } from 'react';
import { changeClientAccessAction, createClientInviteAction, revokeClientInviteAction, acceptClientInviteAction, type AccessState } from '@/app/subaccount/access-actions';
const initial: AccessState = { message: '', success: false };
type Scope = { agencyId: string; subAccountId: string };
function ScopeInputs({ agencyId, subAccountId }: Scope) { return <><input type="hidden" name="agencyId" value={agencyId} /><input type="hidden" name="subAccountId" value={subAccountId} /></>; }
function Feedback({ state }: { state: AccessState }) { return state.message && <p role={state.success ? 'status' : 'alert'} className={state.success ? 'agency-feedback' : 'agency-field-error'}>{state.message}</p>; }
function Roles() { return <><option value="GUEST">Guest</option><option value="MEMBER">Member</option><option value="ADMIN">Admin</option></>; }
export function ClientAssignmentForm({ scope, userId, membershipVersion, version, currentRole, name, archived }: { scope: Scope; userId: string; membershipVersion: string; version: string | null; currentRole?: string; name: string; archived: boolean }) {
  const [state, action, pending] = useActionState(changeClientAccessAction, initial);
  const [role, setRole] = useState(currentRole ?? 'GUEST');
  const id = useId();
  return <form action={action} className="client-assignment-form"><ScopeInputs {...scope} /><input type="hidden" name="userId" value={userId} /><input type="hidden" name="membershipVersion" value={membershipVersion} /><input type="hidden" name="version" value={version ?? ''} />
    <label htmlFor={id} className="sr-only">Client role for {name}</label><select id={id} name="role" value={role} onChange={event => setRole(event.target.value)} disabled={pending}><Roles />{version && <option value="REMOVE">Remove access</option>}</select>
    {role === 'REMOVE' && <label className="client-removal"><input type="checkbox" name="confirmed" value="yes" required disabled={pending} />Remove this person’s access to this workspace</label>}
    <button type="submit" className="text-action" disabled={pending || (archived && role !== 'REMOVE')}>{pending ? 'Saving…' : role === 'REMOVE' ? 'Remove access' : version ? 'Save client role' : 'Assign workspace'}</button><Feedback state={state} />
  </form>;
}
export function ClientInviteForm({ scope }: { scope: Scope }) {
  const [state, action, pending] = useActionState(createClientInviteAction, initial);
  const [copied, setCopied] = useState('');
  const id = useId();
  return <section className="team-invitations"><h2>Invite a client</h2><p>Create a link for one verified email address. No email is sent automatically. A replacement link revokes the previous invitation for this workspace and address.</p><form action={action} className="team-invite-form" onSubmit={() => setCopied('')}><ScopeInputs {...scope} />
    <div className="agency-field"><label htmlFor={`${id}-email`}>Client email address</label><input id={`${id}-email`} name="email" type="email" required maxLength={320} disabled={pending} autoComplete="off" /></div><div className="agency-field"><label htmlFor={`${id}-role`}>Client role</label><select id={`${id}-role`} name="role" defaultValue="GUEST" disabled={pending}><Roles /></select></div><button className="action" disabled={pending}>{pending ? 'Creating…' : 'Create client invitation'}</button></form><Feedback state={state} />
    {state.path && <div className="invitation-link"><label htmlFor={`${id}-link`}>Client invitation path</label><input id={`${id}-link`} value={state.path} readOnly onFocus={event => event.target.select()} /><button type="button" className="text-action" onClick={async () => { try { await navigator.clipboard.writeText(new URL(state.path!, window.location.origin).href); setCopied('Invitation link copied.'); } catch { setCopied('Copy the path above and add this site’s address before sharing.'); } }}>Copy client invitation link</button><p role="status">{copied}</p></div>}
  </section>;
}
export function RevokeClientInvite({ scope, id }: { scope: Scope; id: string }) {
  const [state, action, pending] = useActionState(revokeClientInviteAction, initial);
  return <form action={action}><ScopeInputs {...scope} /><input type="hidden" name="id" value={id} /><button className="text-action" disabled={pending}>{pending ? 'Revoking…' : 'Revoke client invitation'}</button><Feedback state={state} /></form>;
}
export function AcceptClientInvite({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptClientInviteAction, initial);
  return <form action={action}><input type="hidden" name="token" value={token} /><button className="action" disabled={pending}>{pending ? 'Joining…' : 'Accept client invitation'}</button><Feedback state={state} /></form>;
}
