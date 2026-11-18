import { z } from 'zod';
import type Stripe from 'stripe';
import type { PrismaClient } from '../generated/prisma/client';
import { lockConnectAccount } from './connect-events';
import { verifyFunnelSession } from './funnel-checkout-sessions';

const types = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'] as const;
const schema = z.object({
  id: z.string().max(191).regex(/^evt_[A-Za-z0-9]+$/), account: z.string().max(191).regex(/^acct_[A-Za-z0-9]+$/),
  type: z.enum(types), livemode: z.literal(false),
  data: z.object({ object: z.object({ id: z.string().max(191).regex(/^cs_test_[A-Za-z0-9]+$/), object: z.literal('checkout.session'),
    metadata: z.object({ zenvoAttemptId: z.string().optional() }).nullable().optional(),
  }) }),
});
export type FunnelPaymentEvent = z.infer<typeof schema>;
export function parseFunnelPaymentEvent(raw: unknown): FunnelPaymentEvent | null {
  const envelope = z.object({ type: z.string(), livemode: z.boolean() }).parse(raw);
  if (envelope.livemode || !types.some(type => type === envelope.type)) return null;
  return schema.parse(raw);
}
const paymentSchema = z.object({
  payment_status: z.enum(['paid', 'unpaid']),
  payment_intent: z.object({
    id: z.string().max(191).regex(/^pi_[A-Za-z0-9]+$/), livemode: z.literal(false),
    status: z.enum(['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled', 'succeeded']),
    amount: z.number().int(), amount_received: z.number().int(), currency: z.string(), application_fee_amount: z.number().int().nullable(),
    metadata: z.object({ zenvoAttemptId: z.string(), zenvoAgencyId: z.string() }),
  }).nullable(),
});
export type FunnelPaymentRetrieve = (accountId: string, sessionId: string) => Promise<unknown>;

export async function syncFunnelPaymentEvent(db: PrismaClient, event: FunnelPaymentEvent, retrieve: FunnelPaymentRetrieve) {
  return db.$transaction(async tx => {
    await lockConnectAccount(tx, event.account);
    if (await tx.connectWebhookReceipt.findUnique({ where: { id: event.id } })) return 'duplicate';
    const hint = event.data.object.metadata?.zenvoAttemptId;
    const attempt = await tx.funnelCheckoutAttempt.findFirst({ where: { accountId: event.account, OR: [
      { sessionId: event.data.object.id }, ...(hint ? [{ id: hint }] : []),
    ] } });
    let outcome = 'ignored';
    if (attempt) {
      if (!attempt.sessionRequest || (attempt.sessionId && attempt.sessionId !== event.data.object.id)) throw new Error('Session binding mismatch');
      const raw = await retrieve(event.account, event.data.object.id);
      const { session } = verifyFunnelSession(raw, { ...attempt, sessionId: event.data.object.id }, attempt.sessionRequest as unknown as Stripe.Checkout.SessionCreateParams, false);
      const payment = paymentSchema.parse(raw);
      const intent = payment.payment_intent;
      if (intent && (intent.amount !== attempt.amount || intent.currency !== attempt.currency || (intent.application_fee_amount ?? 0) !== attempt.feeAmount ||
        intent.metadata.zenvoAttemptId !== attempt.id || intent.metadata.zenvoAgencyId !== attempt.agencyId ||
        (attempt.paymentIntentId && intent.id !== attempt.paymentIntentId))) throw new Error('Payment binding mismatch');
      let paymentStatus = 'pending';
      if (payment.payment_status === 'paid') {
        if (session.status !== 'complete' || !intent || intent.status !== 'succeeded' || intent.amount_received !== attempt.amount) throw new Error('Payment not confirmed');
        paymentStatus = 'paid';
      } else if (session.status === 'expired') paymentStatus = 'expired';
      else if (intent?.status === 'canceled' || (event.type === 'checkout.session.async_payment_failed' && intent?.status === 'requires_payment_method')) paymentStatus = 'failed';
      // Historical payments still belong to their attempt after unpublishing,
      // owner deletion or account reconnection. Never grant new checkout access.
      // Confirmed payment is monotonic; refunds will have their own later state.
      const paid = attempt.paymentStatus === 'paid' || paymentStatus === 'paid';
      await tx.funnelCheckoutAttempt.update({ where: { id: attempt.id }, data: {
        sessionId: session.id, sessionStatus: attempt.sessionStatus === 'review' ? 'review' : paid ? 'complete' : session.status,
        paymentIntentId: intent?.id ?? attempt.paymentIntentId,
        paymentStatus: paid ? 'paid' : paymentStatus,
        paymentConfirmedAt: attempt.paymentConfirmedAt ?? (paymentStatus === 'paid' ? new Date() : null),
      } });
      outcome = 'updated';
    }
    await tx.connectWebhookReceipt.create({ data: { id: event.id, accountId: event.account, type: event.type } });
    return outcome;
  }, { isolationLevel: 'ReadCommitted', timeout: 20000, maxWait: 5000 });
}
