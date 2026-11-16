import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { getPipelineBoard } from '@/lib/pipelines';
import { PipelineForm } from '@/components/agency/pipeline-forms';
export const metadata = { title: 'Project board' };
export default async function Board({ params }: PageProps<'/subaccount/[subaccountId]/pipelines/[pipelineId]'>) {
  const user = await requireWorkspaceUser();
  const { subaccountId, pipelineId } = await params;
  const data = await getPipelineBoard(getDb(), user.id, subaccountId, pipelineId);
  if (!data) notFound();
  const { pipeline, access } = data;
  const editable = access.role !== 'GUEST';
  const hidden = { subAccountId: subaccountId, pipelineId, revision: String(pipeline.revision) };
  const count = pipeline.lanes.reduce((sum, lane) => sum + lane.tickets.length, 0);
  return <><div className="workspace-heading"><div><p className="workspace-eyebrow">{access.name}</p><h1>{pipeline.name}</h1><p>{count} {count === 1 ? 'ticket' : 'tickets'} across {pipeline.lanes.length} lanes.</p></div><Link className="text-action" href={`/subaccount/${subaccountId}/pipelines`}>All boards</Link></div>
    <p className="pipeline-hint">{editable ? 'Move tickets to another lane, or use Move up and Move down to change their order. Changes are saved as you go.' : 'You have read-only access to this board.'}</p>
    <div className="pipeline-board" role="region" aria-label="Project board lanes" tabIndex={0}>{pipeline.lanes.map(lane => <section key={lane.id} className="pipeline-lane" aria-labelledby={`lane-${lane.id}`}><div className="pipeline-lane-heading"><h2 id={`lane-${lane.id}`}>{lane.name}</h2><span>{lane.tickets.length}</span></div>
      {editable && <details className="pipeline-details"><summary>Rename lane<span className="sr-only"> {lane.name}</span></summary><PipelineForm key={lane.name} hidden={{ ...hidden, operation: 'rename-lane', laneId: lane.id }} fields={[{ name: 'name', label: 'Lane name', initial: lane.name }]} label="Save lane name" compact /></details>}
      <ol className="pipeline-tickets">{lane.tickets.map((ticket, index) => <li className="pipeline-ticket" key={ticket.id}><h3>{ticket.title}</h3>{ticket.description && <p className="pipeline-description">{ticket.description}</p>}{editable && <details className="pipeline-details"><summary>Move ticket<span className="sr-only"> {ticket.title}</span></summary><PipelineForm key={`${ticket.id}:${lane.id}`} hidden={{ ...hidden, operation: 'move-ticket', ticketId: ticket.id, direction: 'END' }} fields={[{ name: 'laneId', label: `Destination for ${ticket.title}`, initial: lane.id, options: pipeline.lanes.map(item => ({ value: item.id, label: item.name })) }]} label="Move to lane end" compact /><div className="pipeline-order"><PipelineForm hidden={{ ...hidden, operation: 'move-ticket', ticketId: ticket.id, laneId: lane.id, direction: 'UP' }} fields={[]} label={`Move up: ${ticket.title}`} disabled={index === 0} compact /><PipelineForm hidden={{ ...hidden, operation: 'move-ticket', ticketId: ticket.id, laneId: lane.id, direction: 'DOWN' }} fields={[]} label={`Move down: ${ticket.title}`} disabled={index === lane.tickets.length - 1} compact /></div></details>}</li>)}</ol>
      {!lane.tickets.length && <p className="pipeline-empty">No tickets in this lane.</p>}
      {editable && <details className="pipeline-details pipeline-add"><summary>Add ticket<span className="sr-only"> to {lane.name}</span></summary><PipelineForm hidden={{ ...hidden, operation: 'create-ticket', laneId: lane.id }} fields={[{ name: 'title', label: 'Ticket title' }, { name: 'description', label: 'Description (optional)', multiline: true }]} label="Create ticket" reset /></details>}
    </section>)}</div>
    {editable && <section className="launchpad-section"><h2>Add a lane</h2><PipelineForm hidden={{ ...hidden, operation: 'add-lane' }} fields={[{ name: 'name', label: 'New lane name' }]} label="Add lane" reset /></section>}
  </>;
}
