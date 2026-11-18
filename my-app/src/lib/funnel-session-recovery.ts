import { z } from 'zod';
import type Stripe from 'stripe';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, lockAgencyAccess } from './agency-access';
import { connectConfiguration } from './agency-payments';
import { verifyFunnelSession } from './funnel-checkout-sessions';

export interface FunnelRecoveryProvider {
  listSessions(accountId: string, from: number, to: number): Promise<unknown>;
  getSession(accountId: string, sessionId: string): Promise<unknown>;
  expireSession(accountId: string, sessionId: string, key: string): Promise<unknown>;
}
export class FunnelRecoveryError extends Error {}
const options = { isolationLevel: 'ReadCommitted' as const, maxWait: 5000, timeout: 60000 };
const listing = z.object({ has_more: z.boolean(), data: z.array(z.object({
  id: z.string().regex(/^cs_test_[A-Za-z0-9]+$/),
  client_reference_id: z.string().nullable(), metadata: z.record(z.string(), z.string()).nullable(),
})).max(100) });

async function lockRecovery(tx: Prisma.TransactionClient, actorId: string, attemptId: string) {
  const attempt = await tx.funnelCheckoutAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new AgencyAccessError('Checkout unavailable.');
  await tx.$queryRaw`SELECT accountId FROM ConnectAccountSync WHERE accountId = ${attempt.accountId} FOR UPDATE`;
  await lockAgencyAccess(tx, actorId, attempt.agencyId, 'payments');
  // Recovery intentionally uses the historical account even if the page has been
  // removed or the connection revoked. It never authorizes a replacement charge.
  return tx.funnelCheckoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
}

// Internal owner operation. Inspect returns status only; cancel closes an open
// session. Neither operation returns a payment URL or marks an order paid.
export async function recoverFunnelSession(db: PrismaClient, actorId: string, input: unknown,
  env: Readonly<Record<string, string | undefined>>, factory: (key: string) => FunnelRecoveryProvider) {
  const data = z.object({ attemptId: z.uuid(), operation: z.enum(['inspect', 'cancel']) }).strict().parse(input);
  const attempt = await db.$transaction(tx => lockRecovery(tx, actorId, data.attemptId), options);
  if (!attempt.sessionRequest) return { status: 'not-started' as const };
  const config = connectConfiguration(env);
  const provider = factory(config.key);
  // Persist a stop marker independently of provider work. A crash or ambiguous
  // result must not allow startFunnelSession to replay an unresolved request.
  await db.$transaction(async tx => {
    await lockRecovery(tx, actorId, data.attemptId);
    await tx.funnelCheckoutAttempt.update({ where: { id: data.attemptId }, data: { sessionStatus: 'review' } });
  }, options);
  try {
    return await db.$transaction(async tx => {
      const current = await lockRecovery(tx, actorId, data.attemptId);
      await tx.funnelCheckoutAttempt.update({ where: { id: current.id }, data: { sessionStatus: 'review' } });
      const parameters = current.sessionRequest as unknown as Stripe.Checkout.SessionCreateParams;
      let sessionId = current.sessionId;
      if (!sessionId) {
        const found = listing.parse(await provider.listSessions(current.accountId,
          Math.floor(current.createdAt.getTime() / 1000) - 60, Math.ceil(current.expiresAt.getTime() / 1000) + 60));
        // A truncated page cannot prove uniqueness. Leave review in place rather
        // than creating another session or guessing that a missing one failed.
        const matches = found.data.filter(item => item.client_reference_id === current.id || item.metadata?.zenvoAttemptId === current.id);
        if (found.has_more || matches.length !== 1) return { status: 'review' as const };
        sessionId = matches[0].id;
      }
      const bound = { ...current, sessionId };
      let { session } = verifyFunnelSession(await provider.getSession(current.accountId, sessionId), bound, parameters, false);
      if (data.operation === 'cancel' && session.status === 'open') {
        // Expiration can race payment completion or lose its response. Always
        // retrieve authoritative state afterward, even if expire reports failure.
        try { await provider.expireSession(current.accountId, sessionId, `${current.idempotencyKey}_expire`); } catch { /* Confirm below. */ }
        session = verifyFunnelSession(await provider.getSession(current.accountId, sessionId), bound, parameters, false).session;
        if (session.status === 'open') return { status: 'review' as const };
      }
      await tx.funnelCheckoutAttempt.update({ where: { id: current.id }, data: { sessionId, sessionStatus: session.status } });
      return { status: session.status };
    }, options);
  } catch (error) {
    if (error instanceof AgencyAccessError) throw error;
    // Another recovery may have finished between our initial marker and our
    // provider transaction. Preserve review even when that transaction rolls back.
    await db.$transaction(async tx => {
      await lockRecovery(tx, actorId, data.attemptId);
      await tx.funnelCheckoutAttempt.update({ where: { id: data.attemptId }, data: { sessionStatus: 'review' } });
    }, options);
    throw new FunnelRecoveryError('Session recovery could not be verified. The attempt remains under review; retry recovery.');
  }
}
