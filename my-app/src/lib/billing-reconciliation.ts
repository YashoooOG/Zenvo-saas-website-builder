import type Stripe from 'stripe';
import type { PrismaClient } from '../generated/prisma/client';
import { lockAgencyAccess } from './agency-access';
import { billingConfiguration } from './billing-plan';
import { persistSubscription } from './subscriptions';

export class BillingReconciliationError extends Error {}
export interface ReconciliationProvider {
  customer(id: string): Promise<{ id: string; deleted?: boolean; livemode?: boolean; metadata?: Record<string, string> }>;
  subscriptions(customerId: string): Promise<{ data: Stripe.Subscription[]; has_more: boolean }>;
}

export async function reconcileAgencyBilling(db: PrismaClient, actorId: string, agencyId: string, env: Readonly<Record<string, string | undefined>>, provider: ReconciliationProvider) {
  return db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, agencyId, 'billing');
    const { priceId } = billingConfiguration(env);
    if (!agency.stripeCustomerId) throw new BillingReconciliationError('No billing customer is linked to this agency yet.');
    const customer = await provider.customer(agency.stripeCustomerId);
    if (customer.id !== agency.stripeCustomerId || customer.deleted || customer.livemode !== false || customer.metadata?.zenvoAgencyId !== agencyId) throw new BillingReconciliationError('The billing customer could not be verified.');
    const list = await provider.subscriptions(customer.id);
    if (list.has_more || list.data.length > 100) throw new BillingReconciliationError('This billing history needs an operator review. No status was changed.');
    const ids = new Set(list.data.map(subscription => subscription.id));
    if (ids.size !== list.data.length) throw new BillingReconciliationError('The billing response could not be verified.');
    const known = await tx.agencySubscription.findMany({ where: { agencyId }, select: { id: true } });
    // Absence is not cancellation. A partial or unexpected list must preserve
    // known state and cannot silently remove a subscription or unblock Checkout.
    if (known.some(subscription => !ids.has(subscription.id))) throw new BillingReconciliationError('Stripe did not return the complete billing history. No status was changed.');
    for (const subscription of list.data) await persistSubscription(tx, subscription, agencyId, customer.id, priceId);
    return { count: list.data.length };
  }, { maxWait: 5000, timeout: 30000, isolationLevel: 'ReadCommitted' });
}
