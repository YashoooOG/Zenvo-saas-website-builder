import { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { lockSubAccountWrite } from './subaccounts';
import { AgencyAccessError } from './agency-access';
import { FunnelConflict } from './funnels';
import { editorMediaIds, validateEditorContent } from './editor-content';
import { resolveHost } from './tenant-routing';
import { pageOfferSchema } from './page-offers';
import { getAgencyAccess } from './agency-access';

const schema = z.object({ subAccountId: z.string().min(1).max(191), funnelId: z.string().min(1).max(191), pageId: z.string().min(1).max(191), revision: z.number().int().nonnegative(), operation: z.enum(['publish', 'unpublish']), subdomain: z.string().trim().toLowerCase().max(63), confirmed: z.literal(true) }).strict();
export async function publishFunnelPage(db: PrismaClient, actor: string, input: unknown) {
  const data = schema.parse(input);
  if (data.operation === 'publish' && resolveHost(`${data.subdomain}.example.test`, 'example.test').kind !== 'tenant') throw new FunnelConflict('Choose an available subdomain using letters, numbers and hyphens.');
  try {
    return await db.$transaction(async tx => {
      await lockSubAccountWrite(tx, actor, data.subAccountId);
      const account = await tx.subAccount.findUniqueOrThrow({ where: { id: data.subAccountId } });
      const page = await tx.funnelPage.findFirst({ where: { id: data.pageId, subAccountId: data.subAccountId, funnelId: data.funnelId }, include: { funnel: true } });
      if (!page) throw new AgencyAccessError('Page unavailable.');
      if (page.funnel.revision !== data.revision) throw new FunnelConflict('This funnel changed. Reload before publishing.');
      if (data.operation === 'publish') {
        if ((page.draftOffer || page.publishedOffer) && !await getAgencyAccess(tx, actor, account.agencyId, 'payments')) throw new AgencyAccessError('Only the agency owner can publish changes to a page offer.');
        if (page.draftOffer) {
          const offer = pageOfferSchema.parse(page.draftOffer);
          const agency = await tx.agency.findUniqueOrThrow({ where: { id: account.agencyId } });
          const ledger = await tx.connectAccountSync.findUnique({ where: { accountId: offer.accountId } });
          if (agency.stripeConnectAccountId !== offer.accountId || ledger?.linkedStartedAt?.toISOString() !== offer.authorizedAt || (ledger.revokedAt && Math.floor(ledger.linkedStartedAt.getTime() / 1000) <= ledger.revokedAt.getTime() / 1000)) throw new FunnelConflict('The offer’s Stripe connection changed. Reconfigure the offer before publishing.');
        }
        if (account.subdomain && account.subdomain !== data.subdomain) throw new FunnelConflict(`This workspace already uses ${account.subdomain}. Use that subdomain for all its pages.`);
        const content = validateEditorContent(page.draftContent);
        const ids = editorMediaIds(content);
        const media = await tx.media.findMany({ where: { id: { in: ids }, subAccountId: data.subAccountId, mimeType: 'image/webp' } });
        if (media.length !== ids.length || media.some(item => { try { const url = new URL(item.url); return url.protocol !== 'https:' || !!url.username || !!url.password; } catch { return true; } })) throw new FunnelConflict('Replace unavailable images before publishing.');
        await tx.subAccount.update({ where: { id: data.subAccountId }, data: { subdomain: data.subdomain } });
        await tx.funnelPage.update({ where: { id: page.id }, data: { publishedContent: content, publishedOffer: page.draftOffer ?? Prisma.DbNull, publishedAt: new Date() } });
      } else await tx.funnelPage.update({ where: { id: page.id }, data: { publishedContent: Prisma.DbNull, publishedOffer: Prisma.DbNull, publishedAt: null } });
      await tx.funnel.update({ where: { id: data.funnelId }, data: { revision: { increment: 1 } } });
      return account.subdomain ?? data.subdomain;
    }, { isolationLevel: 'ReadCommitted' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new FunnelConflict('That subdomain is already in use.');
    throw error;
  }
}

export async function loadPublishedPage(db: PrismaClient, subdomain: string, path: string) {
  if (resolveHost(`${subdomain}.example.test`, 'example.test').kind !== 'tenant') return null;
  const page = await db.funnelPage.findFirst({ where: { path, publishedAt: { not: null }, funnel: { subAccount: { subdomain, enabled: true, agency: { owner: { deletedAt: null } } } } } });
  if (!page?.publishedContent) return null;
  const content = validateEditorContent(page.publishedContent);
  const media = await db.media.findMany({ where: { subAccountId: page.subAccountId, id: { in: editorMediaIds(content) }, mimeType: 'image/webp' }, select: { id: true, name: true, url: true } });
  return { name: page.name, content, media: media.filter(item => { try { const url = new URL(item.url); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } }) };
}
