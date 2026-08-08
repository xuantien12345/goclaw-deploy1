import { describe, it, expect } from "vitest";
import {
  buildBoardColumns,
  canCrossMove,
  cloneItems,
  columnDropId,
  mergeColumnOrder,
  parseColumnDropId,
} from "./board-dnd-utils";
import { KANBAN_STATUSES } from "./board-utils";
import type { TeamTaskData } from "@/types/team";

function task(id: string, over: Partial<TeamTaskData> = {}): TeamTaskData {
  return { id, team_id: "team-1", subject: `Task ${id}`, status: "pending", priority: 0, ...over };
}

describe("columnDropId / parseColumnDropId", () => {
  it("round-trips column ids and rejects card ids", () => {
    expect(parseColumnDropId(columnDropId("pending"))).toBe("pending");
    expect(parseColumnDropId("8f14e45f-ceea-4670-9a4c-6d64b9c8e3aa")).toBeNull();
  });
});

describe("mergeColumnOrder", () => {
  it("keeps user order for known ids and drops stale ids", () => {
    expect(mergeColumnOrder(["a", "b", "c"], ["c", "a", "gone"])).toEqual(["b", "c", "a"]);
  });

  it("puts ids new to the column first", () => {
    expect(mergeColumnOrder(["new", "a", "b"], ["b", "a"])).toEqual(["new", "b", "a"]);
  });

  it("uses derived order when there is no previous order", () => {
    expect(mergeColumnOrder(["a", "b"], [])).toEqual(["a", "b"]);
  });
});

describe("buildBoardColumns", () => {
  it("always lists the fixed status columns for status grouping", () => {
    const { columnIds, items } = buildBoardColumns(
      [task("a"), task("b", { status: "completed" })],
      "status",
      new Map(),
      new Map(),
    );
    expect(columnIds).toEqual([...KANBAN_STATUSES]);
    expect(items.get("pending")).toEqual(["a"]);
    expect(items.get("completed")).toEqual(["b"]);
    expect(items.get("failed")).toEqual([]);
  });

  it("lists sorted non-empty owner columns for owner grouping", () => {
    const { columnIds } = buildBoardColumns(
      [task("a", { owner_agent_key: "zoe" }), task("b", { owner_agent_key: "amy" }), task("c")],
      "owner",
      new Map(),
      new Map(),
    );
    expect(columnIds).toEqual(["amy", "unassigned", "zoe"]);
  });

  it("preserves the previously rendered order across refreshes", () => {
    const prev = new Map([["pending", ["b", "a"]]]);
    const { items } = buildBoardColumns([task("a"), task("b")], "status", prev, new Map());
    expect(items.get("pending")).toEqual(["b", "a"]);
  });

  it("keeps optimistically moved cards in their target column", () => {
    const pending = new Map([["a", "amy"]]);
    const { items } = buildBoardColumns(
      [task("a", { owner_agent_key: "zoe" }), task("b", { owner_agent_key: "amy" })],
      "owner",
      new Map(),
      pending,
    );
    expect(items.get("zoe")).toEqual([]);
    expect(items.get("amy")).toEqual(["b", "a"]);
  });

  it("ignores pending moves for tasks that no longer exist", () => {
    const pending = new Map([["gone", "amy"]]);
    const { items } = buildBoardColumns(
      [task("b", { owner_agent_key: "amy" })],
      "owner",
      new Map(),
      pending,
    );
    expect(items.get("amy")).toEqual(["b"]);
  });
});

describe("canCrossMove", () => {
  const plain = task("a", { owner_agent_key: "zoe" });

  it("allows moving an idle task between owner columns when assign is available", () => {
    expect(canCrossMove(plain, "amy", "owner", true)).toBe(true);
  });

  it("blocks moves without an assign handler or outside owner grouping", () => {
    expect(canCrossMove(plain, "amy", "owner", false)).toBe(false);
    expect(canCrossMove(plain, "in_progress", "status", true)).toBe(false);
  });

  it("blocks dropping into the unassigned column", () => {
    expect(canCrossMove(plain, "unassigned", "owner", true)).toBe(false);
  });

  it("blocks locked (running) and terminal tasks", () => {
    const locked = task("a", {
      locked_at: new Date().toISOString(),
      lock_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(canCrossMove(locked, "amy", "owner", true)).toBe(false);
    expect(canCrossMove(task("a", { status: "completed" }), "amy", "owner", true)).toBe(false);
  });

  it("blocks moves for unknown tasks", () => {
    expect(canCrossMove(undefined, "amy", "owner", true)).toBe(false);
  });
});

describe("cloneItems", () => {
  it("copies arrays so mutations don't leak back", () => {
    const src = new Map([["pending", ["a"]]]);
    const copy = cloneItems(src);
    copy.get("pending")!.push("b");
    expect(src.get("pending")).toEqual(["a"]);
  });
});
