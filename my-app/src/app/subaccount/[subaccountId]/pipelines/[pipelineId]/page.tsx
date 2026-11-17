import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { getPipelineBoard } from '@/lib/pipelines';
import { PipelineForm } from '@/components/agency/pipeline-forms';
import { PipelineBoard } from '@/components/agency/pipeline-board';
export const metadata = { title: 'Project board' };
export default async function Board({ params }: PageProps<'/subaccount/[subaccountId]/pipelines/[pipelineId]'>) {
  const user = await requireWorkspaceUser();
  const { subaccountId, pipelineId } = await params;
  const data = await getPipelineBoard(getDb(), user.id, subaccountId, pipelineId);
  if (!data) notFound();
  const { pipeline, access } = data;
  const count = pipeline.lanes.reduce((sum, lane) => sum + lane.tickets.length, 0);
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{access.name}</p><h1>{pipeline.name}</h1><p>{count} {count === 1 ? 'ticket' : 'tickets'} across {pipeline.lanes.length} {pipeline.lanes.length === 1 ? 'lane' : 'lanes'}.</p></div><Link className="text-action" href={`/subaccount/${subaccountId}/pipelines`}>All boards</Link></div>{pipeline.archived && <section className="agency-empty"><h2>Archived board</h2><p>Tickets and lanes are preserved. Restore this board to continue editing. Workspace contacts remain shared with active boards.</p>{access.role !== 'GUEST' && <PipelineForm hidden={{ subAccountId: subaccountId, pipelineId, revision: String(pipeline.revision), operation: 'restore-board' }} fields={[]} label="Restore board" />}</section>}<PipelineBoard board={pipeline} subAccountId={subaccountId} editable={access.role !== 'GUEST' && !pipeline.archived} /></>;
}
