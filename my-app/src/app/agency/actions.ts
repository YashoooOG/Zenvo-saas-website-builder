'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { createAgency, updateAgency, AgencyAccessError, AgencyConflictError } from '@/lib/agencies';
import { emptyAgencyValues, type AgencyFormState } from '@/lib/agency-validation';

function fields(formData: FormData) {
  return Object.fromEntries(Object.keys(emptyAgencyValues).map(key => [key, formData.get(key)]));
}
function failure(error: unknown): AgencyFormState {
  if (error instanceof ZodError) return { message: 'Check the highlighted details.', errors: error.flatten().fieldErrors };
  if (error instanceof AgencyAccessError || error instanceof AgencyConflictError) return { message: error.message };
  console.error('Agency operation failed.');
  return { message: 'We couldn’t save your agency. Please try again.' };
}

export async function createAgencyAction(_previous: AgencyFormState, formData: FormData): Promise<AgencyFormState> {
  await auth.protect();
  let id: string;
  try {
    const user = await requireWorkspaceUser();
    const agency = await createAgency(getDb(), user.id, { ...fields(formData), creationKey: formData.get('creationKey') });
    id = agency.id;
  } catch (error) { return failure(error); }
  revalidatePath('/agency', 'layout');
  redirect(`/agency/${id}/launchpad`);
}

export async function updateAgencyAction(previous: AgencyFormState, formData: FormData): Promise<AgencyFormState> {
  await auth.protect();
  let agency;
  try {
    const user = await requireWorkspaceUser();
    const rawRevision = formData.get('revision');
    agency = await updateAgency(getDb(), user.id, {
      ...fields(formData), id: formData.get('id'),
      revision: typeof rawRevision === 'string' && /^\d+$/.test(rawRevision) ? Number(rawRevision) : NaN,
    });
  } catch (error) { return { ...failure(error), revision: previous.revision }; }
  revalidatePath('/agency', 'layout');
  revalidatePath(`/agency/${agency.id}/settings`);
  return { success: true, message: 'Agency details saved.', revision: agency.revision };
}
