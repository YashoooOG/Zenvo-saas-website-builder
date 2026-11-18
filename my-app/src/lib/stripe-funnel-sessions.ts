import 'server-only';
import Stripe from 'stripe';
import type { FunnelSessionProvider } from './funnel-checkout-sessions';
import type { FunnelRecoveryProvider } from './funnel-session-recovery';

export function stripeFunnelRecoveryProvider(key: string): FunnelRecoveryProvider {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return {
    listSessions: (accountId, from, to) => stripe.checkout.sessions.list({ limit: 100, created: { gte: from, lte: to } }, { stripeAccount: accountId }),
    getSession: (accountId, sessionId) => stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] }, { stripeAccount: accountId }),
    expireSession: (accountId, sessionId, idempotencyKey) => stripe.checkout.sessions.expire(sessionId, {}, { stripeAccount: accountId, idempotencyKey }),
  };
}

export function stripeFunnelSessionProvider(key: string): FunnelSessionProvider {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return {
    account: id => stripe.accounts.retrieve(id),
    price: (accountId, priceId) => stripe.prices.retrieve(priceId, { expand: ['product'] }, { stripeAccount: accountId }),
    createSession: (accountId, parameters, idempotencyKey) => stripe.checkout.sessions.create(parameters, { stripeAccount: accountId, idempotencyKey }),
    getSession: (accountId, sessionId) => stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] }, { stripeAccount: accountId }),
  };
}
