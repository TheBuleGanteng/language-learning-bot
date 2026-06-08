'use client';

import * as React from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReorderMove {
  movedId: string;
  /** The visible neighbour now directly ABOVE the moved item (undefined at top). */
  beforeId?: string;
  /** The visible neighbour now directly BELOW the moved item (undefined at bottom). */
  afterId?: string;
  /** The full id list after the move (for optimistic reordering). */
  newIds: string[];
}

interface ProviderProps {
  /** Ordered ids of the currently-visible rows. */
  ids: string[];
  onMove: (move: ReorderMove) => void;
  /** When true, render children without any drag behaviour. */
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps a list/table body in a dnd-kit sortable context. Pointer + touch sensors
 * (touch is required: reorder must work on mobile). Computes the dropped item's
 * new visible neighbours and hands them to `onMove`.
 */
export function ReorderProvider({ ids, onMove, disabled, children }: ProviderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const newIds = arrayMove(ids, from, to);
    const pos = newIds.indexOf(String(active.id));
    onMove({
      movedId: String(active.id),
      beforeId: pos > 0 ? newIds[pos - 1] : undefined,
      afterId: pos < newIds.length - 1 ? newIds[pos + 1] : undefined,
      newIds,
    });
  }

  if (disabled) return <>{children}</>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export interface SortableRowApi {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  handleProps: React.HTMLAttributes<HTMLElement>;
  isDragging: boolean;
}

/**
 * Render-prop wrapper so existing inline row JSX can stay put: it calls the
 * sortable hook and hands the row the ref/style/handle props to apply.
 *
 *   <SortableRow id={i.id}>
 *     {({ setNodeRef, style, handleProps }) => (
 *       <TableRow ref={setNodeRef} style={style}>
 *         <TableCell><DragHandle handleProps={handleProps} /></TableCell>
 *         …
 *       </TableRow>
 *     )}
 *   </SortableRow>
 */
export function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (api: SortableRowApi) => React.ReactNode;
}) {
  const api = useSortableRow(id);
  return <>{children(api)}</>;
}

/** Per-row hook — call inside a component rendered within ReorderProvider. */
export function useSortableRow(id: string): SortableRowApi {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
    id,
  });
  return {
    setNodeRef,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : undefined,
      position: isDragging ? 'relative' : undefined,
      zIndex: isDragging ? 20 : undefined,
    },
    handleProps: { ...attributes, ...(listeners ?? {}) },
    isDragging,
  };
}

/** A compact grip button that initiates the drag. Only the handle starts a drag. */
export function DragHandle({
  handleProps,
  className,
  label = 'Drag to reorder',
}: {
  handleProps: React.HTMLAttributes<HTMLElement>;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      {...handleProps}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex h-6 w-6 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/50 hover:bg-muted hover:text-foreground active:cursor-grabbing',
        className,
      )}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
