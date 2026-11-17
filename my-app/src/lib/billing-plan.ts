import type Stripe from 'stripe';

export class BillingConfigurationError extends Error {}
export type BillingPlan = { name: string; priceId: string; amount: string; cadence: string; tax: string };

export function billingConfiguration(env: Readonly<Record<string, string | undefined>>) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  const priceId = env.STRIPE_PRICE_ID?.trim();
  if (!key || !priceId) throw new BillingConfigurationError('Billing setup is incomplete.');
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)) throw new BillingConfigurationError('Billing requires a Stripe test-mode secret or restricted key.');
  if (!/^price_[A-Za-z0-9]+$/.test(priceId)) throw new BillingConfigurationError('Billing requires a valid Stripe price ID.');
  return { key, priceId };
}

// Explicit supported currency exponents avoid treating every Stripe currency as cents.
const currencyDigits: Record<string, number> = { usd: 2, eur: 2, gbp: 2, inr: 2, cad: 2, aud: 2, jpy: 0 };

export function validateBillingPlan(price: Stripe.Price, expectedId: string): BillingPlan {
  const product = price.product;
  if (price.id !== expectedId || price.livemode || !price.active || typeof product === 'string' || product.deleted || !product.active || product.livemode) {
    throw new BillingConfigurationError('The billing price and product must be active and in test mode.');
  }
  const recurring = price.recurring;
  if (price.type !== 'recurring' || !recurring || recurring.usage_type !== 'licensed' || price.billing_scheme !== 'per_unit' || price.transform_quantity || price.custom_unit_amount || !Number.isSafeInteger(price.unit_amount) || price.unit_amount! < 0 || !Number.isSafeInteger(recurring.interval_count) || recurring.interval_count < 1 || !['day', 'week', 'month', 'year'].includes(recurring.interval)) {
    throw new BillingConfigurationError('Use a fixed recurring price without tiers, metering, or quantity transforms.');
  }
  const digits = currencyDigits[price.currency];
  if (digits === undefined) throw new BillingConfigurationError('This billing currency is not supported yet.');
  return {
    name: product.name,
    priceId: price.id,
    amount: new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency, currencyDisplay: 'code', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(price.unit_amount! / 10 ** digits),
    cadence: recurring.interval_count === 1 ? `every ${recurring.interval}` : `every ${recurring.interval_count} ${recurring.interval}s`,
    tax: price.tax_behavior === 'inclusive' ? 'Tax included in the listed price.' : price.tax_behavior === 'exclusive' ? 'Tax is excluded from the listed price.' : 'Tax treatment has not been configured.',
  };
}

export type BillingPlanResult = { status: 'ready'; plan: BillingPlan } | { status: 'unavailable'; message: string };
export async function loadBillingPlan(env: Parameters<typeof billingConfiguration>[0], retrieve: (key: string, id: string) => Promise<Stripe.Price>): Promise<BillingPlanResult> {
  try {
    const { key, priceId } = billingConfiguration(env);
    return { status: 'ready', plan: validateBillingPlan(await retrieve(key, priceId), priceId) };
  } catch (error) {
    // Provider errors can contain request details. Never send them to a page or CLI.
    return { status: 'unavailable', message: error instanceof BillingConfigurationError ? error.message : 'The billing plan could not be loaded. Please try again later.' };
  }
}
