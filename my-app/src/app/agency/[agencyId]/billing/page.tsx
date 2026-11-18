import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getAgencyAccess } from '@/lib/agency-access';
import { getDb } from '@/lib/db';
import { getBillingPlan } from '@/lib/billing';
import { getAgencySubscriptions, subscriptionStatusLabels } from '@/lib/subscriptions';
import { checkoutConfiguration } from '@/lib/checkout';
import { CheckoutForm } from '@/components/agency/checkout-form';
import { PortalForm } from '@/components/agency/portal-form';
import { portalConfiguration } from '@/lib/billing-portal';
import { billingConfiguration } from '@/lib/billing-plan';
import { RefreshBillingForm } from '@/components/agency/refresh-billing-form';

export const metadata: Metadata = { title: 'Agency billing' };

export default async function AgencyBillingPage({ params }: PageProps<'/agency/[agencyId]/billing'>) {
  const user = await requireWorkspaceUser();
  const { agencyId } = await params;
  const access = await getAgencyAccess(getDb(), user.id, agencyId, 'billing');
  if (!access) notFound();
  const result = await getBillingPlan();
  const subscriptions = await getAgencySubscriptions(getDb(), user.id, agencyId);
  const hasCurrentSubscription = subscriptions.some(subscription => !['canceled', 'incomplete_expired'].includes(subscription.status));
  let checkoutReady = false;
  try { checkoutConfiguration(process.env); checkoutReady = true; } catch { /* Optional provider setup. */ }
  let portalReady = false;
  try { portalConfiguration(process.env); portalReady = true; } catch { /* Optional provider setup. */ }
  let refreshReady = false;
  try { billingConfiguration(process.env); refreshReady = true; } catch { /* Optional provider setup. */ }
  return <>
    <div className="workspace-heading"><div><p className="workspace-eyebrow">Agency billing</p><h1>{access.agency.name}</h1><p>Review the plan available for your agency.</p></div><span className="agency-owner">Test mode</span></div>
    <div className="agency-settings-grid"><aside><h2>Your agency plan</h2><p>Only the agency owner can access billing.</p><p>Viewing this page does not start a subscription. Test checkout opens on Stripe; subscription status is confirmed separately.</p></aside>
      <section aria-labelledby="billing-plan-title" className="agency-empty">
        {result.status === 'ready' ? <><h2 id="billing-plan-title">{result.plan.name}</h2><p><strong>{result.plan.amount}</strong> {result.plan.cadence}</p><p>{result.plan.tax}</p><p>This is the configured test plan, not an active subscription.</p></> : <><h2 id="billing-plan-title">Plan unavailable</h2><p>{result.message}</p><p>Your agency workspace remains available.</p></>}
        {result.status === 'ready' && (hasCurrentSubscription ? <p>Your agency already has a subscription. Review its status below.</p> : checkoutReady ? <CheckoutForm agencyId={agencyId} /> : <p>Checkout setup is incomplete.</p>)}
      </section>
    </div>
    <section aria-labelledby="subscription-status-title" className="agency-empty mt-8">
      <h2 id="subscription-status-title">Subscription status</h2>
      {access.agency.stripeCustomerId && refreshReady && <RefreshBillingForm agencyId={agencyId} />}
      {subscriptions.length ? <><p>Last confirmed by Stripe. Changes may take a moment to arrive.</p>{subscriptions.map(subscription => <div key={subscription.id}>
        <h3>{subscriptionStatusLabels[subscription.status] ?? 'Unknown status'}</h3>
        <p>Billing period ends {subscription.currentPeriodEnd.toISOString().slice(0, 10)} (UTC).{subscription.cancelAtPeriodEnd ? ' Cancellation is scheduled for the end of the billing period.' : ''}{subscription.collectionPaused ? ' Payment collection is paused.' : ''}</p>
        <p>Last synchronized {subscription.syncedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC.</p>
      </div>)}</> : <p>No subscription has been confirmed for this agency.</p>}
      {access.agency.stripeCustomerId && <><p>Manage payment details, invoices, and available subscription options on Stripe. Changes appear here after confirmation.</p>{portalReady ? <PortalForm agencyId={agencyId} /> : <p>Billing management setup is incomplete.</p>}</>}
    </section>
  </>;
}
