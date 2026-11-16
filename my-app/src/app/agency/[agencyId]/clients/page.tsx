import type { Metadata } from 'next';
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getAgencyAccess, permitsAgency } from '@/lib/agency-access';
import { listSubAccounts } from '@/lib/subaccounts';
import { getDb } from '@/lib/db';
import { ClientForm } from '@/components/agency/client-form';
export const metadata: Metadata = { title: 'Client workspaces' };
export default async function Clients({ params }: PageProps<'/agency/[agencyId]/clients'>) {
  const user = await requireWorkspaceUser();
  const { agencyId } = await params;
  const access = await getAgencyAccess(getDb(), user.id, agencyId);
  if (!access) notFound();
  const manages = permitsAgency(access.role, 'settings');
  const accounts = await listSubAccounts(getDb(), user.id, agencyId, manages);
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{access.agency.name}</p><h1>Client workspaces</h1><p>{manages ? 'Give each client a place of their own.' : 'The client workspaces assigned to you.'}</p></div></div>
    {accounts.length ? <ul className="client-list">{accounts.map(account => <li key={account.id}><div><h2>{account.name}</h2><p>{account.enabled ? 'Active workspace' : 'Archived'}</p></div><div className="client-links">{account.enabled && <Link className="text-action" href={`/subaccount/${account.id}`}>Open workspace</Link>}{manages && <Link className="text-action" href={`/agency/${agencyId}/clients/${account.id}`}>Manage<span className="sr-only"> {account.name}</span></Link>}</div></li>)}</ul> : <section className="agency-empty"><h2>{manages ? 'Room for your first client' : 'No client workspaces assigned'}</h2><p>{manages ? 'Create a workspace below. You can rename or archive it later.' : 'Your agency owner can arrange access to client workspaces.'}</p></section>}
    {manages && <section className="launchpad-section"><h2>Create a client workspace</h2><ClientForm agencyId={agencyId} creationKey={randomUUID()} /></section>}
  </>;
}
