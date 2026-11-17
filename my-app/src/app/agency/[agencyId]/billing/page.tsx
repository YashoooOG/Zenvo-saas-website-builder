import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getAgencyAccess } from '@/lib/agency-access';
import { getDb } from '@/lib/db';
import { getBillingPlan } from '@/lib/billing';

export const metadata: Metadata = { title: 'Agency billing' };

export default async function AgencyBillingPage({ params }: PageProps<'/agency/[agencyId]/billing'>) {
  const user = await requireWorkspaceUser();
  const { agencyId } = await params;
  const access = await getAgencyAccess(getDb(), user.id, agencyId, 'billing');
  if (!access) notFound();
  const result = await getBillingPlan();
  return <>
    <div className="workspace-heading"><div><p className="workspace-eyebrow">Agency billing</p><h1>{access.agency.name}</h1><p>Review the plan available for your agency.</p></div><span className="agency-owner">Test mode</span></div>
    <div className="agency-settings-grid"><aside><h2>Your agency plan</h2><p>Only the agency owner can access billing.</p><p>Subscription checkout is not available yet. Viewing this page does not start a subscription or charge you.</p></aside>
      <section aria-labelledby="billing-plan-title" className="agency-empty">
        {result.status === 'ready' ? <><h2 id="billing-plan-title">{result.plan.name}</h2><p><strong>{result.plan.amount}</strong> {result.plan.cadence}</p><p>{result.plan.tax}</p><p>This is the configured test plan, not an active subscription.</p></> : <><h2 id="billing-plan-title">Plan unavailable</h2><p>{result.message}</p><p>Your agency workspace remains available.</p></>}
      </section>
    </div>
  </>;
}
