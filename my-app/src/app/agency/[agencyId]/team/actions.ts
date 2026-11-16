'use server';
import { revalidatePath } from 'next/cache';
import { auth } from '@clerk/nextjs/server';
import { ZodError } from 'zod';
import { getDb } from '@/lib/db';
import { changeAgencyMember, TeamConflictError } from '@/lib/agency-team';
import { AgencyAccessError } from '@/lib/agency-access';

export async function changeMemberAction(_state: { message?: string; success?: boolean }, form: FormData) {
  const { userId } = await auth.protect();
  try {
    await changeAgencyMember(getDb(), userId, Object.fromEntries(['agencyId', 'userId', 'version', 'role'].map(key => [key, form.get(key)])));
  } catch (error) {
    if (error instanceof AgencyAccessError || error instanceof TeamConflictError) return { message: error.message, success: false };
    if (error instanceof ZodError) return { message: 'Choose a valid team role.', success: false };
    console.error('Team update failed.');
    return { message: 'We couldn’t update this membership. Please try again.', success: false };
  }
  revalidatePath('/agency', 'layout');
  return { message: 'Team access updated.', success: true };
}
