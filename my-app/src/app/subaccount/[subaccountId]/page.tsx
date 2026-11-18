import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { getSubAccountAccess } from '@/lib/subaccounts';
export const metadata = { title: 'Client workspace' };
export default async function ClientWorkspace({ params }: PageProps<'/subaccount/[subaccountId]'>) {
  const user = await requireWorkspaceUser();
  const { subaccountId } = await params;
  const account = await getSubAccountAccess(getDb(), user.id, subaccountId);
  if (!account) notFound();
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{account.agencyName} / Client workspace</p><h1>{account.name}</h1><p>Your workspace role: {account.role.toLowerCase()}.</p></div>{account.managesAgency && <Link className="text-action" href={`/agency/${account.agencyId}/clients/${account.id}`}>Manage workspace</Link>}</div><section className="agency-empty"><h2>A home for this client’s work</h2><p>Organize pages, images and project boards for this client.</p><div className="agency-overview-links"><Link className="action" href={`/subaccount/${subaccountId}/funnels`}>Open funnels</Link><Link className="text-action" href={`/subaccount/${subaccountId}/pipelines`}>Open project boards</Link><Link className="text-action" href={`/subaccount/${subaccountId}/media`}>Open media library</Link><Link className="text-action" href="/subaccount">View your client workspaces</Link></div></section></>;
}
