import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { AgencyAccessError } from '@/lib/agency-access';
import { getAgencyPayments } from '@/lib/agency-payments';
import { retrieveConnectedAccount } from '@/lib/stripe-connect';
import { ConnectForm } from '@/components/agency/connect-form';
import { CatalogForm } from '@/components/agency/catalog-form';
import { getConnectedCatalog } from '@/lib/connected-catalog';

export const metadata: Metadata = { title: 'Agency payments' };
export default async function AgencyPaymentsPage({ params, searchParams }: PageProps<'/agency/[agencyId]/payments'>) {
  const user = await requireWorkspaceUser();
  const { agencyId } = await params;
  const query = await searchParams;
  const outcome = typeof query.connect === 'string' ? query.connect : null;
  let payments;
  let catalog;
  try { payments = await getAgencyPayments(getDb(), user.id, agencyId, process.env, retrieveConnectedAccount); catalog = payments.status === 'connected' ? await getConnectedCatalog(getDb(), user.id, agencyId) : null; }
  catch (error) { if (error instanceof AgencyAccessError) notFound(); throw error; }
  return <>
    {outcome && ['linked', 'failed', 'denied'].includes(outcome) && <p role="status">{outcome === 'linked' ? 'Authorization returned from Stripe. Review the verified account status below.' : outcome === 'denied' ? 'Authorization was declined. You can start again when ready.' : 'The connection could not be saved. Start a new authorization; do not reload the old callback.'}</p>}
    <div className="workspace-heading"><div><p className="workspace-eyebrow">Agency payments</p><h1>{payments.agencyName}</h1><p>Connect your agency’s Stripe account for future client sales.</p></div><span className="agency-owner">Test integration</span></div>
    <div className="agency-settings-grid"><aside><h2>Your connected account</h2><p>Only the agency owner can view and manage this connection.</p><p>Agency subscription charges are managed separately under Billing.</p><p>Choose your agency’s Standard account on Stripe and review the requested access. A connection does not activate sales in Zenvo.</p></aside>
      <section className="agency-empty" aria-labelledby="connect-status-title">
        {payments.status === 'connected' ? <><h2 id="connect-status-title">Stripe account linked</h2><p>Details {payments.account.detailsSubmitted ? 'submitted' : 'not yet submitted'}. Charges {payments.account.chargesEnabled ? 'enabled' : 'not enabled'}. Payouts {payments.account.payoutsEnabled ? 'enabled' : 'not enabled'}.</p><p>{payments.account.outstanding} outstanding requirements · {payments.account.pendingVerification} pending verification</p>{payments.account.restricted && <p>Stripe reports an account restriction. Review your Stripe account for details.</p>}<p>Status was fetched from Stripe for this page. This does not enable sales in Zenvo.</p></> : payments.status === 'not-connected' ? <><h2 id="connect-status-title">No Stripe account connected</h2><p>Stripe will ask you to authorize test-mode access to your account.</p><ConnectForm agencyId={agencyId} /></> : <><h2 id="connect-status-title">{payments.status === 'unconfigured' ? 'Payments setup incomplete' : 'Account status unavailable'}</h2><p>{payments.message}</p><p>Your agency workspace remains available.</p></>}
      </section>
    </div>
    {payments.status === 'connected' && <section className="agency-empty" aria-labelledby="catalog-title">
      <h2 id="catalog-title">Product catalog</h2>
      <p>Import your connected account’s test products and prices. Manage them in Stripe, then synchronize again. Sales are not enabled yet.</p>
      <CatalogForm agencyId={agencyId} />
      {catalog ? <><p>Last synchronized: {catalog.syncedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC</p>
        {catalog.products.length ? <ul>{catalog.products.map(product => <li key={product.id}>
          <h3>{product.name}{!product.active && ' (archived)'}</h3>
          {product.prices.length ? <ul>{product.prices.map(price => <li key={price.id}>
            <code>{price.id}</code> · {price.currency.toUpperCase()} · {price.amount === null ? 'Variable amount' : `${price.amount} minor units`} · {price.type === 'recurring' ? 'Recurring' : 'One-time'}{!price.active && ' · Archived'}{!price.supported && ' · Not supported for initial checkout'}
          </li>)}</ul> : <p>No prices in this snapshot.</p>}
        </li>)}</ul> : <p>No products found in this Stripe account.</p>}</> : <p>No catalog synchronized yet.</p>}
    </section>}
  </>;
}
