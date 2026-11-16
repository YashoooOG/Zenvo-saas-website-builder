'use client';
import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, pointerWithin, closestCenter, type KeyboardCoordinateGetter, type DragEndEvent } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { PipelineForm } from './pipeline-forms';
import { TicketDialog } from './ticket-dialog';
import { mutatePipelineAction } from '@/app/subaccount/pipeline-actions';
type Ticket = { id: string; title: string; description: string | null };
type Lane = { id: string; name: string; tickets: Ticket[] };
type Board = { id: string; revision: number; lanes: Lane[] };
type Drop = { laneId: string; laneIndex: number; position: number; beforeTicketId: string | null; label: string };

// Arrow keys select logical insertion slots rather than arbitrary pixel offsets.
const boardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) return;
  event.preventDefault();
  const active = context.active?.data.current as Drop | undefined;
  const current = (context.over?.data.current ?? active) as Drop | undefined;
  if (!active || !current || !context.collisionRect) return;
  const candidates = context.droppableContainers.getEnabled().map(container => ({ data: container.data.current as Drop, rect: context.droppableRects.get(container.id) })).filter(item => item.rect);
  const horizontal = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
  const delta = event.code === 'ArrowLeft' || event.code === 'ArrowUp' ? -1 : 1;
  const possible = candidates.filter(item => {
    if (item.data.laneId === active.laneId && (item.data.beforeTicketId === context.active?.id || item.data.position === active.position + 1)) return false;
    return horizontal ? item.data.laneIndex === current.laneIndex + delta : item.data.laneIndex === current.laneIndex && (item.data.position - current.position) * delta > 0;
  }).sort((a, b) => horizontal ? Math.abs(a.data.position - current.position) - Math.abs(b.data.position - current.position) : (a.data.position - b.data.position) * delta);
  const target = possible[0]?.rect;
  if (!target) return;
  return { x: currentCoordinates.x + target.left + target.width / 2 - context.collisionRect.left - context.collisionRect.width / 2,
    y: currentCoordinates.y + target.top + target.height / 2 - context.collisionRect.top - context.collisionRect.height / 2 };
};
function DropSlot({ data, disabled, children }: { data: Drop; disabled: boolean; children?: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${data.laneId}:${data.beforeTicketId ?? 'end'}`, data, disabled });
  return <div ref={setNodeRef} className={`ticket-drop-slot${isOver ? ' is-over' : ''}${children ? '' : ' ticket-drop-end'}`} aria-label={data.label}>{children ?? <span>Drop at end of {data.label.replace('End of ', '')}</span>}</div>;
}
function BoardTicket({ ticket, lane, laneIndex, index, board, subAccountId, editable, pending }: { ticket: Ticket; lane: Lane; laneIndex: number; index: number; board: Board; subAccountId: string; editable: boolean; pending: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: ticket.id, disabled: !editable || pending, data: { laneId: lane.id, laneIndex, position: index, title: ticket.title } });
  const hidden = { subAccountId, pipelineId: board.id, revision: String(board.revision) };
  return <div ref={setNodeRef} className={`pipeline-ticket${isDragging ? ' is-dragging' : ''}`}><div className="ticket-title-row"><h3>{ticket.title}</h3>{editable && <button ref={setActivatorNodeRef} type="button" className="ticket-drag-handle" {...attributes} {...listeners} aria-label={`Drag ${ticket.title}`} disabled={pending}><GripVertical size={18} aria-hidden="true" /></button>}</div>{ticket.description && <p className="pipeline-description">{ticket.description}</p>}
    {editable && <><TicketDialog scope={{ subAccountId, pipelineId: board.id, revision: board.revision }} ticket={ticket} disabled={pending} /><details className="pipeline-details"><summary>Move ticket<span className="sr-only"> {ticket.title}</span></summary><PipelineForm key={`${ticket.id}:${lane.id}`} hidden={{ ...hidden, operation: 'move-ticket', ticketId: ticket.id, direction: 'END' }} fields={[{ name: 'laneId', label: `Destination for ${ticket.title}`, initial: lane.id, options: board.lanes.map(item => ({ value: item.id, label: item.name })) }]} label="Move to lane end" compact disabled={pending} /><div className="pipeline-order"><PipelineForm hidden={{ ...hidden, operation: 'move-ticket', ticketId: ticket.id, laneId: lane.id, direction: 'UP' }} fields={[]} label={`Move up: ${ticket.title}`} disabled={pending || index === 0} compact /><PipelineForm hidden={{ ...hidden, operation: 'move-ticket', ticketId: ticket.id, laneId: lane.id, direction: 'DOWN' }} fields={[]} label={`Move down: ${ticket.title}`} disabled={pending || index === lane.tickets.length - 1} compact /></div></details></>}
  </div>;
}
export function PipelineBoard({ board, subAccountId, editable }: { board: Board; subAccountId: string; editable: boolean }) {
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: boardCoordinates }));
  const [active, setActive] = useState<Ticket | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const revisionAtStart = useRef(board.revision);
  const router = useRouter();
  const hidden = { subAccountId, pipelineId: board.id, revision: String(board.revision) };
  function drop(event: DragEndEvent) {
    setActive(null);
    const target = event.over?.data.current as Drop | undefined;
    if (!target || !editable || pending) return;
    const form = new FormData();
    for (const [key, value] of Object.entries({ subAccountId, pipelineId: board.id, revision: String(revisionAtStart.current), operation: 'place-ticket', ticketId: String(event.active.id), laneId: target.laneId, beforeTicketId: target.beforeTicketId ?? '' })) form.set(key, value);
    startTransition(async () => {
      setError(false); setMessage('Saving ticket position…');
      try { const result = await mutatePipelineAction({ success: false, message: '' }, form); setError(!result.success); setMessage(result.success ? 'Ticket position saved.' : result.message); }
      catch { setError(true); setMessage('The move could not be confirmed. Reload the board before trying again.'); }
    });
  }
  return <>
    <p className="pipeline-hint">{editable ? 'Drag a ticket by its handle to place it before another ticket or at a lane’s end. With a focused handle, press Space, use arrow keys, then Space to drop or Escape to cancel. Movement buttons are also available.' : 'You have read-only access to this board.'}</p>
    {message && <p role={error ? 'alert' : 'status'} className={error ? 'agency-field-error' : 'agency-feedback'}>{message}{error && <> <button className="text-action" onClick={() => router.refresh()}>Reload board</button></>}</p>}
    <DndContext id={dndId} sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)} accessibility={{ screenReaderInstructions: { draggable: 'Press Space or Enter to pick up a ticket. Use up and down to choose a position, left and right to change lanes. Press Space or Enter to save, or Escape to cancel.' }, announcements: {
      onDragStart: event => `Picked up ${event.active.data.current?.title ?? 'ticket'}.`, onDragOver: event => event.over ? `Place ${event.over.data.current?.label ?? 'in this lane'}.` : 'Outside the board drop targets.', onDragEnd: event => event.over ? 'Dropped ticket. Saving position.' : 'Move cancelled.', onDragCancel: () => 'Move cancelled.',
    } }} onDragStart={event => { revisionAtStart.current = board.revision; setMessage(''); setActive(board.lanes.flatMap(lane => lane.tickets).find(ticket => ticket.id === event.active.id) ?? null); }} onDragCancel={() => { setActive(null); setMessage('Move cancelled.'); setError(false); }} onDragEnd={drop}>
      <div className="pipeline-board" role="region" aria-label="Project board lanes" tabIndex={0} aria-busy={pending}>{board.lanes.map((lane, laneIndex) => <section key={lane.id} className="pipeline-lane" aria-labelledby={`lane-${lane.id}`}><div className="pipeline-lane-heading"><h2 id={`lane-${lane.id}`}>{lane.name}</h2><span>{lane.tickets.length}</span></div>
        {editable && <details className="pipeline-details"><summary>Rename lane<span className="sr-only"> {lane.name}</span></summary><PipelineForm key={lane.name} hidden={{ ...hidden, operation: 'rename-lane', laneId: lane.id }} fields={[{ name: 'name', label: 'Lane name', initial: lane.name }]} label="Save lane name" compact disabled={pending || Boolean(active)} /></details>}
        <ol className="pipeline-tickets">{lane.tickets.map((ticket, index) => <li key={ticket.id}><DropSlot disabled={!editable || pending} data={{ laneId: lane.id, laneIndex, position: index, beforeTicketId: ticket.id, label: `before ${ticket.title} in ${lane.name}` }}><BoardTicket ticket={ticket} lane={lane} laneIndex={laneIndex} index={index} board={board} subAccountId={subAccountId} editable={editable} pending={pending} /></DropSlot></li>)}</ol>
        {editable ? <DropSlot disabled={pending} data={{ laneId: lane.id, laneIndex, position: lane.tickets.length, beforeTicketId: null, label: `End of ${lane.name}` }} /> : !lane.tickets.length && <p className="pipeline-empty">No tickets in this lane.</p>}
        {editable && <details className="pipeline-details pipeline-add"><summary>Add ticket<span className="sr-only"> to {lane.name}</span></summary><PipelineForm hidden={{ ...hidden, operation: 'create-ticket', laneId: lane.id }} fields={[{ name: 'title', label: 'Ticket title' }, { name: 'description', label: 'Description (optional)', multiline: true }]} label="Create ticket" reset disabled={pending || Boolean(active)} /></details>}
      </section>)}</div>
      <DragOverlay dropAnimation={null}>{active && <div className="pipeline-ticket ticket-drag-preview"><h3>{active.title}</h3></div>}</DragOverlay>
    </DndContext>
    {editable && <section className="launchpad-section"><h2>Add a lane</h2><PipelineForm hidden={{ ...hidden, operation: 'add-lane' }} fields={[{ name: 'name', label: 'New lane name' }]} label="Add lane" reset disabled={pending || Boolean(active)} /></section>}
  </>;
}
