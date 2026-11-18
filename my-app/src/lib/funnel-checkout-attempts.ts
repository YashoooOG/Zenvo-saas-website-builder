import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient, FunnelPage } from '../generated/prisma/client';
import { AgencyAccessError, lockAgencyAccess } from './agency-access';
import { getSubAccountAccess } from './subaccounts';
import { pageOfferSchema } from './page-offers';
import { checkFunnelPrice, type FunnelPriceProvider } from './funnel-price-check';
import { applicationFeeConfiguration } from './application-fees';

export class FunnelCheckoutConflict extends Error {}
const id = z.string().min(1).max(191);
const inputSchema = z.object({ subAccountId: id, funnelId: id, pageId: id, requestId: z.uuid() }).strict();
const lifetimeMs = 30 * 60 * 1000;
export const publicationFingerprint = (page: Pick<FunnelPage, 'publishedAt' | 'publishedContent' | 'publishedOffer'>) =>
  createHash('sha256').update(JSON.stringify([page.publishedAt, page.publishedContent, page.publishedOffer])).digest('hex');

// Internal owner-only preparation service. No public action or provider write is
// exposed here. A prepared attempt is neither a paid order nor a Stripe session.
export async function prepareFunnelCheckout(db: PrismaClient, actorId: string, input: unknown,
  env: Readonly<Record<string, string | undefined>>, factory: (key: string) => FunnelPriceProvider) {
  const data = inputSchema.parse(input);
  const access = await getSubAccountAccess(db, actorId, data.subAccountId);
  if (!access) throw new AgencyAccessError('Page unavailable.');
  const page = await db.funnelPage.findFirst({ where: { id: data.pageId, subAccountId: data.subAccountId, funnelId: data.funnelId } });
  if (!page?.publishedAt || !page.publishedContent || !page.publishedOffer) throw new FunnelCheckoutConflict('Publish a page offer first.');
  const offer = pageOfferSchema.parse(page.publishedOffer);
  const publicationHash = publicationFingerprint(page);
  const configuration = { ...env };

  // Serialize with publishing, revocation, ownership and workspace changes.
  // Provider reads happen between transactions; every condition is checked again.
  const locked = async (price?: Awaited<ReturnType<typeof checkFunnelPrice>>) => db.$transaction(async tx => {
    await tx.$queryRaw`SELECT accountId FROM ConnectAccountSync WHERE accountId = ${offer.accountId} FOR UPDATE`;
    const agency = await lockAgencyAccess(tx, actorId, access.agencyId, 'payments');
    if (!await getSubAccountAccess(tx, actorId, data.subAccountId)) throw new AgencyAccessError('Page unavailable.');
    const current = await tx.funnelPage.findFirst({ where: { id: data.pageId, subAccountId: data.subAccountId, funnelId: data.funnelId } });
    if (!current?.publishedAt || publicationFingerprint(current) !== publicationHash) throw new FunnelCheckoutConflict('The published page changed. Start a new checkout.');
    const ledger = await tx.connectAccountSync.findUnique({ where: { accountId: offer.accountId } });
    if (agency.agency.stripeConnectAccountId !== offer.accountId || ledger?.linkedStartedAt?.toISOString() !== offer.authorizedAt ||
      (ledger.revokedAt && Math.floor(ledger.linkedStartedAt.getTime() / 1000) <= ledger.revokedAt.getTime() / 1000)) {
      throw new FunnelCheckoutConflict('The Stripe connection changed. Reconfigure and publish the offer.');
    }
    const existing = await tx.funnelCheckoutAttempt.findUnique({ where: { actorId_requestId: { actorId, requestId: data.requestId } } });
    if (existing) {
      if (existing.pageId !== data.pageId || existing.subAccountId !== data.subAccountId || existing.funnelId !== data.funnelId ||
        existing.agencyId !== access.agencyId || existing.publicationHash !== publicationHash) throw new FunnelCheckoutConflict('This request belongs to a different publication. Start a new checkout.');
      if (existing.expiresAt.getTime() <= Date.now()) throw new FunnelCheckoutConflict('This checkout attempt expired. Start a new checkout.');
      return existing;
    }
    if (!price) return null;
    return tx.funnelCheckoutAttempt.create({ data: {
      actorId, requestId: data.requestId, agencyId: access.agencyId, subAccountId: data.subAccountId, funnelId: data.funnelId, pageId: data.pageId,
      publicationHash, accountId: offer.accountId, authorizedAt: new Date(offer.authorizedAt), priceId: price.priceId,
      productName: price.productName, currency: price.currency, amount: price.amount, feeAmount: price.feeAmount,
      feeBasisPoints: applicationFeeConfiguration(configuration).basisPoints, taxBehavior: price.taxBehavior,
      idempotencyKey: `funnel_${randomUUID()}`, expiresAt: new Date(Date.now() + lifetimeMs),
    } });
  }, { isolationLevel: 'ReadCommitted' });

  const existing = await locked();
  if (existing) return existing;
  const price = await checkFunnelPrice(db, actorId, { agencyId: access.agencyId, priceId: offer.priceId }, configuration, factory);
  const attempt = await locked(price);
  if (!attempt) throw new FunnelCheckoutConflict('Checkout preparation failed.');
  return attempt;
}
