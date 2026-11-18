'use server';
import { revalidatePath } from 'next/cache';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { AgencyAccessError } from '@/lib/agency-access';
import { FunnelConflict } from '@/lib/funnels';
import { saveFunnelDraft } from '@/lib/funnel-drafts';

export async function saveDraftAction(input: unknown): Promise<{ success: true; revision: number } | { success: false; message: string }> {
  const user = await requireWorkspaceUser();
  try {
    const revision = await saveFunnelDraft(getDb(), user.id, input);
    revalidatePath('/subaccount', 'layout');
    return { success: true, revision };
  } catch (error) {
    return { success: false, message: error instanceof AgencyAccessError || error instanceof FunnelConflict ? error.message : 'The draft could not be saved. Check its size and structure, then try again. Your edits are still here.' };
  }
}
