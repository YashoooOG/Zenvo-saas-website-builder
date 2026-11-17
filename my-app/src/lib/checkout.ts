import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, getAgencyAccess, lockAgencyAccess } from './agency-access';
import { billingConfiguration, validateBillingPlan } from './billing-plan';

export class CheckoutError extends Error {}
export function checkoutConfiguration(env: Readonly<Record<string, string | undefined>>) {
  const config = billingConfiguration(env);
  if (!env.STRIPE_WEBHOOK_SECRET?.trim().startsWith('whsec_')) throw new CheckoutError('Checkout is not configured yet.');
  let url: URL;
  try { url = new URL(env.ZENVO_APP_URL ?? ''); } catch { throw new CheckoutError('Checkout is not configured yet.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new CheckoutError('Checkout is not configured yet.');
  return { ...config, origin: url.origin };
}

export type CheckoutSession = { id: string; customer: string; subscription: string | null; livemode: boolean; mode: string; status: string | null; url: string | null; metadata: Record<string, string> | null; expires_at: number };
export type CheckoutInput = { agencyId: string; customerId: string; priceId: string; origin: string; expiresAt: number };
export function checkoutSessionParameters(input: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  const billingUrl = `${input.origin}/agency/${encodeURIComponent(input.agencyId)}/billing`;
  return {
    mode: 'subscription', customer: input.customerId, allowed_payment_method_types: ['card'],
    line_items: [{ price: input.priceId, quantity: 1 }],
    metadata: { zenvoAgencyId: input.agencyId }, subscription_data: { metadata: { zenvoAgencyId: input.agencyId } },
    success_url: billingUrl, cancel_url: billingUrl, expires_at: input.expiresAt,
  };
}
export interface CheckoutProvider {
  price(id: string): Promise<Stripe.Price>;
  createCustomer(agencyId: string, key: string): Promise<{ id: string; livemode: boolean; metadata: Record<string, string> }>;
  hasSubscription(customerId: string): Promise<boolean>;
  createSession(input: CheckoutInput, key: string): Promise<CheckoutSession>;
  getSession(id: string): Promise<CheckoutSession>;
}
const transactionOptions = { maxWait: 5000, timeout: 40000, isolationLevel: 'ReadCommitted' as const };
const retryWindowMs = 23 * 60 * 60 * 1000;
const recoveryMessage = 'Checkout needs a billing review before it can be retried. Please contact support.';

export function checkoutRedirect(session: CheckoutSession, customerId: string, agencyId: string) {
  if (!/^cs_test_[A-Za-z0-9]+$/.test(session.id) || session.livemode || session.mode !== 'subscription' || session.customer !== customerId || session.metadata?.zenvoAgencyId !== agencyId) throw new CheckoutError('Checkout could not be verified.');
  if (session.status !== 'open') return null;
  if (!session.url) throw new CheckoutError('Checkout could not be verified.');
  const url = new URL(session.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port || url.username || url.password) throw new CheckoutError('Checkout could not be verified.');
  return url.href;
}

export async function startAgencyCheckout(db: PrismaClient, actorId: string, agencyId: string, env: Readonly<Record<string, string | undefined>>, provider: CheckoutProvider) {
  if (!await getAgencyAccess(db, actorId, agencyId, 'billing')) throw new AgencyAccessError('Agency unavailable.');
  const config = checkoutConfiguration(env);
  validateBillingPlan(await provider.price(config.priceId), config.priceId);
  // Persist recovery keys BEFORE external writes. Rollback or a lost response must
  // never cause a new key to create a second customer or checkout session.
  await db.$transaction(async tx => {
    await lockAgencyAccess(tx, actorId, agencyId, 'billing');
    await tx.agencyCheckout.upsert({ where: { agencyId }, create: { agencyId, customerKey: randomUUID() }, update: {} });
  }, transactionOptions);
  const customerId = await db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, agencyId, 'billing');
    if (agency.stripeCustomerId) return agency.stripeCustomerId;
    const state = await tx.agencyCheckout.findUniqueOrThrow({ where: { agencyId } });
    if (Date.now() - state.customerStartedAt.getTime() >= retryWindowMs) throw new CheckoutError(recoveryMessage);
    const customer = await provider.createCustomer(agencyId, `zenvo-customer-${state.customerKey}`);
    if (!/^cus_[A-Za-z0-9]+$/.test(customer.id) || customer.livemode || customer.metadata.zenvoAgencyId !== agencyId) throw new CheckoutError('Customer could not be verified.');
    await tx.agency.update({ where: { id: agencyId }, data: { stripeCustomerId: customer.id } });
    return customer.id;
  }, transactionOptions);
  // Commit the customer mapping before a session can emit subscription webhooks.
  await db.$transaction(async tx => {
    await lockAgencyAccess(tx, actorId, agencyId, 'billing');
    const state = await tx.agencyCheckout.findUniqueOrThrow({ where: { agencyId } });
    if (!state.attemptKey) await tx.agencyCheckout.update({ where: { agencyId }, data: { attemptKey: randomUUID(), attemptStartedAt: new Date(), priceId: config.priceId, origin: config.origin, expiresAt: Math.floor(Date.now() / 1000) + 3600 } });
  }, transactionOptions);
  const result = await db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, agencyId, 'billing');
    if (agency.stripeCustomerId !== customerId) throw new CheckoutError('Customer mapping changed. Please retry.');
    const state = await tx.agencyCheckout.findUniqueOrThrow({ where: { agencyId } });
    if (await provider.hasSubscription(customerId)) throw new CheckoutError('This agency already has a subscription. Review its status before starting another.');
    if (!state.attemptKey || !state.attemptStartedAt || !state.priceId || !state.origin || !state.expiresAt) throw new CheckoutError(recoveryMessage);
    if (!state.sessionId && Date.now() - state.attemptStartedAt.getTime() >= retryWindowMs) throw new CheckoutError(recoveryMessage);
    if (!state.sessionId && (state.priceId !== config.priceId || state.origin !== config.origin)) throw new CheckoutError(recoveryMessage);
    const session = state.sessionId ? await provider.getSession(state.sessionId) : await provider.createSession({ agencyId, customerId, priceId: state.priceId, origin: state.origin, expiresAt: state.expiresAt }, `zenvo-checkout-${state.attemptKey}`);
    const url = checkoutRedirect(session, customerId, agencyId);
    if (state.sessionId && session.id !== state.sessionId) throw new CheckoutError('Checkout could not be verified.');
    if (session.status === 'complete') {
      const previous = session.subscription ? await tx.agencySubscription.findUnique({ where: { id: session.subscription } }) : null;
      if (!previous || previous.agencyId !== agencyId || !['canceled', 'incomplete_expired'].includes(previous.status)) throw new CheckoutError('Checkout completed. Wait for Stripe to confirm the subscription status before trying again.');
    }
    if (session.status === 'expired' || session.status === 'complete') {
      await tx.agencyCheckout.update({ where: { agencyId }, data: { attemptKey: null, attemptStartedAt: null, priceId: null, origin: null, expiresAt: null, sessionId: null } });
      return null;
    }
    if (!url || session.expires_at <= Date.now() / 1000) throw new CheckoutError('Checkout is expiring. Please try again shortly.');
    if (state.priceId !== config.priceId || state.origin !== config.origin) throw new CheckoutError('Billing configuration changed. Wait for the previous checkout to expire before retrying.');
    await tx.agencyCheckout.update({ where: { agencyId }, data: { sessionId: session.id } });
    return url;
  }, transactionOptions);
  if (!result) throw new CheckoutError('The previous checkout has ended. Please try again to start a new one.');
  return result;
}
