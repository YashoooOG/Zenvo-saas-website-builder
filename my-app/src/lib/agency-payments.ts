import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, getAgencyAccess } from './agency-access';

export class ConnectConfigurationError extends Error {}
export function connectConfiguration(env: Readonly<Record<string, string | undefined>>) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  const clientId = env.STRIPE_CONNECT_CLIENT_ID?.trim();
  if (!key || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key) || !clientId || !/^ca_[A-Za-z0-9]+$/.test(clientId)) throw new ConnectConfigurationError('Stripe Connect setup is incomplete.');
  let origin: URL;
  try { origin = new URL(env.ZENVO_APP_URL ?? ''); } catch { throw new ConnectConfigurationError('Stripe Connect setup is incomplete.'); }
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) throw new ConnectConfigurationError('Stripe Connect setup requires a valid app origin.');
  return { key, clientId, callbackUrl: `${origin.origin}/api/stripe-connect/callback` };
}

const accountSchema = z.object({
  id: z.string().max(191).regex(/^acct_[A-Za-z0-9]+$/), type: z.literal('standard'),
  charges_enabled: z.boolean(), payouts_enabled: z.boolean(), details_submitted: z.boolean(),
  requirements: z.object({ currently_due: z.array(z.string()), past_due: z.array(z.string()), pending_verification: z.array(z.string()), disabled_reason: z.string().nullable() }),
});
export type ConnectAccountStatus = { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; outstanding: number; pendingVerification: number; restricted: boolean };
export function connectAccountStatus(raw: unknown, expectedId: string): ConnectAccountStatus {
  const account = accountSchema.parse(raw);
  if (account.id !== expectedId) throw new Error('Connected account mismatch');
  return { chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled, detailsSubmitted: account.details_submitted,
    outstanding: new Set([...account.requirements.currently_due, ...account.requirements.past_due]).size,
    pendingVerification: new Set(account.requirements.pending_verification).size, restricted: account.requirements.disabled_reason !== null };
}
export type AgencyPayments = { agencyName: string } & (
  { status: 'unconfigured'; message: string } | { status: 'not-connected' } |
  { status: 'unavailable'; message: string } | { status: 'connected'; account: ConnectAccountStatus }
);

export async function getAgencyPayments(db: PrismaClient, actorId: string, agencyId: string, env: Readonly<Record<string, string | undefined>>, retrieve: (key: string, id: string) => Promise<unknown>): Promise<AgencyPayments> {
  const access = await getAgencyAccess(db, actorId, agencyId, 'payments');
  if (!access) throw new AgencyAccessError('Agency unavailable.');
  const agencyName = access.agency.name;
  let config;
  try { config = connectConfiguration(env); }
  catch (error) { return { agencyName, status: 'unconfigured', message: error instanceof ConnectConfigurationError ? error.message : 'Stripe Connect setup is incomplete.' }; }
  const accountId = access.agency.stripeConnectAccountId;
  if (!accountId) return { agencyName, status: 'not-connected' };
  try {
    if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) throw new Error('Invalid connected account');
    const account = connectAccountStatus(await retrieve(config.key, accountId), accountId);
    // Ownership and mapping can change while Stripe is responding. Never return
    // the fetched status after a revoke, owner deletion, or account replacement.
    const latest = await getAgencyAccess(db, actorId, agencyId, 'payments');
    if (!latest || latest.agency.stripeConnectAccountId !== accountId) throw new AgencyAccessError('Agency unavailable.');
    return { agencyName, status: 'connected', account };
  } catch (error) {
    if (error instanceof AgencyAccessError) throw error;
    return { agencyName, status: 'unavailable', message: 'The connected account could not be verified. Try again later or review the connection in Stripe.' };
  }
}
