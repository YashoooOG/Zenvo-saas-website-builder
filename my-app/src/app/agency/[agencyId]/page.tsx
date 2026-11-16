import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getAgencyAccess, permitsAgency } from '@/lib/agency-access';
import { getDb } from '@/lib/db';
export const metadata: Metadata = { title: 'Agency workspace' };
export default async function AgencyOverview({ params }: PageProps<'/agency/[agencyId]'>) {
  const user = await requireWorkspaceUser();
  const { agencyId } = await params;
  const access = await getAgencyAccess(getDb(), user.id, agencyId);
  if (!access) notFound();
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">Agency workspace</p><h1>{access.agency.name}</h1><p>Your role: {access.role.toLowerCase()}.</p></div></div>
    <section className="agency-empty"><h2>{access.role === 'MEMBER' ? 'A place for your agency’s work' : 'Manage your agency'}</h2><p>{access.role === 'MEMBER' ? 'You have read-only agency access. Contact your agency owner if you need a different role.' : 'Keep your business details current and manage access to your workspace.'}</p>
      <div className="agency-overview-links">{permitsAgency(access.role, 'settings') && <Link className="action" href={`/agency/${agencyId}/settings`}>Agency settings</Link>}{permitsAgency(access.role, 'team') && <Link className="text-action" href={`/agency/${agencyId}/team`}>Manage team</Link>}</div>
    </section></>;
}
