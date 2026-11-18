import { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, getAgencyAccess, lockAgencyAccess } from './agency-access';
import { getSubAccountAccess } from './subaccounts';
import { getConnectedCatalog } from './connected-catalog';
import { FunnelConflict } from './funnels';

export const pageOfferSchema = z.object({ version: z.literal(1), accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/), priceId: z.string().regex(/^price_[A-Za-z0-9]+$/), authorizedAt: z.iso.datetime() }).strict();
export async function pageOfferOptions(db: PrismaClient, actor: string, subAccountId: string, funnelId: string) {
  const access = await getSubAccountAccess(db, actor, subAccountId);
  if (!access || !await getAgencyAccess(db, actor, access.agencyId, 'payments')) return null;
  const catalog = await getConnectedCatalog(db, actor, access.agencyId);
  const pages = await db.funnelPage.findMany({ where: { subAccountId, funnelId }, select: { id: true, draftOffer: true, publishedOffer: true } });
  return { prices: catalog?.products.flatMap(product => product.active ? product.prices.filter(price => price.active && price.supported).map(price => ({ id: price.id, label: `${product.name} · ${price.currency.toUpperCase()} · ${price.id}` })) : []) ?? [],
    pages: pages.map(page => ({ id: page.id, draft: page.draftOffer ? pageOfferSchema.parse(page.draftOffer) : null, published: page.publishedOffer ? pageOfferSchema.parse(page.publishedOffer) : null })) };
}

export async function setPageOffer(db: PrismaClient, actor: string, input: unknown) {
  const id = z.string().min(1).max(191);
  const data = z.object({ subAccountId: id, funnelId: id, pageId: id, revision: z.number().int().nonnegative(), priceId: z.union([z.literal(''), z.string().max(191).regex(/^price_[A-Za-z0-9]+$/)]) }).strict().parse(input);
  const access = await getSubAccountAccess(db, actor, data.subAccountId);
  if (!access) throw new AgencyAccessError('Page unavailable.');
  const agency = await getAgencyAccess(db, actor, access.agencyId, 'payments');
  if (!agency) throw new AgencyAccessError('Only the agency owner can configure page offers.');
  const accountId = agency.agency.stripeConnectAccountId;
  return db.$transaction(async tx => {
    if (accountId) await tx.$queryRaw`SELECT accountId FROM ConnectAccountSync WHERE accountId = ${accountId} FOR UPDATE`;
    const current = await lockAgencyAccess(tx, actor, access.agencyId, 'payments');
    if (!await getSubAccountAccess(tx, actor, data.subAccountId)) throw new AgencyAccessError('Page unavailable.');
    const page = await tx.funnelPage.findFirst({ where: { id: data.pageId, subAccountId: data.subAccountId, funnelId: data.funnelId }, include: { funnel: true } });
    if (!page) throw new AgencyAccessError('Page unavailable.');
    if (page.funnel.revision !== data.revision) throw new FunnelConflict('This funnel changed. Reload before changing the offer.');
    let offer: z.infer<typeof pageOfferSchema> | null = null;
    if (data.priceId) {
      if (!accountId || current.agency.stripeConnectAccountId !== accountId) throw new FunnelConflict('Connect your Stripe account and synchronize its catalog first.');
      const ledger = await tx.connectAccountSync.findUnique({ where: { accountId } });
      if (!ledger?.linkedStartedAt || (ledger.revokedAt && Math.floor(ledger.linkedStartedAt.getTime() / 1000) <= ledger.revokedAt.getTime() / 1000)) throw new FunnelConflict('Authorize the Stripe account again before configuring an offer.');
      const catalog = await tx.agencyCatalog.findUnique({ where: { agencyId: access.agencyId } });
      const products = z.array(z.object({ active: z.boolean(), prices: z.array(z.object({ id: z.string(), active: z.boolean(), supported: z.boolean() })) })).parse(catalog?.products ?? []);
      if (!catalog?.syncedAt || catalog.accountId !== accountId || !products.some(product => product.active && product.prices.some(price => price.id === data.priceId && price.active && price.supported))) throw new FunnelConflict('Choose a supported price from the current connected catalog.');
      offer = { version: 1, accountId, priceId: data.priceId, authorizedAt: ledger.linkedStartedAt.toISOString() };
    }
    await tx.funnelPage.update({ where: { id: page.id }, data: { draftOffer: offer ?? Prisma.DbNull } });
    await tx.funnel.update({ where: { id: data.funnelId }, data: { revision: { increment: 1 } } });
  }, { isolationLevel: 'ReadCommitted' });
}
