import { groupTasksBy, isTaskLocked, KANBAN_STATUSES, UNASSIGNED_KEY } from "./board-utils";
import { isTerminalStatus } from "../task-sections/task-utils";
import type { GroupBy } from "../stores/use-board-store";
import type { TeamTaskData } from "@/types/team";

/**
 * Droppable id prefix for column containers so they never collide with task
 * UUIDs used as sortable ids.
 */
const COLUMN_PREFIX = "column::";

/** Droppable id for a kanban column container */
export function columnDropId(columnId: string): string {
  return COLUMN_PREFIX + columnId;
}

/** Extract the column id from a droppable id, or null if it's a card id */
export function parseColumnDropId(id: string): string | null {
  return id.startsWith(COLUMN_PREFIX) ? id.slice(COLUMN_PREFIX.length) : null;
}

/** Deep-copy a column→taskIds map so drag previews never mutate rendered state */
export function cloneItems(items: ReadonlyMap<string, string[]>): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const [col, ids] of items) next.set(col, [...ids]);
  return next;
}

/**
 * Merge a column's derived membership with the order the user last saw.
 * Known ids keep their user-arranged order; ids new to the column go on top
 * (matching the "newest first" upsert behavior); stale ids are dropped.
 */
export function mergeColumnOrder(derivedIds: string[], prevIds: string[]): string[] {
  const derived = new Set(derivedIds);
  const kept = prevIds.filter((id) => derived.has(id));
  const keptSet = new Set(kept);
  const fresh = derivedIds.filter((id) => !keptSet.has(id));
  return [...fresh, ...kept];
}

/**
 * Build the board's column list and per-column task-id order from task data,
 * preserving the previously rendered order and applying optimistic moves that
 * the server hasn't confirmed yet.
 */
export function buildBoardColumns(
  tasks: TeamTaskData[],
  groupBy: GroupBy,
  prevItems: ReadonlyMap<string, string[]>,
  pendingMoves: ReadonlyMap<string, string>,
): { columnIds: string[]; items: Map<string, string[]> } {
  const membership = new Map<string, string[]>();
  for (const [col, colTasks] of groupTasksBy(tasks, groupBy)) {
    membership.set(col, colTasks.map((t) => t.id));
  }

  // Keep just-dropped cards in their target column until refreshed task data
  // catches up with the reassignment.
  const taskIds = new Set(tasks.map((t) => t.id));
  for (const [taskId, targetCol] of pendingMoves) {
    if (!taskIds.has(taskId)) continue;
    for (const [col, ids] of membership) {
      if (col === targetCol) continue;
      const idx = ids.indexOf(taskId);
      if (idx >= 0) ids.splice(idx, 1);
    }
    const target = membership.get(targetCol) ?? [];
    if (!target.includes(taskId)) target.push(taskId);
    membership.set(targetCol, target);
  }

  const columnIds =
    groupBy === "status" ? [...KANBAN_STATUSES] : [...membership.keys()].sort();

  const items = new Map<string, string[]>();
  for (const col of columnIds) {
    items.set(col, mergeColumnOrder(membership.get(col) ?? [], prevItems.get(col) ?? []));
  }
  return { columnIds, items };
}

/**
 * Whether a card may be dropped into a different column. Only the owner
 * grouping has a backend action (reassign via teams.tasks.assign); running or
 * finished tasks stay put so a drag can't re-dispatch them.
 */
export function canCrossMove(
  task: TeamTaskData | undefined,
  targetColumnId: string,
  groupBy: GroupBy,
  canAssign: boolean,
): boolean {
  if (!task || !canAssign || groupBy !== "owner") return false;
  if (targetColumnId === UNASSIGNED_KEY) return false;
  return !isTaskLocked(task) && !isTerminalStatus(task.status);
}
