import type { PrismaClient } from '../generated/prisma/client';
import { lockAgencyAccess } from './agency-access';

export class BillingPortalError extends Error {}
export function portalConfiguration(env: Readonly<Record<string, string | undefined>>) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  const configurationId = env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  if (!key || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key) || !configurationId || !/^bpc_[A-Za-z0-9]+$/.test(configurationId) || !env.STRIPE_WEBHOOK_SECRET?.trim().startsWith('whsec_')) throw new BillingPortalError('Billing management is not configured yet.');
  let origin: URL;
  try { origin = new URL(env.ZENVO_APP_URL ?? ''); } catch { throw new BillingPortalError('Billing management is not configured yet.'); }
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) throw new BillingPortalError('Billing management is not configured yet.');
  return { key, configurationId, origin: origin.origin };
}

export interface PortalProvider {
  customer(id: string): Promise<{ id: string; deleted?: boolean; livemode?: boolean; metadata?: Record<string, string> }>;
  configuration(id: string): Promise<{ id: string; active: boolean; livemode: boolean; features: { subscription_update: { enabled: boolean } } }>;
  createSession(input: { customer: string; configuration: string; return_url: string }): Promise<{ customer: string; configuration: string; livemode: boolean; return_url: string | null; url: string }>;
}

export async function openAgencyPortal(db: PrismaClient, actorId: string, agencyId: string, env: Readonly<Record<string, string | undefined>>, provider: PortalProvider) {
  return db.$transaction(async tx => {
    const { agency } = await lockAgencyAccess(tx, actorId, agencyId, 'billing');
    if (!agency.stripeCustomerId) throw new BillingPortalError('Start checkout before managing billing for this agency.');
    const config = portalConfiguration(env);
    const customer = await provider.customer(agency.stripeCustomerId);
    if (customer.id !== agency.stripeCustomerId || customer.deleted || customer.livemode !== false || customer.metadata?.zenvoAgencyId !== agencyId) throw new BillingPortalError('The billing customer could not be verified.');
    const configuration = await provider.configuration(config.configurationId);
    if (configuration.id !== config.configurationId || !configuration.active || configuration.livemode || configuration.features.subscription_update.enabled) throw new BillingPortalError('Use an active test portal configuration with plan and quantity changes disabled.');
    const returnUrl = `${config.origin}/agency/${encodeURIComponent(agencyId)}/billing`;
    const session = await provider.createSession({ customer: customer.id, configuration: config.configurationId, return_url: returnUrl });
    if (session.customer !== customer.id || session.configuration !== config.configurationId || session.livemode || session.return_url !== returnUrl) throw new BillingPortalError('The billing session could not be verified.');
    let url: URL;
    try { url = new URL(session.url); } catch { throw new BillingPortalError('The billing session could not be verified.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com' || url.port || url.username || url.password) throw new BillingPortalError('The billing session could not be verified.');
    return url.href;
  }, { maxWait: 5000, timeout: 40000, isolationLevel: 'ReadCommitted' });
}
