import 'server-only';
import { loadBillingPlan } from './billing-plan';
import { retrieveBillingPrice } from './stripe-price';

export function getBillingPlan() {
  return loadBillingPlan(process.env, retrieveBillingPrice);
}
