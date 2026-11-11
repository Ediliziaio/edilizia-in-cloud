import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import { withTriggerScaffold, triggerEntryTargets } from "@/components/flow-builder/triggerScaffold";
const node = (id: string, type = "action", y = 200): Node => ({ id, type, position: { x: 300, y }, data: {} });
const edge = (source: string, target: string, label?: string): Edge => ({ id: `${source}-${target}`, source, target, label });
const scaffold = (nodes: Node[], edges: Edge[]) => withTriggerScaffold(nodes, edges, () => {}, () => {});
describe("restoring automation entry after last trigger deletion", () => {
  it("restores entry to the existing action rather than Fine, preserving decision branches", () => {
    const edges = [edge("action", "yes", "Sì"), edge("action", "no", "No")];
    const result = scaffold([node("action", "condition"), node("yes"), node("no"), node("end", "end")], edges);
    expect(result.edges.filter(e => e.source === "placeholder-trigger").map(e => e.target)).toEqual(["action"]);
    expect(result.edges.slice(0,2)).toEqual(edges);
    expect(scaffold(result.nodes, result.edges)).toEqual(result);
  });
  it("keeps every disconnected root available rather than losing a former trigger branch", () => {
    expect(triggerEntryTargets([node("one"), node("two"), node("note", "note"), node("end", "end")], []).map(n => n.id)).toEqual(["one", "two"]);
  });
  it("uses Fine for an empty flow", () => {
    expect(scaffold([node("end", "end")], []).edges[0].target).toBe("end");
  });
  it("removes the visual entry after undo restores a real trigger", () => {
    const result = scaffold([node("action"), node("end", "end")], []);
    const restored = scaffold([...result.nodes, node("real", "trigger")], [...result.edges, edge("real", "action")]);
    expect(restored.nodes.some(n => n.data.isEmpty)).toBe(false);
    expect(restored.edges.map(e => e.source)).toEqual(["real"]);
  });
  it("does not alter a flow that still has a parallel trigger", () => {
    const nodes = [node("real", "trigger"), node("action")];
    const edges = [edge("real", "action")];
    const result = scaffold(nodes, edges);
    expect(result.nodes).toBe(nodes); expect(result.edges).toBe(edges);
  });
  it("does not conceal a cycle by pointing an entry directly to Fine", () => {
    expect(triggerEntryTargets([node("one"), node("two"), node("end", "end")], [edge("one","two"),edge("two","one")])).toEqual([]);
  });
});
