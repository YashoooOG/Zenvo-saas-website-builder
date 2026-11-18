import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getFunnelDraft } from '@/lib/funnel-drafts';
import { DraftEditor } from '@/components/agency/draft-editor';

export const metadata = { title: 'Edit draft' };
export default async function PageDraft({ params }: PageProps<'/subaccount/[subaccountId]/funnels/[funnelId]/pages/[pageId]'>) {
  const user = await requireWorkspaceUser(); const { subaccountId, funnelId, pageId } = await params;
  const data = await getFunnelDraft(getDb(), user.id, subaccountId, funnelId, pageId); if (!data) notFound();
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{data.page.funnelName} / {data.page.path}</p><h1>{data.page.name}</h1><p>Edit text and sections, then save your draft. Saving does not publish the page.</p></div><a className="text-action" href={`/subaccount/${subaccountId}/funnels/${funnelId}`}>Back to funnel</a></div>
    <DraftEditor key={pageId} subAccountId={subaccountId} funnelId={funnelId} pageId={pageId} initial={data.page.content} initialRevision={data.page.revision} editable={data.access.role !== 'GUEST'} />
  </>;
}
