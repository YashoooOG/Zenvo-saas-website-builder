import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getAgencyAccess } from '@/lib/agency-access';
import { getDb } from '@/lib/db';
import { emptyAgencyValues, type AgencyValues } from '@/lib/agency-validation';
import { AgencyForm } from '@/components/agency/agency-form';
import { AgencyLogo } from '@/components/agency/agency-logo';
export const metadata: Metadata = { title: 'Agency settings' };
export default async function AgencySettingsPage({ params }: PageProps<'/agency/[agencyId]/settings'>) {
  const user = await requireWorkspaceUser();
  const { agencyId } = await params;
  const access = await getAgencyAccess(getDb(), user.id, agencyId, 'settings');
  if (!access) notFound();
  const { agency } = access;
  const values = Object.fromEntries(Object.keys(emptyAgencyValues).map(key => [key, agency[key as keyof AgencyValues] ?? ''])) as AgencyValues;
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">Agency settings</p><h1>{agency.name}</h1><p>Keep your agency’s business details up to date.</p></div><span className="agency-owner">{access.role === 'OWNER' ? 'Owner' : 'Admin'}</span></div>
    <div className="agency-settings-grid"><aside><h2>Agency profile</h2><p>Your agency’s name and contact details live here. Changes are saved to this workspace.</p><AgencyLogo key={`${agency.id}-${agency.logoVersion}`} agencyId={agency.id} logoUrl={agency.logoUrl} logoVersion={agency.logoVersion} configured={Boolean(process.env.UPLOADTHING_TOKEN)} /></aside><AgencyForm key={agency.id} agencyId={agency.id} revision={agency.revision} initialValues={values} /></div></>;
}
