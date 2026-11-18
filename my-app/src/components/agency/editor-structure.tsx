'use client';
import { useId, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, pointerWithin, closestCenter, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import type { EditorNode } from '@/lib/editor-content';
import type { EditorOperation } from '@/lib/editor-operations';

type SlotData = { parentId: string; beforeId: string | null; order: number; label: string };
const coordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
  event.preventDefault();
  const slots = context.droppableContainers.getEnabled().map(item => ({ data: item.data.current as SlotData, rect: context.droppableRects.get(item.id), id: item.id })).filter(item => item.rect).sort((a, b) => a.data.order - b.data.order);
  const index = slots.findIndex(item => item.id === context.over?.id);
  const delta = ['ArrowUp', 'ArrowLeft'].includes(event.code) ? -1 : 1;
  const target = slots[index < 0 ? (delta > 0 ? 0 : slots.length - 1) : index + delta]?.rect;
  if (!target || !context.collisionRect) return;
  return { x: currentCoordinates.x + target.left + target.width / 2 - context.collisionRect.left - context.collisionRect.width / 2,
    y: currentCoordinates.y + target.top + target.height / 2 - context.collisionRect.top - context.collisionRect.height / 2 };
};
const label = (node: EditorNode) => node.type === 'container' ? 'Section' : node.type === 'image' ? `Image: ${node.alt.slice(0, 40) || 'Decorative'}` : `${node.type}: ${node.text.slice(0, 40) || 'Empty'}`;
function Slot({ data, disabled }: { data: SlotData; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${data.parentId}:${data.beforeId ?? 'end'}`, data, disabled });
  return <div ref={setNodeRef} style={{ minHeight: 24, padding: 4, border: isOver ? '2px solid currentColor' : '1px dashed var(--border)', opacity: disabled ? 0.35 : 1 }}><small>{data.label}</small></div>;
}
function Block({ node, disabled, children }: { node: EditorNode; disabled: boolean; children?: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: node.id, disabled, data: { label: label(node) } });
  return <div ref={setNodeRef} style={{ padding: 8, opacity: isDragging ? 0.45 : 1 }}>
    <button ref={setActivatorNodeRef} type="button" className="text-action" style={{ touchAction: 'none' }} {...attributes} {...listeners} disabled={disabled} aria-label={`Move ${label(node)}`}>Move {label(node)}</button>
    {children}
  </div>;
}
export function EditorStructure({ root, disabled, change }: { root: EditorNode; disabled: boolean; change: (operation: EditorOperation) => void }) {
  const id = useId(); const [active, setActive] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: coordinates }));
  let order = 0;
  function tree(node: EditorNode, insideActive = false): React.ReactNode {
    if (node.type !== 'container') return null;
    const blocked = insideActive || node.id === active;
    return <div style={{ marginLeft: 16 }}>
      {node.children.map(child => <div key={child.id}>
        <Slot data={{ parentId: node.id, beforeId: child.id, order: order++, label: `Before ${label(child)}` }} disabled={disabled || blocked || child.id === active} />
        <Block node={child} disabled={disabled}>{tree(child, blocked)}</Block>
      </div>)}
      <Slot data={{ parentId: node.id, beforeId: null, order: order++, label: node.id === root.id ? 'End of page' : 'End of section' }} disabled={disabled || blocked} />
    </div>;
  }
  return <section aria-label="Page structure"><h2>Arrange blocks</h2><p>Drag a Move handle to an insertion line. With a handle focused, press Space, use arrow keys to choose a line, then Space to drop or Escape to cancel.</p>
    <DndContext id={id} sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)}
      accessibility={{ screenReaderInstructions: { draggable: 'Press Space to pick up. Arrow keys move between insertion lines. Press Space to drop, or Escape to cancel.' } }}
      onDragStart={event => setActive(String(event.active.id))} onDragCancel={() => setActive(null)}
      onDragEnd={event => { setActive(null); const slot = event.over?.data.current as SlotData | undefined; if (!disabled && slot) change({ type: 'place', id: String(event.active.id), parentId: slot.parentId, beforeId: slot.beforeId }); }}>
      {tree(root)}
      <DragOverlay>{active ? <div className="agency-empty">Moving block</div> : null}</DragOverlay>
    </DndContext>
  </section>;
}
