import 'server-only';
import Stripe from 'stripe';

export async function retrieveConnectedAccount(key: string, accountId: string) {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return stripe.accounts.retrieve(accountId);
}
