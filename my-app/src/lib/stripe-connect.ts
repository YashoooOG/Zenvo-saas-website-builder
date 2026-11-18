import 'server-only';
import Stripe from 'stripe';
import type { ConnectOAuthProvider } from './connect-oauth';
import type { CatalogProvider } from './connected-catalog';

export function stripeCatalogProvider(key: string): CatalogProvider {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return {
    account: id => stripe.accounts.retrieve(id),
    products: (id, cursor) => stripe.products.list({ limit: 100, starting_after: cursor }, { stripeAccount: id }),
    prices: (id, active, cursor) => stripe.prices.list({ limit: 100, active, starting_after: cursor }, { stripeAccount: id }),
  };
}

export async function retrieveConnectedAccount(key: string, accountId: string) {
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return stripe.accounts.retrieve(accountId);
}

export function stripeConnectOAuthProvider(key: string): ConnectOAuthProvider {
  // OAuth codes are one-use. Never enable SDK retries for the token endpoint.
  const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
  return { exchange: code => stripe.oauth.token({ grant_type: 'authorization_code', code }), account: id => stripe.accounts.retrieve(id) };
}
