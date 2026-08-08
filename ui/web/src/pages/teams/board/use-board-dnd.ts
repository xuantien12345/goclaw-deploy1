import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  closestCenter,
  getFirstCollision,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  buildBoardColumns,
  canCrossMove,
  cloneItems,
  parseColumnDropId,
} from "./board-dnd-utils";
import { taskGroupKey } from "./board-utils";
import type { GroupBy } from "../stores/use-board-store";
import type { TeamTaskData } from "@/types/team";

interface UseBoardDndParams {
  tasks: TeamTaskData[];
  groupBy: GroupBy;
  onReassign?: (taskId: string, agentKey: string) => Promise<void>;
}

/**
 * Drag & drop state machine for the kanban board.
 *
 * Owns the rendered column/order state (so cards keep their user-arranged
 * position across WS refreshes), live cross-column previews while dragging,
 * and the optimistic commit + revert around the reassign RPC.
 */
export function useBoardDnd({ tasks, groupBy, onReassign }: UseBoardDndParams) {
  const [columnIds, setColumnIds] = useState<string[]>([]);
  const [items, setItems] = useState<Map<string, string[]>>(() => new Map());
  const [activeId, setActiveId] = useState<string | null>(null);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const itemsRef = useRef(items);
  const activeIdRef = useRef<string | null>(null);
  const originColRef = useRef<string | null>(null);
  const originItemsRef = useRef<Map<string, string[]> | null>(null);
  const pendingMovesRef = useRef(new Map<string, string>());
  const needsRebuildRef = useRef(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const groupByRef = useRef(groupBy);
  groupByRef.current = groupBy;
  const onReassignRef = useRef(onReassign);
  onReassignRef.current = onReassign;

  const applyItems = useCallback((next: Map<string, string[]>) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const rebuild = useCallback(
    (prevOverride?: Map<string, string[]>) => {
      const gb = groupByRef.current;
      const currentTasks = tasksRef.current;
      const pending = pendingMovesRef.current;
      for (const [taskId, col] of pending) {
        const task = currentTasks.find((t) => t.id === taskId);
        if (!task || gb !== "owner" || taskGroupKey(task, gb) === col) {
          pending.delete(taskId);
        }
      }
      const prev = prevOverride ?? itemsRef.current;
      const built = buildBoardColumns(currentTasks, gb, prev, pending);
      setColumnIds(built.columnIds);
      applyItems(built.items);
      needsRebuildRef.current = false;
    },
    [applyItems],
  );

  // Rebuild whenever data or grouping changes; deferred while a drag is
  // active so incoming WS refreshes can't yank cards out from under a drag.
  const lastGroupByRef = useRef(groupBy);
  useEffect(() => {
    const groupChanged = lastGroupByRef.current !== groupBy;
    lastGroupByRef.current = groupBy;
    if (activeIdRef.current) {
      needsRebuildRef.current = true;
      return;
    }
    rebuild(groupChanged ? new Map() : undefined);
  }, [tasks, groupBy, rebuild]);

  // A small movement threshold keeps plain clicks opening the task detail;
  // touch uses long-press so column scrolling stays natural.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Pointer-first collision detection: whatever is under the pointer wins,
  // and hits on a column container are refined to the nearest card inside it.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    const collisions =
      pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
    let overId = getFirstCollision(collisions, "id");
    if (overId == null) return [];
    const colKey = parseColumnDropId(String(overId));
    if (colKey != null) {
      const colItems = itemsRef.current.get(colKey) ?? [];
      if (colItems.length > 0) {
        const closest = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (c) => c.id !== overId && colItems.includes(String(c.id)),
          ),
        });
        const first = closest[0];
        if (first) overId = first.id;
      }
    }
    return [{ id: overId }];
  }, []);

  const findColumnOf = useCallback((id: UniqueIdentifier): string | null => {
    const key = String(id);
    const asCol = parseColumnDropId(key);
    if (asCol != null) return asCol;
    for (const [col, ids] of itemsRef.current) {
      if (ids.includes(key)) return col;
    }
    return null;
  }, []);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      activeIdRef.current = id;
      setActiveId(id);
      originColRef.current = findColumnOf(id);
      originItemsRef.current = cloneItems(itemsRef.current);
    },
    [findColumnOf],
  );

  // Live preview: as the card crosses into a valid column, move its id there
  // so surrounding cards animate apart and make room, Trello-style.
  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeKey = String(active.id);
      const overKey = String(over.id);
      const activeCol = findColumnOf(activeKey);
      const overCol = findColumnOf(overKey);
      if (!activeCol || !overCol || activeCol === overCol) return;
      if (!canCrossMove(taskById.get(activeKey), overCol, groupByRef.current, !!onReassignRef.current)) {
        return;
      }

      const next = cloneItems(itemsRef.current);
      const source = next.get(activeCol) ?? [];
      const target = next.get(overCol) ?? [];
      const activeIdx = source.indexOf(activeKey);
      if (activeIdx >= 0) source.splice(activeIdx, 1);

      let newIndex: number;
      if (parseColumnDropId(overKey) != null) {
        newIndex = target.length;
      } else {
        const overIdx = target.indexOf(overKey);
        const isBelowOverItem =
          active.rect.current.translated != null &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;
        newIndex = overIdx >= 0 ? overIdx + (isBelowOverItem ? 1 : 0) : target.length;
      }
      target.splice(newIndex, 0, activeKey);
      next.set(activeCol, source);
      next.set(overCol, target);
      applyItems(next);
    },
    [findColumnOf, taskById, applyItems],
  );

  const finishDrag = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
    originColRef.current = null;
    originItemsRef.current = null;
    if (needsRebuildRef.current) rebuild();
  }, [rebuild]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeKey = String(active.id);
      const originCol = originColRef.current;
      const currentCol = findColumnOf(activeKey);

      if (!over || !originCol || !currentCol) {
        if (originItemsRef.current) applyItems(originItemsRef.current);
        finishDrag();
        return;
      }

      if (currentCol === originCol) {
        // Same-column drop → local reorder.
        const overKey = String(over.id);
        const ids = itemsRef.current.get(currentCol) ?? [];
        const oldIndex = ids.indexOf(activeKey);
        const newIndex =
          parseColumnDropId(overKey) != null ? ids.length - 1 : ids.indexOf(overKey);
        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          const next = cloneItems(itemsRef.current);
          next.set(currentCol, arrayMove(ids, oldIndex, newIndex));
          applyItems(next);
        }
        finishDrag();
        return;
      }

      // Cross-column drop (already moved visually by onDragOver) → commit the
      // reassignment optimistically and revert if the RPC fails.
      const reassign = onReassignRef.current;
      if (groupByRef.current === "owner" && reassign) {
        pendingMovesRef.current.set(activeKey, currentCol);
        reassign(activeKey, currentCol).catch(() => {
          pendingMovesRef.current.delete(activeKey);
          rebuild();
        });
      } else if (originItemsRef.current) {
        applyItems(originItemsRef.current);
      }
      finishDrag();
    },
    [findColumnOf, applyItems, finishDrag, rebuild],
  );

  const onDragCancel = useCallback(() => {
    if (originItemsRef.current) applyItems(originItemsRef.current);
    finishDrag();
  }, [applyItems, finishDrag]);

  const activeTask = activeId ? (taskById.get(activeId) ?? null) : null;

  return {
    columnIds,
    items,
    taskById,
    activeTask,
    dragging: activeId != null,
    sensors,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}
