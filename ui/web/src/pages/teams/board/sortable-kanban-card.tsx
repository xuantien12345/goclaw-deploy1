import { memo } from "react";
import {
  useSortable,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { KanbanCard } from "./kanban-card";
import type { TeamTaskData } from "@/types/team";

// Animate gap open/close also when the list changes outside an active drag
// (WS-driven inserts, removals, column moves), not only while sorting.
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

const sortTransition = { duration: 200, easing: "cubic-bezier(0.25, 1, 0.5, 1)" };

interface SortableKanbanCardProps {
  task: TeamTaskData;
  isTeamV2?: boolean;
  emojiLookup?: Map<string, string>;
  memberLookup?: Map<string, string>;
  taskLookup?: Map<string, string>;
  onClick: () => void;
  onDelete?: (taskId: string) => void;
}

/** Sortable wrapper: dnd-kit owns transforms here, KanbanCard stays presentational. */
export const SortableKanbanCard = memo(function SortableKanbanCard({
  task,
  ...cardProps
}: SortableKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, animateLayoutChanges, transition: sortTransition });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        touchAction: "manipulation",
      }}
      className={isDragging ? "opacity-40" : undefined}
      {...attributes}
      {...listeners}
    >
      <KanbanCard task={task} {...cardProps} />
    </div>
  );
});
