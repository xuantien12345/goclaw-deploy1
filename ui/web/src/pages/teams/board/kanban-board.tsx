import { memo } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  defaultDropAnimationSideEffects,
  type DropAnimation,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { useBoardDnd } from "./use-board-dnd";
import type { GroupBy } from "../stores/use-board-store";
import type { TeamTaskData } from "@/types/team";

interface KanbanBoardProps {
  tasks: TeamTaskData[];
  isTeamV2?: boolean;
  groupBy: GroupBy;
  emojiLookup?: Map<string, string>;
  memberLookup?: Map<string, string>;
  taskLookup?: Map<string, string>;
  onTaskClick: (task: TeamTaskData) => void;
  onDeleteTask?: (taskId: string) => void;
  onReassign?: (taskId: string, agentKey: string) => Promise<void>;
}

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

const noop = () => {};

export const KanbanBoard = memo(function KanbanBoard({ tasks, isTeamV2, groupBy, emojiLookup, memberLookup, taskLookup, onTaskClick, onDeleteTask, onReassign }: KanbanBoardProps) {
  const {
    columnIds,
    items,
    taskById,
    activeTask,
    dragging,
    sensors,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  } = useBoardDnd({ tasks, groupBy, onReassign });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        className={
          "flex h-full gap-3 overflow-x-auto overscroll-contain p-4 rounded-lg" +
          // Scroll snapping + CSS smooth scrolling fight dnd-kit's auto-scroll,
          // so they are only active while no card is being dragged.
          (dragging ? "" : " scroll-smooth snap-x snap-mandatory")
        }
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {columnIds.map((col) => {
          const colTasks = (items.get(col) ?? [])
            .map((id) => taskById.get(id))
            .filter((task): task is TeamTaskData => task != null);
          return (
            <div key={col} className="snap-start self-start max-h-full flex">
              <KanbanColumn
                columnId={col}
                title={col}
                tasks={colTasks}
                isTeamV2={isTeamV2}
                emojiLookup={emojiLookup}
                memberLookup={memberLookup}
                taskLookup={taskLookup}
                onTaskClick={onTaskClick}
                onDeleteTask={onDeleteTask}
              />
            </div>
          );
        })}
      </div>

      {createPortal(
        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? (
            <div className="rotate-3 scale-[1.03] cursor-grabbing rounded-lg shadow-xl ring-1 ring-primary/20">
              <KanbanCard
                task={activeTask}
                isTeamV2={isTeamV2}
                emojiLookup={emojiLookup}
                memberLookup={memberLookup}
                taskLookup={taskLookup}
                onClick={noop}
              />
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
});
