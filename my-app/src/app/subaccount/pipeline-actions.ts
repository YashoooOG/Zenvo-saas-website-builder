'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getDb } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { AgencyAccessError } from '@/lib/agency-access';
import { createPipeline, mutatePipeline, PipelineConflict } from '@/lib/pipelines';
export type BoardState = { message: string; success: boolean };
function failure(error: unknown): BoardState {
  if (error instanceof AgencyAccessError || error instanceof PipelineConflict) return { message: error.message, success: false };
  if (error instanceof ZodError) return { message: error.issues.some(issue => issue.path.includes('value')) ? 'Use a non-negative value with at most 15 whole digits and 4 decimal places.' : error.issues.some(issue => issue.path.includes('email')) ? 'Enter a valid email address or leave it empty.' : 'Use 2–191 characters for names and titles, and no more than 5,000 for descriptions.', success: false };
  console.error('Pipeline operation failed.');
  return { message: 'We couldn’t save this board change. Please try again.', success: false };
}
export async function createPipelineAction(_state: BoardState, form: FormData): Promise<BoardState> {
  const user = await requireWorkspaceUser();
  let pipeline;
  try { pipeline = await createPipeline(getDb(), user.id, { subAccountId: form.get('subAccountId'), name: form.get('name'), creationKey: form.get('creationKey') }); }
  catch (error) { return failure(error); }
  revalidatePath('/subaccount', 'layout');
  redirect(`/subaccount/${pipeline.subAccountId}/pipelines/${pipeline.id}`);
}
export async function mutatePipelineAction(_state: BoardState, form: FormData): Promise<BoardState> {
  const user = await requireWorkspaceUser();
  const rawRevision = form.get('revision');
  const operation = form.get('operation');
  const fields = operation === 'create-contact' ? ['name','email'] : operation === 'rename-board' || operation === 'add-lane' ? ['name'] : operation === 'move-lane' ? ['laneId','direction'] : operation === 'delete-lane' ? ['laneId'] : operation === 'rename-lane' ? ['laneId','name'] : operation === 'create-ticket' ? ['laneId','title','description'] : operation === 'edit-ticket' ? ['ticketId','title','description'] : operation === 'delete-ticket' ? ['ticketId'] : operation === 'place-ticket' ? ['ticketId','laneId'] : ['ticketId','laneId','direction'];
  const removal = operation === 'delete-ticket' || operation === 'delete-lane';
  try {
    if (removal && form.get('confirmed') !== 'yes') throw new PipelineConflict('Confirm removal before continuing.');
    await mutatePipeline(getDb(), user.id, { subAccountId: form.get('subAccountId'), pipelineId: form.get('pipelineId'), revision: typeof rawRevision === 'string' && /^\d+$/.test(rawRevision) ? Number(rawRevision) : NaN,
      operation, ...Object.fromEntries(fields.map(key => [key, form.get(key)])),
      ...(operation === 'edit-ticket' ? { contactId: form.get('contactId') || null, value: form.get('value') } : {}),
      ...(operation === 'place-ticket' ? { beforeTicketId: form.get('beforeTicketId') || null } : {}),
      ...(removal ? { confirmed: true } : {}) });
  } catch (error) { return failure(error); }
  revalidatePath('/subaccount', 'layout');
  return { message: 'Board updated.', success: true };
}
