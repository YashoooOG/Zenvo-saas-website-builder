import 'server-only';
import Stripe from 'stripe';
import type { ReconciliationProvider } from './billing-reconciliation';

export function stripeReconciliationProvider(key: string): ReconciliationProvider {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return {
    async customer(id) {
      const customer = await stripe.customers.retrieve(id);
      return customer.deleted ? { id: customer.id, deleted: true } : { id: customer.id, livemode: customer.livemode, metadata: customer.metadata };
    },
    subscriptions: customer => stripe.subscriptions.list({ customer, status: 'all', limit: 100 }),
  };
}
