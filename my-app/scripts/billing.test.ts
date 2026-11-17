import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { billingConfiguration, BillingConfigurationError, loadBillingPlan, validateBillingPlan } from '../src/lib/billing-plan';

const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_PRICE_ID: 'price_fixture' };
const fixture = (): Stripe.Price => ({
  id: 'price_fixture', object: 'price', active: true, billing_scheme: 'per_unit', created: 1,
  currency: 'usd', custom_unit_amount: null, livemode: false, lookup_key: null, metadata: {}, nickname: null,
  product: { id: 'prod_fixture', object: 'product', active: true, livemode: false, name: 'Agency plan' } as Stripe.Product,
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed', meter: null, trial_period_days: null },
  tax_behavior: 'exclusive', tiers_mode: null, transform_quantity: null, type: 'recurring', unit_amount: 2999, unit_amount_decimal: null,
});

describe('billing configuration', () => {
  test('accepts test secret/restricted keys and trims whitespace', () => {
    assert.deepEqual(billingConfiguration(env), { key: env.STRIPE_SECRET_KEY, priceId: env.STRIPE_PRICE_ID });
    assert.equal(billingConfiguration({ ...env, STRIPE_SECRET_KEY: ' rk_test_fixture ' }).key, 'rk_test_fixture');
  });
  test('rejects missing, public, live, malformed keys and price IDs', () => {
    for (const key of ['', 'pk_test_fixture', 'sk_live_fixture', 'rk_live_fixture', 'sk_test_a b']) assert.throws(() => billingConfiguration({ ...env, STRIPE_SECRET_KEY: key }), BillingConfigurationError);
    for (const price of ['', 'prod_fixture', 'price_a/b']) assert.throws(() => billingConfiguration({ ...env, STRIPE_PRICE_ID: price }), BillingConfigurationError);
  });
  test('invalid configuration never contacts Stripe', async () => {
    let calls = 0;
    const result = await loadBillingPlan({}, async () => { calls++; return fixture(); });
    assert.equal(result.status, 'unavailable');
    assert.equal(calls, 0);
  });
});

describe('billing price validation', () => {
  test('returns only the display fields with exact cadence and tax label', () => {
    assert.deepEqual(validateBillingPlan(fixture(), env.STRIPE_PRICE_ID), { name: 'Agency plan', priceId: 'price_fixture', amount: 'USD\u00a029.99', cadence: 'every month', tax: 'Tax is excluded from the listed price.' });
    const price = fixture(); price.currency = 'jpy'; price.unit_amount = 500; price.recurring!.interval_count = 3;
    assert.equal(validateBillingPlan(price, price.id).amount, 'JPY\u00a0500');
    assert.equal(validateBillingPlan(price, price.id).cadence, 'every 3 months');
  });
  test('rejects mismatched IDs, archived/live prices, and unavailable products', () => {
    assert.throws(() => validateBillingPlan(fixture(), 'price_other'));
    for (const changes of [{ active: false }, { livemode: true }, { product: 'prod_unexpanded' }, { product: { deleted: true } }, { product: { active: false } }, { product: { active: true, livemode: true } }]) {
      assert.throws(() => validateBillingPlan({ ...fixture(), ...changes } as Stripe.Price, env.STRIPE_PRICE_ID));
    }
  });
  test('rejects unsupported price models, fractional amounts, currencies and cadences', () => {
    for (const changes of [{ type: 'one_time' }, { recurring: null }, { recurring: { ...fixture().recurring, usage_type: 'metered' } }, { billing_scheme: 'tiered' }, { transform_quantity: { divide_by: 10, round: 'up' } }, { custom_unit_amount: { minimum: 1 } }, { unit_amount: null }, { unit_amount: 1.5 }, { unit_amount: -1 }, { unit_amount: Number.MAX_SAFE_INTEGER + 1 }, { currency: 'isk' }, { recurring: { ...fixture().recurring, interval_count: 0 } }]) {
      assert.throws(() => validateBillingPlan({ ...fixture(), ...changes } as Stripe.Price, env.STRIPE_PRICE_ID));
    }
  });
  test('retrieves only the configured price and sanitizes provider errors', async () => {
    const ready = await loadBillingPlan(env, async (key, id) => { assert.equal(key, env.STRIPE_SECRET_KEY); assert.equal(id, env.STRIPE_PRICE_ID); return fixture(); });
    assert.equal(ready.status, 'ready');
    const failed = await loadBillingPlan(env, async () => { throw new Error('request contained sk_test_sensitive'); });
    assert.deepEqual(failed, { status: 'unavailable', message: 'The billing plan could not be loaded. Please try again later.' });
  });
});
