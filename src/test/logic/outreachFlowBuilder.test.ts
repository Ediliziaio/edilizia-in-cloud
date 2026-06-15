import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import {
  aiFlowToReactFlow,
  insertNodeOnEdge,
  flowToSteps,
  type FlowNodeData,
  type AiFlowGraph,
} from "@/components/admin/outreach/flow/graph";
import {
  simulatePath,
  entryNodeId,
  evalConditionPreview,
  type PreviewActivity,
} from "@/components/admin/outreach/flow/preview";

// ── Helpers ──────────────────────────────────────────────────────────────────
function n(id: string, type: FlowNodeData extends never ? never : string, data: FlowNodeData = {}, y = 0): Node<FlowNodeData> {
  return { id, type, position: { x: 0, y }, data };
}
function e(id: string, source: string, target: string, handle?: "yes" | "no"): Edge {
  return { id, source, target, sourceHandle: handle, type: "addStep" };
}

// ── A. AI graph → React Flow ─────────────────────────────────────────────────
describe("aiFlowToReactFlow", () => {
  const graph: AiFlowGraph = {
    name: "Test",
    nodes: [
      { key: "open", type: "email", subject: "Ciao", body: "Corpo", delay_days: 0 },
      { key: "wait1", type: "wait", delay_days: 2 },
      { key: "cond", type: "condition", condition_type: "not_opened" },
      { key: "reinvio", type: "email", subject: "Re", body: "B2", delay_days: 1 },
      { key: "end_ok", type: "end" },
    ],
    edges: [
      { from_key: "open", to_key: "wait1", branch: "default" },
      { from_key: "wait1", to_key: "cond", branch: "default" },
      { from_key: "cond", to_key: "reinvio", branch: "default" }, // SÌ (non ha aperto)
      { from_key: "cond", to_key: "end_ok", branch: "alt" }, // NO
      { from_key: "reinvio", to_key: "end_ok", branch: "default" },
    ],
  };

  it("mappa ogni key su un uuid e preserva i tipi/dati", () => {
    const { nodes, edges } = aiFlowToReactFlow(graph);
    expect(nodes).toHaveLength(5);
    expect(edges).toHaveLength(5);
    const email = nodes.find((nd) => nd.data.subject === "Ciao");
    expect(email?.type).toBe("email");
    // gli id sono uuid (non le key originali)
    expect(nodes.every((nd) => nd.id !== "open" && nd.id.length > 10)).toBe(true);
  });

  it("traduce branch→handle: default→yes su condition, alt→no", () => {
    const { nodes, edges } = aiFlowToReactFlow(graph);
    const cond = nodes.find((nd) => nd.type === "condition")!;
    const out = edges.filter((ed) => ed.source === cond.id);
    expect(out.find((ed) => ed.sourceHandle === "yes")).toBeTruthy();
    expect(out.find((ed) => ed.sourceHandle === "no")).toBeTruthy();
  });

  it("gli archi non-condition non hanno handle e flowToSteps li mappa su next_default", () => {
    const { nodes, edges } = aiFlowToReactFlow(graph);
    const steps = flowToSteps(nodes, edges, "seq-1");
    const condStep = steps.find((s) => s.node_type === "condition")!;
    // condizione: next_default = ramo SÌ, next_alt = ramo NO (entrambi valorizzati)
    expect(condStep.next_default).toBeTruthy();
    expect(condStep.next_alt).toBeTruthy();
    expect(condStep.next_default).not.toBe(condStep.next_alt);
  });

  it("scarta archi verso key inesistenti e uscite duplicate per (source,branch)", () => {
    const dirty: AiFlowGraph = {
      nodes: [
        { key: "a", type: "email", subject: "x", body: "y" },
        { key: "b", type: "end" },
      ],
      edges: [
        { from_key: "a", to_key: "b", branch: "default" },
        { from_key: "a", to_key: "ghost", branch: "default" }, // target inesistente
        { from_key: "a", to_key: "b", branch: "default" }, // duplicato
      ],
    };
    const { edges } = aiFlowToReactFlow(dirty);
    expect(edges).toHaveLength(1);
  });

  it("grafo vuoto → nessun nodo/arco (degrado sicuro)", () => {
    expect(aiFlowToReactFlow({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });
});

// ── B. Insert-on-edge ────────────────────────────────────────────────────────
describe("insertNodeOnEdge", () => {
  it("inserisce un nodo tra due, conservando il ramo dell'arco originale", () => {
    const nodes = [n("a", "email", {}, 0), n("b", "email", {}, 200)];
    const edges = [e("ab", "a", "b")];
    const wait = n("w", "wait");
    const res = insertNodeOnEdge(nodes, edges, "ab", wait);
    expect(res.nodes).toHaveLength(3);
    // l'arco a→b sparisce, restano a→w e w→b
    expect(res.edges.find((ed) => ed.id === "ab")).toBeUndefined();
    expect(res.edges.find((ed) => ed.source === "a" && ed.target === "w")).toBeTruthy();
    expect(res.edges.find((ed) => ed.source === "w" && ed.target === "b")).toBeTruthy();
  });

  it("eredita il sourceHandle (ramo NO) sull'arco entrante al nuovo nodo", () => {
    const nodes = [n("c", "condition", { condition_type: "opened" }, 0), n("b", "email", {}, 200)];
    const edges = [e("cb", "c", "b", "no")];
    const res = insertNodeOnEdge(nodes, edges, "cb", n("w", "wait"));
    const incoming = res.edges.find((ed) => ed.source === "c" && ed.target === "w");
    expect(incoming?.sourceHandle).toBe("no");
    // l'arco uscente dal wait è default (nessun handle)
    const outgoing = res.edges.find((ed) => ed.source === "w" && ed.target === "b");
    expect(outgoing?.sourceHandle).toBeUndefined();
  });

  it("arco inesistente → stato invariato", () => {
    const nodes = [n("a", "email")];
    const edges = [e("ab", "a", "b")];
    const res = insertNodeOnEdge(nodes, edges, "zzz", n("w", "wait"));
    expect(res.nodes).toBe(nodes);
    expect(res.edges).toBe(edges);
  });
});

// ── D. Preview traversal ─────────────────────────────────────────────────────
describe("simulatePath", () => {
  // Grafo: open(email) → cond(not_opened) ─SÌ→ reinvio(email) → end
  //                                        └NO→ followup(email) → end
  const nodes = [
    n("open", "email", { subject: "Apertura", delay_days: 0 }, 0),
    n("cond", "condition", { condition_type: "not_opened" }, 150),
    n("reinvio", "email", { subject: "Re-invio", delay_days: 2 }, 300),
    n("followup", "email", { subject: "Follow-up", delay_days: 1 }, 300),
    n("end", "end", {}, 450),
  ];
  const edges = [
    e("e1", "open", "cond"),
    e("e2", "cond", "reinvio", "yes"), // SÌ = non ha aperto
    e("e3", "cond", "followup", "no"), // NO = ha aperto
    e("e4", "reinvio", "end"),
    e("e5", "followup", "end"),
  ];

  it("entryNodeId trova la radice senza archi entranti", () => {
    expect(entryNodeId(nodes, edges)).toBe("open");
  });

  it("ramo SÌ quando NON ha aperto: passa per re-invio", () => {
    const act: PreviewActivity = { opened: false, replied: false };
    const r = simulatePath(nodes, edges, act);
    expect(r.pathNodeIds).toEqual(["open", "cond", "reinvio", "end"]);
    expect(r.emails.map((m) => m.subject)).toEqual(["Apertura", "Re-invio"]);
    expect(r.reachedEnd).toBe(true);
    expect(r.aborted).toBe(false);
  });

  it("ramo NO quando ha aperto: passa per follow-up", () => {
    const act: PreviewActivity = { opened: true, replied: false };
    const r = simulatePath(nodes, edges, act);
    expect(r.pathNodeIds).toEqual(["open", "cond", "followup", "end"]);
    expect(r.emails.map((m) => m.subject)).toEqual(["Apertura", "Follow-up"]);
  });

  it("ritardo cumulato somma i delay lungo il cammino", () => {
    const r = simulatePath(nodes, edges, { opened: false, replied: false });
    // open delay 0 → cumulativo 0; reinvio delay 2 → cumulativo 2
    expect(r.emails[0].cumulativeDays).toBe(0);
    expect(r.emails[1].cumulativeDays).toBe(2);
  });

  it("guardia anti-loop: cammino ciclico → aborted, niente loop infinito", () => {
    const loopNodes = [n("a", "email", {}, 0), n("b", "email", {}, 100)];
    const loopEdges = [e("ab", "a", "b"), e("ba", "b", "a")];
    const r = simulatePath(loopNodes, loopEdges, { opened: true, replied: false });
    expect(r.aborted).toBe(true);
  });

  it("condizione senza tipo → ramo NO (conservativo)", () => {
    expect(evalConditionPreview(null, { opened: true, replied: true })).toBe(false);
    expect(evalConditionPreview("replied", { opened: false, replied: true })).toBe(true);
    expect(evalConditionPreview("not_replied", { opened: false, replied: true })).toBe(false);
  });
});
