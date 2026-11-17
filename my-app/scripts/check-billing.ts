import { loadBillingPlan } from '../src/lib/billing-plan';
import { retrieveBillingPrice } from '../src/lib/stripe-price';

const result = await loadBillingPlan(process.env, retrieveBillingPrice);
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'ready') process.exitCode = 1;
