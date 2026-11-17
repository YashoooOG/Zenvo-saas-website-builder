import Stripe from 'stripe';

// Used only by the server-only billing entry point and the local preflight CLI.
export async function retrieveBillingPrice(key: string, priceId: string) {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 1 });
  return stripe.prices.retrieve(priceId, { expand: ['product'] });
}
