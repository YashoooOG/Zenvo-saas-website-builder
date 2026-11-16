'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getDb } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { invitationIdentity } from '@/lib/invitation-identity';
import { AgencyAccessError } from '@/lib/agency-access';
import { InvitationError } from '@/lib/agency-invitations';
import { changeClientAccess, createClientInvitation, revokeClientInvitation, acceptClientInvitation, ClientAccessConflict } from '@/lib/client-access';
export type AccessState = { message: string; success: boolean; path?: string };
function failure(error: unknown): AccessState {
  if (error instanceof AgencyAccessError || error instanceof InvitationError || error instanceof ClientAccessConflict) return { message: error.message, success: false };
  if (error instanceof ZodError) return { message: 'Check the email address, role, or membership details and try again.', success: false };
  console.error('Client access operation failed.');
  return { message: 'We couldn’t update client access. Please try again.', success: false };
}
function refresh() { revalidatePath('/agency', 'layout'); revalidatePath('/subaccount', 'layout'); }
const scope = (form: FormData) => ({ agencyId: form.get('agencyId'), subAccountId: form.get('subAccountId') });
export async function changeClientAccessAction(_state: AccessState, form: FormData): Promise<AccessState> {
  const user = await requireWorkspaceUser();
  try {
    if (form.get('role') === 'REMOVE' && form.get('confirmed') !== 'yes') throw new ClientAccessConflict('Confirm removal before continuing.');
    await changeClientAccess(getDb(), user.id, { ...scope(form), userId: form.get('userId'), membershipVersion: form.get('membershipVersion'), version: form.get('version') || null, role: form.get('role') });
    refresh(); return { message: 'Client access updated.', success: true };
  } catch (error) { return failure(error); }
}
export async function createClientInviteAction(_state: AccessState, form: FormData): Promise<AccessState> {
  const user = await requireWorkspaceUser();
  try {
    const result = await createClientInvitation(getDb(), user.id, { ...scope(form), email: form.get('email'), role: form.get('role') });
    refresh(); return { message: 'Invitation created. Share the link with this person; it expires in 7 days.', success: true, path: `/subaccount/invitations/${result.token}` };
  } catch (error) { return failure(error); }
}
export async function revokeClientInviteAction(_state: AccessState, form: FormData): Promise<AccessState> {
  const user = await requireWorkspaceUser();
  try { await revokeClientInvitation(getDb(), user.id, { ...scope(form), id: form.get('id') }); refresh(); return { message: 'Invitation revoked.', success: true }; }
  catch (error) { return failure(error); }
}
export async function acceptClientInviteAction(_state: AccessState, form: FormData): Promise<AccessState> {
  const user = await requireWorkspaceUser();
  let id: string;
  try {
    const token = form.get('token');
    if (typeof token !== 'string') throw new InvitationError('Invitation unavailable.');
    id = await acceptClientInvitation(getDb(), await invitationIdentity(user.id), token);
  } catch (error) { return failure(error); }
  refresh(); redirect(`/subaccount/${id}`);
}
