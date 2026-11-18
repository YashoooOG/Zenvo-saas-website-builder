import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError } from './agency-access';
import { getSubAccountAccess, lockSubAccountWrite } from './subaccounts';
import { emptyEditorContent } from './editor-content';

export class FunnelConflict extends Error {}
const id = z.string().min(1).max(191);
const name = z.string().trim().min(2).max(191);
const path = z.string().trim().toLowerCase().max(191).regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/, 'Use / or a lowercase path such as /contact.').refine(value => !['api', 'agency', 'subaccount', 'sign-in', 'sign-up', '_next'].includes(value.split('/')[1]), 'This path is reserved.');
const scope = z.object({ subAccountId: id, funnelId: id, revision: z.number().int().nonnegative() });
const mutation = z.discriminatedUnion('operation', [
  scope.extend({ operation: z.literal('rename'), name }).strict(),
  scope.extend({ operation: z.literal('create-page'), name, path }).strict(),
  scope.extend({ operation: z.literal('edit-page'), pageId: id, name, path }).strict(),
  scope.extend({ operation: z.literal('delete-page'), pageId: id, confirmed: z.literal(true) }).strict(),
  scope.extend({ operation: z.literal('delete'), confirmed: z.literal(true) }).strict(),
]);
export async function listFunnels(db: PrismaClient, actor: string, subAccountId: string) {
  const access = await getSubAccountAccess(db, actor, subAccountId);
  if (!access) return null;
  return { access, funnels: await db.funnel.findMany({ where: { subAccountId }, include: { _count: { select: { pages: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) };
}
export async function getFunnel(db: PrismaClient, actor: string, subAccountId: string, funnelId: string) {
  const access = await getSubAccountAccess(db, actor, subAccountId);
  if (!access) return null;
  const funnel = await db.funnel.findFirst({ where: { id: funnelId, subAccountId }, include: { pages: { select: { id: true, name: true, path: true, publishedAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });
  const site = await db.subAccount.findUnique({ where: { id: subAccountId }, select: { subdomain: true } });
  return funnel ? { access, funnel, subdomain: site?.subdomain ?? null } : null;
}
export async function createFunnel(db: PrismaClient, actor: string, input: unknown) {
  const data = z.object({ subAccountId: id, name, creationKey: z.uuid() }).strict().parse(input);
  return db.$transaction(async tx => {
    await lockSubAccountWrite(tx, actor, data.subAccountId);
    const existing = await tx.funnel.findUnique({ where: { subAccountId_creationKey: { subAccountId: data.subAccountId, creationKey: data.creationKey } } });
    if (existing) return existing;
    return tx.funnel.create({ data });
  }, { isolationLevel: 'ReadCommitted' });
}
export async function mutateFunnel(db: PrismaClient, actor: string, input: unknown) {
  const data = mutation.parse(input);
  return db.$transaction(async tx => {
    await lockSubAccountWrite(tx, actor, data.subAccountId);
    const funnel = await tx.funnel.findFirst({ where: { id: data.funnelId, subAccountId: data.subAccountId } });
    if (!funnel) throw new AgencyAccessError('Funnel unavailable.');
    if (funnel.revision !== data.revision) throw new FunnelConflict('This funnel changed in another tab. Reload before trying again.');
    if (data.operation === 'delete') {
      if (await tx.funnelPage.count({ where: { funnelId: funnel.id } })) throw new FunnelConflict('Remove draft pages before deleting this funnel. Published pages cannot be removed here.');
      await tx.funnel.delete({ where: { id: funnel.id } }); return;
    }
    if (data.operation === 'rename') await tx.funnel.update({ where: { id: funnel.id }, data: { name: data.name } });
    else {
      const page = data.operation !== 'create-page' ? await tx.funnelPage.findFirst({ where: { id: data.pageId, subAccountId: data.subAccountId, funnelId: funnel.id } }) : null;
      if (data.operation !== 'create-page' && !page) throw new AgencyAccessError('Page unavailable.');
      if (page?.publishedAt || page?.publishedContent !== null && page !== null) throw new FunnelConflict('Published pages cannot be changed here yet.');
      if (data.operation === 'delete-page') await tx.funnelPage.delete({ where: { id: page!.id } });
      else {
        if (await tx.funnelPage.findFirst({ where: { subAccountId: data.subAccountId, path: data.path, ...(page ? { id: { not: page.id } } : {}) } })) throw new FunnelConflict('That path is already used in this workspace.');
        if (data.operation === 'create-page') await tx.funnelPage.create({ data: { subAccountId: data.subAccountId, funnelId: funnel.id, name: data.name, path: data.path, draftContent: emptyEditorContent() } });
        else await tx.funnelPage.update({ where: { id: page!.id }, data: { name: data.name, path: data.path } });
      }
    }
    await tx.funnel.update({ where: { id: funnel.id }, data: { revision: { increment: 1 } } });
  }, { isolationLevel: 'ReadCommitted' });
}
