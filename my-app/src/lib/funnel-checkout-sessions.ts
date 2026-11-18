import { z } from 'zod';
import type Stripe from 'stripe';
import type { Prisma, PrismaClient, FunnelCheckoutAttempt } from '../generated/prisma/client';
import { AgencyAccessError, lockAgencyAccess } from './agency-access';
import { getSubAccountAccess } from './subaccounts';
import { connectConfiguration } from './agency-payments';
import { checkFunnelPrice, type FunnelPriceProvider } from './funnel-price-check';
import { publicationFingerprint } from './funnel-checkout-attempts';

export class FunnelSessionError extends Error {}
export interface FunnelSessionProvider extends FunnelPriceProvider {
  createSession(accountId: string, parameters: Stripe.Checkout.SessionCreateParams, key: string): Promise<unknown>;
  getSession(accountId: string, sessionId: string): Promise<unknown>;
}
const transactionOptions = { isolationLevel: 'ReadCommitted' as const, maxWait: 5000, timeout: 30000 };

export function funnelSessionParameters(attempt: FunnelCheckoutAttempt, origin: string): Stripe.Checkout.SessionCreateParams {
  const returnUrl = `${origin}/subaccount/${encodeURIComponent(attempt.subAccountId)}/funnels/${encodeURIComponent(attempt.funnelId)}`;
  const metadata = { zenvoAttemptId: attempt.id, zenvoAgencyId: attempt.agencyId };
  return {
    mode: 'payment', allowed_payment_method_types: ['card'],
    line_items: [{ price: attempt.priceId, quantity: 1 }],
    client_reference_id: attempt.id, metadata,
    payment_intent_data: { metadata, ...(attempt.feeAmount ? { application_fee_amount: attempt.feeAmount } : {}) },
    automatic_tax: { enabled: false }, adaptive_pricing: { enabled: false }, allow_promotion_codes: false,
    success_url: returnUrl, cancel_url: returnUrl,
    expires_at: Math.floor(Date.now() / 1000) + 3600, expand: ['line_items'],
  };
}

async function lockEligibleAttempt(tx: Prisma.TransactionClient, actorId: string, attemptId: string) {
  const candidate = await tx.funnelCheckoutAttempt.findUnique({ where: { id: attemptId } });
  if (!candidate || candidate.actorId !== actorId) throw new AgencyAccessError('Checkout unavailable.');
  await tx.$queryRaw`SELECT accountId FROM ConnectAccountSync WHERE accountId = ${candidate.accountId} FOR UPDATE`;
  const access = await lockAgencyAccess(tx, actorId, candidate.agencyId, 'payments');
  const sub = await getSubAccountAccess(tx, actorId, candidate.subAccountId);
  const ledger = await tx.connectAccountSync.findUnique({ where: { accountId: candidate.accountId } });
  const page = await tx.funnelPage.findFirst({ where: { id: candidate.pageId, funnelId: candidate.funnelId, subAccountId: candidate.subAccountId } });
  if (!sub || sub.agencyId !== candidate.agencyId || !page?.publishedAt || publicationFingerprint(page) !== candidate.publicationHash ||
    access.agency.stripeConnectAccountId !== candidate.accountId || ledger?.linkedStartedAt?.getTime() !== candidate.authorizedAt.getTime() ||
    (ledger.revokedAt && Math.floor(candidate.authorizedAt.getTime() / 1000) <= ledger.revokedAt.getTime() / 1000)) {
    throw new FunnelSessionError('The page, access or Stripe connection changed. Checkout is unavailable.');
  }
  const current = await tx.funnelCheckoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  if (current.sessionStatus === 'review') throw new FunnelSessionError('This attempt needs session recovery before checkout can resume.');
  if (current.expiresAt.getTime() <= Date.now()) throw new FunnelSessionError('The attempt expired. Any pending session needs reconciliation before retrying.');
  return current;
}

const sessionSchema = z.object({
  id: z.string().max(191).regex(/^cs_test_[A-Za-z0-9]+$/), livemode: z.literal(false), mode: z.literal('payment'),
  status: z.enum(['open', 'complete', 'expired']), url: z.string().nullable(),
  client_reference_id: z.string(), metadata: z.object({ zenvoAttemptId: z.string(), zenvoAgencyId: z.string() }),
  currency: z.string(), amount_subtotal: z.number().int(), amount_total: z.number().int(), expires_at: z.number().int(),
  automatic_tax: z.object({ enabled: z.literal(false) }),
  total_details: z.object({ amount_discount: z.literal(0), amount_shipping: z.literal(0), amount_tax: z.literal(0) }),
  line_items: z.object({ has_more: z.literal(false), data: z.array(z.object({ quantity: z.literal(1), price: z.object({ id: z.string() }) })).length(1) }),
});
export function verifyFunnelSession(raw: unknown, attempt: FunnelCheckoutAttempt, parameters: Stripe.Checkout.SessionCreateParams, redirect = true) {
  const session = sessionSchema.parse(raw);
  if ((attempt.sessionId && session.id !== attempt.sessionId) || session.client_reference_id !== attempt.id ||
    session.metadata.zenvoAttemptId !== attempt.id || session.metadata.zenvoAgencyId !== attempt.agencyId ||
    session.currency !== attempt.currency || session.amount_total !== attempt.amount || session.amount_subtotal !== attempt.amount ||
    session.line_items.data[0].price.id !== attempt.priceId || session.expires_at !== parameters.expires_at) throw new FunnelSessionError('Checkout could not be verified.');
  let url: string | null = null;
  if (session.status === 'open' && redirect) {
    if (!session.url || session.expires_at <= Date.now() / 1000) throw new FunnelSessionError('Checkout could not be verified.');
    const parsed = new URL(session.url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'checkout.stripe.com' || parsed.port || parsed.username || parsed.password) throw new FunnelSessionError('Checkout could not be verified.');
    url = parsed.href;
  }
  return { session, url };
}

// Internal owner-only test-mode service. Returning COMPLETE never grants access:
// verified Connect payment events will supply payment truth in a later checkpoint.
export async function startFunnelSession(db: PrismaClient, actorId: string, input: unknown,
  env: Readonly<Record<string, string | undefined>>, factory: (key: string) => FunnelSessionProvider) {
  const { attemptId } = z.object({ attemptId: z.uuid() }).strict().parse(input);
  const configuration = { ...env };
  const attempt = await db.$transaction(tx => lockEligibleAttempt(tx, actorId, attemptId), transactionOptions);
  const config = connectConfiguration(configuration);
  const origin = new URL(config.callbackUrl).origin;
  const provider = factory(config.key);
  // Verify price/account again before the first external write. An ambiguous retry
  // uses its original request even if catalog availability has since changed.
  if (!attempt.sessionRequest) {
    const price = await checkFunnelPrice(db, actorId, { agencyId: attempt.agencyId, priceId: attempt.priceId },
      { ...configuration, ZENVO_APPLICATION_FEE_BPS: String(attempt.feeBasisPoints) }, () => provider);
    if (price.amount !== attempt.amount || price.currency !== attempt.currency || price.feeAmount !== attempt.feeAmount || price.taxBehavior !== attempt.taxBehavior) throw new FunnelSessionError('The verified price changed. Prepare a new attempt.');
  }
  // Commit the complete request before Stripe can observe it. Rollback after a
  // timeout must never erase parameters or cause a new idempotency key.
  await db.$transaction(async tx => {
    const current = await lockEligibleAttempt(tx, actorId, attemptId);
    if (!current.sessionRequest) await tx.funnelCheckoutAttempt.update({ where: { id: attemptId }, data: {
      sessionRequest: JSON.parse(JSON.stringify(funnelSessionParameters(current, origin))), sessionStatus: 'requested',
    } });
  }, transactionOptions);
  try {
    // Bounded provider calls hold the same locks as publishing/revocation so a
    // concurrent tenant change cannot authorize a session from stale state.
    return await db.$transaction(async tx => {
      const current = await lockEligibleAttempt(tx, actorId, attemptId);
      const parameters = current.sessionRequest as unknown as Stripe.Checkout.SessionCreateParams;
      const raw = current.sessionId ? await provider.getSession(current.accountId, current.sessionId) :
        await provider.createSession(current.accountId, parameters, current.idempotencyKey);
      const { session, url } = verifyFunnelSession(raw, current, parameters);
      await tx.funnelCheckoutAttempt.update({ where: { id: attemptId }, data: { sessionId: session.id, sessionStatus: session.status } });
      return { status: session.status, url };
    }, transactionOptions);
  } catch (error) {
    if (error instanceof AgencyAccessError || error instanceof FunnelSessionError) throw error;
    throw new FunnelSessionError('Checkout could not be confirmed. Retry this same attempt; do not create a replacement.');
  }
}
