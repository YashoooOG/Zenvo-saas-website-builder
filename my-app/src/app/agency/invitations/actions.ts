'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getDb } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { AgencyAccessError } from '@/lib/agency-access';
import { createAgencyInvitation, revokeAgencyInvitation, acceptAgencyInvitation, InvitationError } from '@/lib/agency-invitations';
import { invitationIdentity } from '@/lib/invitation-identity';

type State = { message: string; success: boolean; path?: string };
function failure(error: unknown): State {
  if (error instanceof InvitationError || error instanceof AgencyAccessError) return { message: error.message, success: false };
  if (error instanceof ZodError) return { message: 'Enter a valid email address and role.', success: false };
  console.error('Invitation operation failed.');
  return { message: 'We couldn’t update this invitation. Please try again.', success: false };
}
export async function createInvitationAction(_state: State, form: FormData): Promise<State> {
  const user = await requireWorkspaceUser();
  try {
    const result = await createAgencyInvitation(getDb(), user.id, { agencyId: form.get('agencyId'), email: form.get('email'), role: form.get('role') });
    revalidatePath('/agency', 'layout');
    return { message: 'Invitation created. Copy the link and share it with the invited person. It expires in 7 days.', success: true, path: `/agency/invitations/${result.token}` };
  } catch (error) { return failure(error); }
}
export async function revokeInvitationAction(_state: State, form: FormData): Promise<State> {
  const user = await requireWorkspaceUser();
  try {
    const agencyId = form.get('agencyId'), id = form.get('invitationId');
    if (typeof agencyId !== 'string' || typeof id !== 'string') throw new InvitationError('Invalid invitation.');
    await revokeAgencyInvitation(getDb(), user.id, agencyId, id);
    revalidatePath('/agency', 'layout');
    return { message: 'Invitation revoked.', success: true };
  } catch (error) { return failure(error); }
}
export async function acceptInvitationAction(_state: State, form: FormData): Promise<State> {
  const user = await requireWorkspaceUser();
  let agencyId: string;
  try {
    const token = form.get('token');
    if (typeof token !== 'string') throw new InvitationError('Invitation unavailable.');
    agencyId = await acceptAgencyInvitation(getDb(), await invitationIdentity(user.id), token);
  } catch (error) { return failure(error); }
  revalidatePath('/agency', 'layout');
  redirect(`/agency/${agencyId}`);
}
