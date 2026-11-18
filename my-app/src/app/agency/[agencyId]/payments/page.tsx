import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { AgencyAccessError } from '@/lib/agency-access';
import { getAgencyPayments } from '@/lib/agency-payments';
import { retrieveConnectedAccount } from '@/lib/stripe-connect';

export const metadata: Metadata = { title: 'Agency payments' };
export default async function AgencyPaymentsPage({ params }: PageProps<'/agency/[agencyId]/payments'>) {
  const user = await requireWorkspaceUser();
  const { agencyId } = await params;
  let payments;
  try { payments = await getAgencyPayments(getDb(), user.id, agencyId, process.env, retrieveConnectedAccount); }
  catch (error) { if (error instanceof AgencyAccessError) notFound(); throw error; }
  return <>
    <div className="workspace-heading"><div><p className="workspace-eyebrow">Agency payments</p><h1>{payments.agencyName}</h1><p>Connect your agency’s Stripe account for future client sales.</p></div><span className="agency-owner">Test integration</span></div>
    <div className="agency-settings-grid"><aside><h2>Your connected account</h2><p>Only the agency owner can view and manage this connection.</p><p>Agency subscription charges are managed separately under Billing.</p><p>Connecting accounts is not available yet. OAuth authorization is the next setup step.</p></aside>
      <section className="agency-empty" aria-labelledby="connect-status-title">
        {payments.status === 'connected' ? <><h2 id="connect-status-title">Stripe account linked</h2><p>Details {payments.account.detailsSubmitted ? 'submitted' : 'not yet submitted'}. Charges {payments.account.chargesEnabled ? 'enabled' : 'not enabled'}. Payouts {payments.account.payoutsEnabled ? 'enabled' : 'not enabled'}.</p><p>{payments.account.outstanding} outstanding requirements · {payments.account.pendingVerification} pending verification</p>{payments.account.restricted && <p>Stripe reports an account restriction. Review your Stripe account for details.</p>}<p>Status was fetched from Stripe for this page. This does not enable sales in Zenvo.</p></> : payments.status === 'not-connected' ? <><h2 id="connect-status-title">No Stripe account connected</h2><p>Local settings are present. The upcoming authorization flow will verify the connection.</p></> : <><h2 id="connect-status-title">{payments.status === 'unconfigured' ? 'Payments setup incomplete' : 'Account status unavailable'}</h2><p>{payments.message}</p><p>Your agency workspace remains available.</p></>}
      </section>
    </div>
  </>;
}
