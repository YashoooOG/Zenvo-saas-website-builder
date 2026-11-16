'use client';
import { useActionState, useId, useState } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { changeMemberAction } from '@/app/agency/[agencyId]/team/actions';

export function TeamMember({ agencyId, member, ownerId }: { agencyId: string; ownerId: string; member: { userId: string; role: 'ADMIN' | 'MEMBER' | 'CLIENT'; version: string; user: { name: string | null; email: string | null } } }) {
  const id = useId();
  const [role, setRole] = useState(member.role);
  const [state, action, pending] = useActionState(changeMemberAction, { message: '', success: false });
  const owner = member.userId === ownerId;
  const name = member.user.name || member.user.email || 'Team member';
  const hidden = <><input type="hidden" name="agencyId" value={agencyId} /><input type="hidden" name="userId" value={member.userId} /><input type="hidden" name="version" value={member.version} /></>;
  return <li className="team-member"><div className="team-identity"><h2>{name}</h2>{member.user.name && member.user.email && <p>{member.user.email}</p>}</div>
    {owner ? <span className="agency-owner">Owner</span> : <form action={action} className="team-member-form">{hidden}
      <label htmlFor={`${id}-role`} className="sr-only">Role for {name}</label><select id={`${id}-role`} name="role" value={role} onChange={event => setRole(event.target.value as typeof role)} disabled={pending}><option value="ADMIN">Admin</option><option value="MEMBER">Member</option><option value="CLIENT">Client</option></select>
      <button className="text-action" type="submit" disabled={pending || role === member.role}>{pending ? 'Saving…' : 'Save role'}</button>
      <Dialog><DialogTrigger type="button" className="text-action" disabled={pending}>Remove<span className="sr-only"> {name}</span></DialogTrigger>
        <DialogContent title="Remove team access?" description={`${name} will lose access to this agency and all of its assigned client workspaces. Their account will remain active.`}>
          {state.message && !state.success && <p className="agency-field-error" role="alert">{state.message}</p>}
          <div className="team-confirm-actions"><DialogClose className="text-action">Cancel</DialogClose><button className="action" type="submit" disabled={pending} form={`${id}-remove`}>{pending ? 'Removing…' : 'Remove access'}</button></div>
        </DialogContent>
      </Dialog>
    </form>}
    {!owner && <form id={`${id}-remove`} action={action} hidden>{hidden}<input type="hidden" name="role" value="REMOVE" /></form>}
    {state.message && <p className={state.success ? 'agency-feedback' : 'agency-field-error'} role={state.success ? 'status' : 'alert'}>{state.message}</p>}
  </li>;
}
