import 'server-only';
import Stripe from 'stripe';
import type { CheckoutProvider, CheckoutSession } from './checkout';
import { checkoutSessionParameters } from './checkout';

export function stripeCheckoutProvider(key: string): CheckoutProvider {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  const sessionData = (session: Stripe.Checkout.Session): CheckoutSession => {
    if (typeof session.customer !== 'string') throw new Error('Unexpected checkout customer');
    return { id: session.id, customer: session.customer, subscription: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null, livemode: session.livemode, mode: session.mode, status: session.status, url: session.url, metadata: session.metadata, expires_at: session.expires_at };
  };
  return {
    price: id => stripe.prices.retrieve(id, { expand: ['product'] }),
    createCustomer: (agencyId, key) => stripe.customers.create({ metadata: { zenvoAgencyId: agencyId } }, { idempotencyKey: key }),
    async hasSubscription(customerId) {
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
      // Fail closed if the list cannot be fully inspected in this bounded request.
      return subscriptions.has_more || subscriptions.data.some(subscription => subscription.livemode || subscription.customer !== customerId || !['canceled', 'incomplete_expired'].includes(subscription.status));
    },
    async createSession(input, key) {
      return sessionData(await stripe.checkout.sessions.create(checkoutSessionParameters(input), { idempotencyKey: key }));
    },
    async getSession(id) { return sessionData(await stripe.checkout.sessions.retrieve(id)); },
  };
}
