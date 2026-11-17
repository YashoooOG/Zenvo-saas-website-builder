import type Stripe from 'stripe';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, getAgencyAccess, lockAgencyActors } from './agency-access';

const stripeId = (prefix: string) => z.string().max(191).regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`));
const eventSchema = z.object({
  id: stripeId('evt'), type: z.enum(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']),
  livemode: z.literal(false), account: z.undefined().optional(),
  data: z.object({ object: z.object({ object: z.literal('subscription'), id: stripeId('sub'), customer: stripeId('cus') }) }),
});
export type SubscriptionEvent = z.infer<typeof eventSchema>;

export function parseSubscriptionEvent(event: Stripe.Event): SubscriptionEvent | null {
  if (event.livemode || event.account || !['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) return null;
  return eventSchema.parse(event);
}

const snapshotSchema = z.object({
  id: stripeId('sub'), customer: stripeId('cus'), livemode: z.literal(false),
  metadata: z.object({ zenvoAgencyId: z.string().min(1).max(191) }),
  status: z.enum(['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused']),
  cancel_at_period_end: z.boolean(),
  pause_collection: z.object({ behavior: z.string() }).nullable(),
  items: z.object({ has_more: z.literal(false), data: z.array(z.object({
    quantity: z.literal(1), current_period_end: z.number().int().min(0).max(253402300799),
    price: z.object({ id: stripeId('price'), livemode: z.literal(false), type: z.literal('recurring') }),
  })).length(1) }),
});

// Fetch inside the agency lock: delayed and concurrent deliveries always refresh
// current Stripe state, rather than overwriting it with an older event snapshot.
export async function syncSubscription(db: PrismaClient, event: SubscriptionEvent, priceId: string, retrieve: (id: string) => Promise<Stripe.Subscription>) {
  const customerId = event.data.object.customer;
  const agency = await db.agency.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true, ownerId: true } });
  if (!agency) return 'ignored' as const;
  return db.$transaction(async tx => {
    await lockAgencyActors(tx, agency.ownerId, agency.id);
    const current = await tx.agency.findUnique({ where: { id: agency.id }, select: { stripeCustomerId: true } });
    if (current?.stripeCustomerId !== customerId) throw new Error('Customer mapping changed');
    if (await tx.stripeWebhookReceipt.findUnique({ where: { id: event.id } })) return 'duplicate' as const;
    const subscription = snapshotSchema.parse(await retrieve(event.data.object.id));
    const item = subscription.items.data[0];
    if (subscription.id !== event.data.object.id || subscription.customer !== customerId || subscription.metadata.zenvoAgencyId !== agency.id || item.price.id !== priceId) throw new Error('Subscription mapping mismatch');
    const existing = await tx.agencySubscription.findUnique({ where: { id: subscription.id }, select: { agencyId: true } });
    if (existing && existing.agencyId !== agency.id) throw new Error('Subscription belongs to another agency');
    const data = {
      priceId: item.price.id, status: subscription.status, currentPeriodEnd: new Date(item.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end, collectionPaused: subscription.pause_collection !== null, syncedAt: new Date(),
    };
    await tx.agencySubscription.upsert({ where: { id: subscription.id }, create: { id: subscription.id, agencyId: agency.id, ...data }, update: data });
    await tx.stripeWebhookReceipt.create({ data: { id: event.id, type: event.type } });
    return 'updated' as const;
  }, { maxWait: 5000, timeout: 20000, isolationLevel: 'ReadCommitted' });
}

export async function getAgencySubscriptions(db: PrismaClient, actorId: string, agencyId: string) {
  if (!await getAgencyAccess(db, actorId, agencyId, 'billing')) throw new AgencyAccessError('Agency unavailable.');
  return db.agencySubscription.findMany({ where: { agencyId }, select: { id: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, collectionPaused: true, syncedAt: true }, orderBy: [{ syncedAt: 'desc' }, { id: 'asc' }] });
}

export const subscriptionStatusLabels: Record<string, string> = {
  incomplete: 'Payment incomplete', incomplete_expired: 'Payment expired', trialing: 'Trial', active: 'Active',
  past_due: 'Past due', canceled: 'Canceled', unpaid: 'Unpaid', paused: 'Paused',
};
