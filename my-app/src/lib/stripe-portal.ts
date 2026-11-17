import 'server-only';
import Stripe from 'stripe';
import type { PortalProvider } from './billing-portal';

export function stripePortalProvider(key: string): PortalProvider {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return {
    async customer(id) {
      const customer = await stripe.customers.retrieve(id);
      return customer.deleted ? { id: customer.id, deleted: true } : { id: customer.id, livemode: customer.livemode, metadata: customer.metadata };
    },
    configuration: id => stripe.billingPortal.configurations.retrieve(id),
    async createSession(input) {
      const session = await stripe.billingPortal.sessions.create(input);
      return { customer: session.customer, configuration: typeof session.configuration === 'string' ? session.configuration : session.configuration.id, livemode: session.livemode, return_url: session.return_url, url: session.url };
    },
  };
}
