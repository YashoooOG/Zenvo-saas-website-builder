import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { listFunnels } from '@/lib/funnels';
import { FunnelForm } from '@/components/agency/funnel-form';

export const metadata = { title: 'Funnels' };
export default async function Funnels({ params }: PageProps<'/subaccount/[subaccountId]/funnels'>) {
  const user = await requireWorkspaceUser(); const { subaccountId } = await params;
  const data = await listFunnels(getDb(), user.id, subaccountId); if (!data) notFound();
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{data.access.name}</p><h1>Funnels</h1><p>Organize the pages for your client’s website and campaigns.</p></div><Link href={`/subaccount/${subaccountId}`} className="text-action">Back to workspace</Link></div>
    {data.funnels.length ? <ul className="client-list">{data.funnels.map(funnel => <li key={funnel.id}><div><h2>{funnel.name}</h2><p>{funnel._count.pages} pages</p></div><Link className="text-action" href={`/subaccount/${subaccountId}/funnels/${funnel.id}`}>Open funnel<span className="sr-only"> {funnel.name}</span></Link></li>)}</ul> : <section className="agency-empty"><h2>No funnels yet</h2><p>Funnels created by your team will appear here.</p></section>}
    {data.access.role !== 'GUEST' && <section className="launchpad-section"><h2>Create a funnel</h2><FunnelForm hidden={{ subAccountId: subaccountId, operation: 'create', creationKey: randomUUID() }} name="" label="Create funnel" /></section>}
  </>;
}
