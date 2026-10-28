import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { computeAutoLayout } from "@/components/flow-builder/autoLayout";
import { connectionsToEdges, edgesToConnections, insertedStepIncomingEdge } from "@/components/flow-builder/hooks/useFlowAdapter";

const node = (id: string, type = "action", width = 280, height = 120): Node => ({
  id, type, data: {}, position: { x: 0, y: 0 }, measured: { width, height },
});
const edge = (source: string, target: string, sourceHandle?: string): Edge => ({
  id: `${source}-${target}`, source, target, sourceHandle,
});
const center = (n: Node, positions: ReturnType<typeof computeAutoLayout>["positions"]) => positions[n.id].x + n.measured!.width! / 2;

describe("automation structured top-down layout", () => {
  it("aligns different card widths on the same vertical axis, including Fine", () => {
    const ns = [node("t", "trigger", 300), node("a"), node("delay", "delay", 160, 50), node("end", "end", 100, 44)];
    const es = [edge("t", "a"), edge("a", "delay"), edge("delay", "end")];
    const { positions } = computeAutoLayout(ns, es);
    expect(new Set(ns.map((n) => center(n, positions))).size).toBe(1);
    for (const e of es) expect(positions[e.target].y - positions[e.source].y).toBeGreaterThanOrEqual(ns.find((n) => n.id === e.source)!.measured!.height! + 96);
  });
  it("leaves connector space even under very tall cards", () => {
    const { positions } = computeAutoLayout([node("t", "trigger", 280, 330), node("a")], [edge("t", "a")]);
    expect(positions.a.y - positions.t.y).toBe(426);
  });
  it("keeps yes left and no right regardless of array order", () => {
    const ns = [node("no"), node("condition", "condition"), node("yes")];
    const { positions } = computeAutoLayout(ns, [edge("condition", "no", "no"), edge("condition", "yes", "yes")]);
    expect(positions.yes.x).toBeLessThan(positions.condition.x);
    expect(positions.no.x).toBeGreaterThan(positions.condition.x);
    expect(positions.yes.y).toBe(positions.no.y);
  });
  it("centers three split branches instead of biasing all branches to the right", () => {
    const split = { ...node("s", "split"), data: { percentuali: "40,30,30" } };
    const ns = [split, node("a"), node("b"), node("c")];
    const { positions } = computeAutoLayout(ns, [edge("s", "c", "split_2"), edge("s", "a", "split_0"), edge("s", "b", "split_1")]);
    expect(positions.a.x).toBeLessThan(positions.b.x);
    expect(positions.b.x).toBe(positions.s.x);
    expect(positions.c.x - positions.b.x).toBe(positions.b.x - positions.a.x);
  });
  it("puts a merge below ALL parents even with unequal path lengths", () => {
    const ns = [node("t", "trigger"), node("left"), node("right"), node("long"), node("merge", "end")];
    const es = [edge("t", "left", "yes"), edge("t", "right", "no"), edge("left", "long"), edge("long", "merge"), edge("right", "merge")];
    const { positions } = computeAutoLayout(ns, es);
    for (const e of es) expect(positions[e.target].y).toBeGreaterThan(positions[e.source].y);
    expect(center(ns[4], positions)).toBe((center(ns[1], positions) + center(ns[2], positions)) / 2);
  });
  it("keeps nested condition subtrees ordered and does not overlap wide cards", () => {
    const ns = [node("t", "trigger"), node("l", "condition", 440), node("r"), node("ll"), node("lr"), node("rr")];
    const es = [edge("t", "l", "yes"), edge("t", "r", "no"), edge("l", "ll", "yes"), edge("l", "lr", "no"), edge("r", "rr")];
    const { positions } = computeAutoLayout(ns, es);
    expect(positions.l.x + 440 + 72).toBeLessThanOrEqual(positions.r.x);
    expect(positions.ll.x).toBeLessThan(positions.lr.x);
    expect(positions.lr.x).toBeLessThan(positions.rr.x);
  });
  it("does not move annotations or mutate nodes, connections, labels or configs", () => {
    const ns = [node("t", "trigger"), node("a"), node("memo", "note")];
    const es = [edge("t", "a")];
    const before = JSON.stringify([ns, es]);
    const { positions } = computeAutoLayout(ns, es);
    expect(positions.memo).toBeUndefined();
    expect(JSON.stringify([ns, es])).toBe(before);
  });
  it("is deterministic and idempotent", () => {
    const ns = [node("t", "trigger"), node("a")];
    const es = [edge("t", "a")];
    const first = computeAutoLayout(ns, es);
    expect(computeAutoLayout(ns, es)).toEqual(first);
    expect(computeAutoLayout(ns.map((n) => ({ ...n, position: first.positions[n.id] })), es).movedCount).toBe(0);
  });
  it("handles disconnected nodes, invalid cycles and dangling edges without huge coordinates", () => {
    const ns = [node("a"), node("b"), node("orphan")];
    const result = computeAutoLayout(ns, [edge("a", "b"), edge("b", "a"), edge("a", "missing"), edge("b", "b")]);
    expect(Object.keys(result.positions)).toHaveLength(3);
    for (const p of Object.values(result.positions)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeLessThan(1000);
    }
  });
  it("handles empty, note-only and not-yet-measured canvases", () => {
    expect(computeAutoLayout([], [])).toEqual({ positions: {}, movedCount: 0 });
    expect(computeAutoLayout([node("memo", "note")], []).positions).toEqual({});
    const ns = [node("t", "trigger"), node("end", "end")].map((n): Node => ({ ...n, measured: undefined }));
    const { positions } = computeAutoLayout(ns, [edge("t", "end")]);
    expect(positions.end.y).toBeGreaterThan(positions.t.y);
    expect(positions.end.x + 50).toBe(positions.t.x + 140);
  });
});

describe("inserting a step keeps branch meaning", () => {
  it.each([["yes", "Sì"], ["no", "No"], ["split_0", "A: 50%"], ["split_1", "B: 50%"]])("preserves %s visually and after save/reload", (handle, label) => {
    const old = { ...edge("condition", "end", handle), label, targetHandle: "old-target" };
    const before = JSON.stringify(old);
    const incoming = insertedStepIncomingEdge(old, "new-edge", "new-action");
    expect(incoming).toMatchObject({ source: "condition", target: "new-action", sourceHandle: handle, label });
    expect(incoming.targetHandle).toBeUndefined();
    expect(JSON.stringify(old)).toBe(before);
    const stored = edgesToConnections([incoming], "flow", "company");
    expect(connectionsToEdges(stored as Parameters<typeof connectionsToEdges>[0])[0]).toMatchObject({ sourceHandle: handle, label, animated: false });
  });
});
