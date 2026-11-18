import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import { lockAgencyAccess } from './agency-access';
import { connectAccountStatus, connectConfiguration } from './agency-payments';
import { lockConnectAccount } from './connect-events';

export class ConnectOAuthError extends Error {}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const invalid = () => new ConnectOAuthError('Authorization is unavailable or already used. Start a new connection from Payments.');
const tokenSchema = z.object({ stripe_user_id: z.string().max(191).regex(/^acct_[A-Za-z0-9]+$/), livemode: z.literal(false), scope: z.literal('read_write'), token_type: z.literal('bearer') });
export interface ConnectOAuthProvider { exchange(code: string): Promise<unknown>; account(id: string): Promise<unknown> }
export type ConnectCallback = { state: string; code?: string; error?: string };

export function parseConnectCallback(url: URL): ConnectCallback {
  const params = url.searchParams;
  if (params.getAll('state').length !== 1 || params.getAll('code').length > 1 || params.getAll('error').length > 1) throw invalid();
  const state = params.get('state') ?? '';
  const code = params.get('code') ?? undefined;
  const error = params.get('error') ?? undefined;
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || params.has('code') === params.has('error') || (params.has('code') && !/^ac_[A-Za-z0-9_-]{1,500}$/.test(code ?? '')) || (params.has('error') && error !== 'access_denied')) throw invalid();
  return { state, code, error };
}

export async function beginConnectOAuth(db: PrismaClient, actorId: string, agencyId: string, env: Readonly<Record<string, string | undefined>>) {
  return db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, agencyId, 'payments');
    if (agency.stripeConnectAccountId) throw new ConnectOAuthError('This agency already has a connected Stripe account.');
    const config = connectConfiguration(env);
    const now = new Date();
    if (await tx.connectOAuthAttempt.findFirst({ where: { agencyId, status: 'EXCHANGING', expiresAt: { gt: now } } })) throw new ConnectOAuthError('Authorization is being processed. Wait a moment before starting again.');
    await tx.connectOAuthAttempt.updateMany({ where: { agencyId, status: { in: ['PENDING', 'EXCHANGING'] } }, data: { status: 'SUPERSEDED', completedAt: now } });
    const state = randomBytes(32).toString('base64url');
    await tx.connectOAuthAttempt.create({ data: { agencyId, ownerId: actorId, stateHash: hash(state), clientId: config.clientId, callbackUrl: config.callbackUrl, expiresAt: new Date(now.getTime() + 10 * 60000) } });
    const url = new URL('https://connect.stripe.com/oauth/authorize');
    url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, scope: 'read_write', state, redirect_uri: config.callbackUrl }).toString();
    return url.href;
  }, { isolationLevel: 'ReadCommitted' });
}

export async function completeConnectOAuth(db: PrismaClient, actorId: string, callback: ConnectCallback, env: Readonly<Record<string, string | undefined>>, provider: ConnectOAuthProvider) {
  // Validate direct service callers as well as the HTTP parser.
  const probe = new URL('https://local.invalid');
  probe.searchParams.set('state', callback.state);
  if (callback.code !== undefined) probe.searchParams.set('code', callback.code);
  if (callback.error !== undefined) probe.searchParams.set('error', callback.error);
  parseConnectCallback(probe);
  const config = connectConfiguration(env);
  const found = await db.connectOAuthAttempt.findUnique({ where: { stateHash: hash(callback.state) } });
  if (!found || found.ownerId !== actorId) throw invalid();
  const claimed = await db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, found.agencyId, 'payments');
    const attempt = await tx.connectOAuthAttempt.findUniqueOrThrow({ where: { id: found.id } });
    if (attempt.ownerId !== actorId || attempt.status !== 'PENDING' || attempt.expiresAt <= new Date() || attempt.clientId !== config.clientId || attempt.callbackUrl !== config.callbackUrl || agency.stripeConnectAccountId) throw invalid();
    if (callback.error) {
      await tx.connectOAuthAttempt.update({ where: { id: attempt.id }, data: { status: 'DENIED', completedAt: new Date() } });
      return false;
    }
    const codeHash = hash(callback.code!);
    if (await tx.connectOAuthAttempt.findUnique({ where: { codeHash } })) throw invalid();
    // This commit must happen before the non-idempotent token exchange. A crash,
    // replay or provider timeout must NEVER resend the same authorization code.
    await tx.connectOAuthAttempt.update({ where: { id: attempt.id }, data: { status: 'EXCHANGING', codeHash } });
    return true;
  }, { isolationLevel: 'ReadCommitted' });
  if (!claimed) return { agencyId: found.agencyId, outcome: 'denied' as const };
  try {
    const token = tokenSchema.parse(await provider.exchange(callback.code!));
    connectAccountStatus(await provider.account(token.stripe_user_id), token.stripe_user_id);
    await db.$transaction(async tx => {
      const ledger = await lockConnectAccount(tx, token.stripe_user_id);
      const { agency } = await lockAgencyAccess(tx, actorId, found.agencyId, 'payments');
      const attempt = await tx.connectOAuthAttempt.findUniqueOrThrow({ where: { id: found.id } });
      if (ledger.revokedAt && Math.floor(attempt.createdAt.getTime() / 1000) <= ledger.revokedAt.getTime() / 1000) throw invalid();
      if (attempt.status !== 'EXCHANGING' || attempt.expiresAt <= new Date() || agency.stripeConnectAccountId) throw invalid();
      if (await tx.agency.findUnique({ where: { stripeConnectAccountId: token.stripe_user_id } })) throw invalid();
      await tx.agency.update({ where: { id: found.agencyId }, data: { stripeConnectAccountId: token.stripe_user_id } });
      await tx.agencyCatalog.deleteMany({ where: { agencyId: found.agencyId } });
      await tx.connectAccountSync.update({ where: { accountId: token.stripe_user_id }, data: { linkedStartedAt: attempt.createdAt } });
      await tx.connectOAuthAttempt.update({ where: { id: found.id }, data: { status: 'SUCCEEDED', accountId: token.stripe_user_id, completedAt: new Date() } });
    }, { isolationLevel: 'ReadCommitted' });
    return { agencyId: found.agencyId, outcome: 'linked' as const };
  } catch {
    await db.connectOAuthAttempt.updateMany({ where: { id: found.id, status: 'EXCHANGING' }, data: { status: 'FAILED', completedAt: new Date() } });
    return { agencyId: found.agencyId, outcome: 'failed' as const };
  }
}
