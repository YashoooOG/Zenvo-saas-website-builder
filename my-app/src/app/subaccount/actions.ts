'use server';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { createSubAccount, updateSubAccount } from '@/lib/subaccounts';
import { AgencyAccessError, AgencyConflictError } from '@/lib/agencies';
export type ClientFormState = { message?: string; success?: boolean; revision?: number };
function failure(error: unknown): ClientFormState {
  if (error instanceof ZodError) return { message: 'Enter a workspace name between 2 and 191 characters and try again.' };
  if (error instanceof AgencyAccessError || error instanceof AgencyConflictError) return { message: error.message };
  console.error('Client workspace operation failed.');
  return { message: 'We couldn’t save this workspace. Please try again.' };
}
export async function createClientAction(_state: ClientFormState, form: FormData): Promise<ClientFormState> {
  await auth.protect();
  let account;
  try {
    const user = await requireWorkspaceUser();
    account = await createSubAccount(getDb(), user.id, { agencyId: form.get('agencyId'), name: form.get('name'), creationKey: form.get('creationKey') });
  } catch (error) { return failure(error); }
  revalidatePath('/agency', 'layout');
  revalidatePath('/subaccount', 'layout');
  redirect(`/subaccount/${account.id}`);
}
export async function updateClientAction(state: ClientFormState, form: FormData): Promise<ClientFormState> {
  await auth.protect();
  let account;
  try {
    const user = await requireWorkspaceUser();
    const revision = form.get('revision');
    const enabled = form.get('enabled');
    account = await updateSubAccount(getDb(), user.id, { agencyId: form.get('agencyId'), id: form.get('id'), name: form.get('name'),
      revision: typeof revision === 'string' && /^\d+$/.test(revision) ? Number(revision) : NaN,
      enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined });
  } catch (error) { return { ...failure(error), revision: state.revision }; }
  revalidatePath('/agency', 'layout');
  revalidatePath('/subaccount', 'layout');
  return { success: true, revision: account.revision, message: account.enabled ? 'Client workspace saved.' : 'Client workspace archived. You can restore it here.' };
}
