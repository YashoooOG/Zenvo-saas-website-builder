import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { AgencyForm } from '@/components/agency/agency-form';
export const metadata: Metadata = { title: 'Create an agency' };
export default async function NewAgencyPage() {
  await requireWorkspaceUser();
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">Your next workspace</p><h1>Create your agency</h1><p>Start with the basics. Make this space your own.</p></div></div>
    <div className="agency-settings-grid"><aside><h2>A space for your business</h2><p>These details belong to your agency. Only you can change them at this stage.</p><p>Creating an agency does not start a paid subscription.</p></aside><AgencyForm creationKey={randomUUID()} /></div></>;
}
