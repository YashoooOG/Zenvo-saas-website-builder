import 'server-only';
import Stripe from 'stripe';
import type { FunnelSessionProvider } from './funnel-checkout-sessions';

export function stripeFunnelSessionProvider(key: string): FunnelSessionProvider {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return {
    account: id => stripe.accounts.retrieve(id),
    price: (accountId, priceId) => stripe.prices.retrieve(priceId, { expand: ['product'] }, { stripeAccount: accountId }),
    createSession: (accountId, parameters, idempotencyKey) => stripe.checkout.sessions.create(parameters, { stripeAccount: accountId, idempotencyKey }),
    getSession: (accountId, sessionId) => stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] }, { stripeAccount: accountId }),
  };
}
