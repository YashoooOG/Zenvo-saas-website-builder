import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationFeeConfiguration, applicationFeeSummary, calculateApplicationFee } from '../src/lib/application-fees';

test('blank fees remain unconfigured; zero is an explicit fee-free policy', () => {
  for (const value of [undefined, '', ' ']) assert.throws(() => applicationFeeConfiguration({ ZENVO_APPLICATION_FEE_BPS: value }));
  assert.deepEqual(applicationFeeSummary({}), { status: 'unconfigured' });
  assert.deepEqual(applicationFeeConfiguration({ ZENVO_APPLICATION_FEE_BPS: '0' }), { basisPoints: 0, percentage: '0%' });
});

test('fee configuration accepts only bounded integer basis points', () => {
  for (const value of ['-1', '10001', '1.5', 'NaN', 'Infinity', '1e2', '0x10', '+20', '001', '10%', '1_000']) assert.throws(() => applicationFeeConfiguration({ ZENVO_APPLICATION_FEE_BPS: value }));
  for (const [value, percentage] of [['1', '0.01%'], ['100', '1%'], ['250', '2.5%'], ['1000', '10%'], ['10000', '100%']]) assert.equal(applicationFeeConfiguration({ ZENVO_APPLICATION_FEE_BPS: ` ${value} ` }).percentage, percentage);
});

test('fees use integer minor units and floor rounding on the whole total', () => {
  assert.deepEqual(calculateApplicationFee(10000, 250), { amount: 10000, applicationFeeAmount: 250, remainderBeforeProcessingFees: 9750 });
  assert.equal(calculateApplicationFee(99, 250).applicationFeeAmount, 2);
  assert.equal(calculateApplicationFee(1, 250).applicationFeeAmount, 0);
  assert.equal(calculateApplicationFee(3 * 99, 250).applicationFeeAmount, 7);
});

test('zero totals and zero/full rates are exact', () => {
  assert.equal(calculateApplicationFee(0, 250).applicationFeeAmount, 0);
  assert.equal(calculateApplicationFee(123, 0).applicationFeeAmount, 0);
  assert.equal(calculateApplicationFee(123, 10000).remainderBeforeProcessingFees, 0);
});

test('unsafe and fractional inputs cannot reach fee calculation', () => {
  for (const amount of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => calculateApplicationFee(amount, 250));
  for (const rate of [-1, 0.5, NaN, Infinity, 10001]) assert.throws(() => calculateApplicationFee(100, rate));
});

test('large amounts remain exact when intermediate multiplication would lose precision', () => {
  for (const rate of [1, 3333, 9999, 10000]) {
    const amount = Number.MAX_SAFE_INTEGER;
    assert.equal(calculateApplicationFee(amount, rate).applicationFeeAmount, Number(BigInt(amount) * BigInt(rate) / BigInt(10000)));
  }
});

test('fee and remainder conserve the total and fees are monotonic across rates', () => {
  for (const amount of [0, 1, 99, 12345, Number.MAX_SAFE_INTEGER]) {
    let previous = 0;
    for (let rate = 0; rate <= 10000; rate++) {
      const result = calculateApplicationFee(amount, rate);
      assert.ok(result.applicationFeeAmount >= previous && result.applicationFeeAmount <= amount);
      assert.equal(result.applicationFeeAmount + result.remainderBeforeProcessingFees, amount);
      previous = result.applicationFeeAmount;
    }
  }
});
