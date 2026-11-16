import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { listPipelines } from '@/lib/pipelines';
import { PipelineForm } from '@/components/agency/pipeline-forms';
export const metadata = { title: 'Project boards' };
export default async function Pipelines({ params }: PageProps<'/subaccount/[subaccountId]/pipelines'>) {
  const user = await requireWorkspaceUser();
  const { subaccountId } = await params;
  const data = await listPipelines(getDb(), user.id, subaccountId);
  if (!data) notFound();
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{data.access.name}</p><h1>Project boards</h1><p>Keep the next step in sight.</p></div><Link className="text-action" href={`/subaccount/${subaccountId}`}>Back to workspace</Link></div>
    {data.pipelines.length ? <ul className="client-list">{data.pipelines.map(board => <li key={board.id}><div><h2>{board.name}</h2><p>{board._count.lanes} lanes</p></div><Link className="text-action" href={`/subaccount/${subaccountId}/pipelines/${board.id}`}>Open board<span className="sr-only"> {board.name}</span></Link></li>)}</ul> : <section className="agency-empty"><h2>No boards yet</h2><p>{data.access.role === 'GUEST' ? 'Boards created by your team will appear here.' : 'Create a board for a project or a client workflow.'}</p></section>}
    {data.access.role !== 'GUEST' && <section className="launchpad-section"><h2>Create a board</h2><p className="pipeline-hint">Start with To do, In progress, and Done. You can rename lanes or add your own.</p><PipelineForm create hidden={{ subAccountId: subaccountId, creationKey: randomUUID() }} fields={[{ name: 'name', label: 'Board name' }]} label="Create board" /></section>}
  </>;
}
