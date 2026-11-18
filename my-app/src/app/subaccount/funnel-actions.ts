'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getDb } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { AgencyAccessError } from '@/lib/agency-access';
import { createFunnel, mutateFunnel, FunnelConflict } from '@/lib/funnels';

export async function funnelAction(_previous: { message: string }, form: FormData) {
  const user = await requireWorkspaceUser(); let destination: string | undefined;
  try {
    const subAccountId = form.get('subAccountId'); const operation = form.get('operation');
    if (operation === 'create') {
      const funnel = await createFunnel(getDb(), user.id, { subAccountId, name: form.get('name'), creationKey: form.get('creationKey') });
      destination = `/subaccount/${funnel.subAccountId}/funnels/${funnel.id}`;
    } else {
      const fields = operation === 'rename' ? ['name'] : operation === 'create-page' ? ['name', 'path'] : operation === 'edit-page' ? ['pageId', 'name', 'path'] : operation === 'delete-page' ? ['pageId'] : [];
      const raw = form.get('revision');
      await mutateFunnel(getDb(), user.id, { subAccountId, funnelId: form.get('funnelId'), operation, revision: typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN,
        ...Object.fromEntries(fields.map(key => [key, form.get(key)])),
        ...(['delete', 'delete-page'].includes(String(operation)) ? { confirmed: form.get('confirmed') === 'yes' } : {}),
      });
      if (operation === 'delete') destination = `/subaccount/${subAccountId}/funnels`;
    }
  } catch (error) {
    return { message: error instanceof AgencyAccessError || error instanceof FunnelConflict ? error.message : error instanceof ZodError ? 'Check the name, path and confirmation. Paths must use lowercase letters, numbers and hyphens.' : 'This change could not be saved. Please try again.' };
  }
  revalidatePath('/subaccount', 'layout');
  if (destination) redirect(destination);
  return { message: 'Funnel updated.' };
}
