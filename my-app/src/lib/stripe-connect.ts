import 'server-only';
import Stripe from 'stripe';
import type { ConnectOAuthProvider } from './connect-oauth';

export async function retrieveConnectedAccount(key: string, accountId: string) {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return stripe.accounts.retrieve(accountId);
}

export function stripeConnectOAuthProvider(key: string): ConnectOAuthProvider {
  // OAuth codes are one-use. Never enable SDK retries for the token endpoint.
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return { exchange: code => stripe.oauth.token({ grant_type: 'authorization_code', code }), account: id => stripe.accounts.retrieve(id) };
}
