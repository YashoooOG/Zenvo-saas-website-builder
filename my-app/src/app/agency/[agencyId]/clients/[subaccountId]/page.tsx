import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getAgencyAccess } from '@/lib/agency-access';
import { getDb } from '@/lib/db';
import { ClientForm } from '@/components/agency/client-form';
export const metadata: Metadata = { title: 'Manage client workspace' };
export default async function ManageClient({ params }: PageProps<'/agency/[agencyId]/clients/[subaccountId]'>) {
  const user = await requireWorkspaceUser();
  const { agencyId, subaccountId } = await params;
  if (!await getAgencyAccess(getDb(), user.id, agencyId, 'settings')) notFound();
  const account = await getDb().subAccount.findFirst({ where: { id: subaccountId, agencyId }, select: { id: true, name: true, enabled: true, revision: true } });
  if (!account) notFound();
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">Client workspace</p><h1>{account.name}</h1><p>Update its name or pause access by archiving it.</p></div><Link className="text-action" href={`/agency/${agencyId}/clients`}>Back to clients</Link></div><ClientForm key={account.id} agencyId={agencyId} account={account} /></>;
}
