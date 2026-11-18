import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import { lockAgencyAccess } from './agency-access';

export class BillingRecoveryError extends Error {}
const id = (prefix: string) => z.string().max(191).regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`));
const customerSchema = z.object({ id: id('cus'), deleted: z.literal(false).optional(), livemode: z.literal(false), created: z.number().int().nonnegative(), metadata: z.object({ zenvoAgencyId: z.string() }) });
const sessionSchema = z.object({
  id: id('cs_test'), customer: id('cus'), livemode: z.literal(false), mode: z.literal('subscription'),
  status: z.enum(['open', 'complete', 'expired']), created: z.number().int().nonnegative(), expires_at: z.number().int(),
  metadata: z.object({ zenvoAgencyId: z.string() }), success_url: z.string(), cancel_url: z.string(),
  line_items: z.object({ has_more: z.literal(false), data: z.array(z.object({ quantity: z.literal(1), price: z.object({ id: id('price'), livemode: z.literal(false) }) })).length(1) }),
});
export interface RecoveryProvider { customer(id: string): Promise<unknown>; session(id: string): Promise<unknown> }
export type RecoveryInput = { ownerId: string; agencyId: string; customerId?: string; sessionId?: string; apply?: boolean; expect?: string };

export function parseRecoveryArguments(args: string[]): RecoveryInput {
  const options: Record<string, string> = {};
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === '--apply' && !apply) { apply = true; continue; }
    if (!['--owner', '--agency', '--customer', '--session', '--expect'].includes(name) || options[name] !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) throw new BillingRecoveryError('Invalid recovery arguments. Run with --help.');
    options[name] = args[++index];
  }
  const invalidApply = apply && (!options['--expect'] || (!options['--customer'] && !options['--session']));
  if (!options['--owner'] || !options['--agency'] || (options['--customer'] && options['--session']) || invalidApply) throw new BillingRecoveryError('Specify owner and agency; apply also requires one candidate and the preview fingerprint.');
  return { ownerId: options['--owner'], agencyId: options['--agency'], customerId: options['--customer'], sessionId: options['--session'], apply, expect: options['--expect'] };
}

function createdDuringAttempt(created: number, start: Date) {
  const began = Math.floor(start.getTime() / 1000);
  return created >= began - 5 && created <= began + 23 * 3600;
}

// Operator-only service: no public route. The CLI requires database credentials;
// ownerId is an ownership guard and audit attribution, not a login credential.
export async function recoverAgencyCheckout(db: PrismaClient, input: RecoveryInput, provider?: RecoveryProvider) {
  if (input.customerId && input.sessionId) throw new BillingRecoveryError('Recover one object at a time.');
  if (input.customerId) id('cus').parse(input.customerId);
  if (input.sessionId) id('cs_test').parse(input.sessionId);
  return db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, input.ownerId, input.agencyId, 'billing');
    const state = await tx.agencyCheckout.findUnique({ where: { agencyId: agency.id } });
    if (!state) throw new BillingRecoveryError('No checkout recovery record exists for this agency.');
    const fingerprint = createHash('sha256').update(JSON.stringify({ ownerId: agency.ownerId, customerId: agency.stripeCustomerId, state, candidateCustomer: input.customerId ?? null, candidateSession: input.sessionId ?? null })).digest('hex');
    if (input.apply && (!input.expect || input.expect !== fingerprint)) throw new BillingRecoveryError('Recovery state changed or no preview fingerprint was supplied. Preview again.');
    const report = { agencyId: agency.id, customerId: agency.stripeCustomerId, sessionId: state.sessionId, customerStartedAt: state.customerStartedAt.toISOString(), attemptStartedAt: state.attemptStartedAt?.toISOString() ?? null, fingerprint, candidateId: input.customerId ?? input.sessionId ?? null };
    if (!input.customerId && !input.sessionId) {
      if (input.apply) throw new BillingRecoveryError('A verified candidate is required.');
      return { ...report, outcome: 'inspection', guidance: 'Select a known Stripe object for preview. No keys will be reset.' };
    }
    if (!provider) throw new BillingRecoveryError('Test Stripe configuration is required to verify a candidate.');
    const kind = input.customerId ? 'customer' : 'session';
    let alreadyLinked = false;
    if (input.customerId) {
      if (agency.stripeCustomerId && agency.stripeCustomerId !== input.customerId) throw new BillingRecoveryError('A different customer is already linked. Recovery cannot replace it.');
      if (!agency.stripeCustomerId && state.attemptKey) throw new BillingRecoveryError('Inconsistent checkout state requires manual review.');
      const customer = customerSchema.parse(await provider.customer(input.customerId));
      if (customer.id !== input.customerId || customer.metadata.zenvoAgencyId !== agency.id || !createdDuringAttempt(customer.created, state.customerStartedAt)) throw new BillingRecoveryError('Customer does not match the stored attempt.');
      const claimed = await tx.agency.findUnique({ where: { stripeCustomerId: customer.id }, select: { id: true } });
      if (claimed && claimed.id !== agency.id) throw new BillingRecoveryError('Customer is already assigned to another agency.');
      alreadyLinked = agency.stripeCustomerId === customer.id;
    } else {
      if (!agency.stripeCustomerId || !state.attemptKey || !state.attemptStartedAt || !state.origin || !state.priceId || !state.expiresAt) throw new BillingRecoveryError('A mapped customer and complete checkout attempt are required.');
      if (state.sessionId && state.sessionId !== input.sessionId) throw new BillingRecoveryError('A different checkout session is already linked.');
      const customer = customerSchema.parse(await provider.customer(agency.stripeCustomerId));
      if (customer.id !== agency.stripeCustomerId || customer.metadata.zenvoAgencyId !== agency.id) throw new BillingRecoveryError('Customer does not match this agency.');
      const session = sessionSchema.parse(await provider.session(input.sessionId!));
      const returnUrl = `${state.origin}/agency/${encodeURIComponent(agency.id)}/billing`;
      if (session.id !== input.sessionId || session.customer !== customer.id || session.metadata.zenvoAgencyId !== agency.id || session.expires_at !== state.expiresAt || session.success_url !== returnUrl || session.cancel_url !== returnUrl || session.line_items.data[0].price.id !== state.priceId || !createdDuringAttempt(session.created, state.attemptStartedAt)) throw new BillingRecoveryError('Session does not match the stored checkout attempt.');
      const claimed = await tx.agencyCheckout.findUnique({ where: { sessionId: session.id }, select: { agencyId: true } });
      if (claimed && claimed.agencyId !== agency.id) throw new BillingRecoveryError('Session is assigned to another agency.');
      alreadyLinked = state.sessionId === session.id;
    }
    if (!input.apply || alreadyLinked) return { ...report, outcome: alreadyLinked ? 'already-linked' : 'verified-preview', guidance: 'Apply requires this fingerprint and re-verifies the Stripe object.' };
    if (input.customerId) await tx.agency.update({ where: { id: agency.id }, data: { stripeCustomerId: input.customerId } });
    else await tx.agencyCheckout.update({ where: { agencyId: agency.id }, data: { sessionId: input.sessionId } });
    const receipt = await tx.billingRecoveryReceipt.create({ data: { agencyId: agency.id, ownerId: input.ownerId, kind, objectId: report.candidateId!, fingerprint } });
    return { ...report, outcome: 'linked', receiptId: receipt.id, guidance: 'Refresh subscription status in billing. Retry Checkout only after reviewing that status.' };
  }, { maxWait: 5000, timeout: 30000, isolationLevel: 'ReadCommitted' });
}
