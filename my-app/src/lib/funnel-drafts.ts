import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError } from './agency-access';
import { getSubAccountAccess, lockSubAccountWrite } from './subaccounts';
import { FunnelConflict } from './funnels';
import { validateEditorContent } from './editor-content';

const id = z.string().min(1).max(191);
export async function getFunnelDraft(db: PrismaClient, actor: string, subAccountId: string, funnelId: string, pageId: string) {
  const access = await getSubAccountAccess(db, actor, subAccountId);
  if (!access) return null;
  const page = await db.funnelPage.findFirst({ where: { id: pageId, subAccountId, funnelId }, include: { funnel: { select: { name: true, revision: true } } } });
  if (!page) return null;
  return { access, page: { id: page.id, name: page.name, path: page.path, funnelName: page.funnel.name, revision: page.funnel.revision, content: validateEditorContent(page.draftContent) } };
}
export async function saveFunnelDraft(db: PrismaClient, actor: string, input: unknown) {
  const data = z.object({ subAccountId: id, funnelId: id, pageId: id, revision: z.number().int().nonnegative(), content: z.unknown() }).strict().parse(input);
  const content = validateEditorContent(data.content);
  return db.$transaction(async tx => {
    await lockSubAccountWrite(tx, actor, data.subAccountId);
    const page = await tx.funnelPage.findFirst({ where: { id: data.pageId, subAccountId: data.subAccountId, funnelId: data.funnelId }, include: { funnel: true } });
    if (!page) throw new AgencyAccessError('Page unavailable.');
    if (page.funnel.revision !== data.revision) throw new FunnelConflict('This funnel changed in another tab. Your edits are still here; copy any text you need before reloading.');
    // Draft editing never touches the published snapshot or publication timestamp.
    await tx.funnelPage.update({ where: { id: page.id }, data: { draftContent: content } });
    const updated = await tx.funnel.update({ where: { id: data.funnelId }, data: { revision: { increment: 1 } } });
    return updated.revision;
  }, { isolationLevel: 'ReadCommitted' });
}
