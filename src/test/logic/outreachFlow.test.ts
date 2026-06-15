import { describe, it, expect } from "vitest";
import {
  nodeType,
  isGraphSequence,
  entryNode,
  nodeById,
  evalCondition,
  nextNode,
  resolveActionable,
  planNextAction,
  MAX_CONDITION_HOPS,
  type FlowNode,
  type FlowActivity,
} from "../../../supabase/functions/_shared/outreach-flow";

// ── Helpers ──────────────────────────────────────────────────────────────────
function node(p: Partial<FlowNode> & { id: string }): FlowNode {
  return {
    id: p.id,
    step_order: p.step_order ?? 0,
    channel: p.channel ?? "email",
    node_type: p.node_type ?? null,
    condition_type: p.condition_type ?? null,
    next_default: p.next_default ?? null,
    next_alt: p.next_alt ?? null,
    delay_days: p.delay_days ?? 0,
    delay_hours: p.delay_hours ?? 0,
    subject: p.subject ?? null,
    body: p.body ?? null,
  };
}
const ACT_NONE: FlowActivity = { lastEmailOpened: false, hasReply: false };
const ACT_OPENED: FlowActivity = { lastEmailOpened: true, hasReply: false };
const ACT_REPLIED: FlowActivity = { lastEmailOpened: false, hasReply: true };

// ── Retrocompatibilità: sequenza lineare legacy ─────────────────────────────
describe("isGraphSequence — retrocompatibilità lineare", () => {
  it("sequenza legacy (node_type null, niente next_*) → NON è grafo", () => {
    const linear = [
      node({ id: "a", step_order: 0 }),
      node({ id: "b", step_order: 1 }),
      node({ id: "c", step_order: 2 }),
    ];
    expect(isGraphSequence(linear)).toBe(false);
  });
  it("sequenza con channel non-email ma senza next_* e node_type='email' → NON è grafo", () => {
    const mixed = [
      node({ id: "a", step_order: 0, channel: "email", node_type: "email" }),
      node({ id: "b", step_order: 1, channel: "email", node_type: "email" }),
    ];
    expect(isGraphSequence(mixed)).toBe(false);
  });
  it("uno step con next_default → è grafo", () => {
    const g = [
      node({ id: "a", step_order: 0, next_default: "b" }),
      node({ id: "b", step_order: 1 }),
    ];
    expect(isGraphSequence(g)).toBe(true);
  });
  it("uno step con next_alt → è grafo", () => {
    const g = [node({ id: "a", step_order: 0, next_alt: "b" }), node({ id: "b", step_order: 1 })];
    expect(isGraphSequence(g)).toBe(true);
  });
  it("presenza di un nodo non-email (wait/condition/end) → è grafo", () => {
    const g = [
      node({ id: "a", step_order: 0, node_type: "email" }),
      node({ id: "w", step_order: 1, node_type: "wait" }),
    ];
    expect(isGraphSequence(g)).toBe(true);
  });
});

describe("nodeType — fallback legacy", () => {
  it("null → 'email'", () => {
    expect(nodeType(node({ id: "a" }))).toBe("email");
  });
  it("rispetta il tipo esplicito", () => {
    expect(nodeType(node({ id: "a", node_type: "condition" }))).toBe("condition");
  });
});

// ── Entry node ──────────────────────────────────────────────────────────────
describe("entryNode", () => {
  it("ritorna il nodo non puntato da nessuno (radice)", () => {
    const nodes = [
      node({ id: "a", step_order: 0, next_default: "b" }),
      node({ id: "b", step_order: 1, next_default: "c" }),
      node({ id: "c", step_order: 2 }),
    ];
    expect(entryNode(nodes)?.id).toBe("a");
  });
  it("se più radici, sceglie lo step_order minimo", () => {
    const nodes = [
      node({ id: "x", step_order: 5 }),
      node({ id: "y", step_order: 2 }),
    ];
    expect(entryNode(nodes)?.id).toBe("y");
  });
  it("grafo ciclico (nessuna radice) → ripiega su step_order minimo", () => {
    const nodes = [
      node({ id: "a", step_order: 0, next_default: "b" }),
      node({ id: "b", step_order: 1, next_default: "a" }),
    ];
    expect(entryNode(nodes)?.id).toBe("a");
  });
  it("lista vuota → null", () => {
    expect(entryNode([])).toBeNull();
  });
});

describe("nodeById", () => {
  const nodes = [node({ id: "a" }), node({ id: "b" })];
  it("trova per id", () => expect(nodeById(nodes, "b")?.id).toBe("b"));
  it("id assente → null", () => expect(nodeById(nodes, "zzz")).toBeNull());
  it("id null/undefined → null", () => {
    expect(nodeById(nodes, null)).toBeNull();
    expect(nodeById(nodes, undefined)).toBeNull();
  });
});

// ── evalCondition ───────────────────────────────────────────────────────────
describe("evalCondition", () => {
  it("opened: vero solo se ha aperto", () => {
    expect(evalCondition("opened", ACT_OPENED)).toBe(true);
    expect(evalCondition("opened", ACT_NONE)).toBe(false);
  });
  it("not_opened: vero se NON ha aperto (incl. tracking spento)", () => {
    expect(evalCondition("not_opened", ACT_NONE)).toBe(true);
    expect(evalCondition("not_opened", ACT_OPENED)).toBe(false);
  });
  it("replied: vero solo se ha risposto", () => {
    expect(evalCondition("replied", ACT_REPLIED)).toBe(true);
    expect(evalCondition("replied", ACT_NONE)).toBe(false);
  });
  it("not_replied: vero se NON ha risposto", () => {
    expect(evalCondition("not_replied", ACT_NONE)).toBe(true);
    expect(evalCondition("not_replied", ACT_REPLIED)).toBe(false);
  });
  it("condition_type sconosciuto/null → false (ramo NO)", () => {
    expect(evalCondition(null, ACT_OPENED)).toBe(false);
    expect(evalCondition(undefined, ACT_REPLIED)).toBe(false);
  });
});

// ── nextNode ────────────────────────────────────────────────────────────────
describe("nextNode — email/wait", () => {
  it("email → next_default", () => {
    expect(nextNode(node({ id: "a", node_type: "email", next_default: "b" }), ACT_NONE)).toEqual({ nextId: "b" });
  });
  it("email con next_default NULL → null (fine)", () => {
    expect(nextNode(node({ id: "a", node_type: "email" }), ACT_NONE)).toEqual({ nextId: null });
  });
  it("wait → next_default", () => {
    expect(nextNode(node({ id: "w", node_type: "wait", next_default: "b" }), ACT_NONE)).toEqual({ nextId: "b" });
  });
  it("legacy (node_type null) si comporta come email → next_default", () => {
    expect(nextNode(node({ id: "a", next_default: "b" }), ACT_NONE)).toEqual({ nextId: "b" });
  });
});

describe("nextNode — condition", () => {
  const cond = (ct: FlowNode["condition_type"]) =>
    node({ id: "c", node_type: "condition", condition_type: ct, next_default: "yes", next_alt: "no" });
  it("opened SÌ → next_default (ramo yes)", () => {
    expect(nextNode(cond("opened"), ACT_OPENED)).toEqual({ nextId: "yes", branch: true });
  });
  it("opened NO → next_alt (ramo no)", () => {
    expect(nextNode(cond("opened"), ACT_NONE)).toEqual({ nextId: "no", branch: false });
  });
  it("not_opened SÌ (non aperto) → next_default", () => {
    expect(nextNode(cond("not_opened"), ACT_NONE)).toEqual({ nextId: "yes", branch: true });
  });
  it("replied SÌ → next_default", () => {
    expect(nextNode(cond("replied"), ACT_REPLIED)).toEqual({ nextId: "yes", branch: true });
  });
  it("not_replied SÌ → next_default", () => {
    expect(nextNode(cond("not_replied"), ACT_NONE)).toEqual({ nextId: "yes", branch: true });
  });
  it("ramo NO con next_alt NULL → null (fine)", () => {
    const c = node({ id: "c", node_type: "condition", condition_type: "opened", next_default: "yes" });
    expect(nextNode(c, ACT_NONE)).toEqual({ nextId: null, branch: false });
  });
});

describe("nextNode — end", () => {
  it("end → null", () => {
    expect(nextNode(node({ id: "e", node_type: "end" }), ACT_NONE)).toEqual({ nextId: null });
  });
});

// ── resolveActionable: instradamento immediato condition/end ────────────────
describe("resolveActionable", () => {
  it("parte da email → ritorna l'email stessa (azionabile)", () => {
    const nodes = [node({ id: "a", node_type: "email", next_default: "b" }), node({ id: "b", node_type: "email" })];
    const r = resolveActionable(nodes, nodes[0], ACT_NONE);
    expect(r.node?.id).toBe("a");
    expect(r.aborted).toBe(false);
  });

  it("condition→email: salta la condizione e si ferma sull'email del ramo scelto", () => {
    const nodes = [
      node({ id: "c", node_type: "condition", condition_type: "opened", next_default: "yes", next_alt: "no" }),
      node({ id: "yes", node_type: "email" }),
      node({ id: "no", node_type: "email" }),
    ];
    expect(resolveActionable(nodes, nodes[0], ACT_OPENED).node?.id).toBe("yes");
    expect(resolveActionable(nodes, nodes[0], ACT_NONE).node?.id).toBe("no");
  });

  it("condition→end (ramo) → node null (enrollment completato)", () => {
    const nodes = [
      node({ id: "c", node_type: "condition", condition_type: "replied", next_default: "stop", next_alt: "go" }),
      node({ id: "stop", node_type: "end" }),
      node({ id: "go", node_type: "email" }),
    ];
    const r = resolveActionable(nodes, nodes[0], ACT_REPLIED);
    expect(r.node).toBeNull();
    expect(r.aborted).toBe(false);
  });

  it("catena di più condition consecutive si risolve fino all'email", () => {
    const nodes = [
      node({ id: "c1", node_type: "condition", condition_type: "replied", next_default: "end1", next_alt: "c2" }),
      node({ id: "c2", node_type: "condition", condition_type: "opened", next_default: "openMail", next_alt: "noMail" }),
      node({ id: "end1", node_type: "end" }),
      node({ id: "openMail", node_type: "email" }),
      node({ id: "noMail", node_type: "email" }),
    ];
    // non ha risposto (→ c2), non ha aperto (→ noMail)
    expect(resolveActionable(nodes, nodes[0], ACT_NONE).node?.id).toBe("noMail");
    // non ha risposto (→ c2), ha aperto (→ openMail)
    expect(resolveActionable(nodes, nodes[0], ACT_OPENED).node?.id).toBe("openMail");
  });

  it("next NULL lungo la catena → node null (fine)", () => {
    const nodes = [node({ id: "c", node_type: "condition", condition_type: "opened" })]; // niente rami
    const r = resolveActionable(nodes, nodes[0], ACT_NONE);
    expect(r.node).toBeNull();
    expect(r.aborted).toBe(false);
  });

  it("start null → node null", () => {
    expect(resolveActionable([], null, ACT_NONE).node).toBeNull();
  });

  it("guardia anti-loop: condizioni che ciclano → aborted, node null", () => {
    const nodes = [
      node({ id: "c1", node_type: "condition", condition_type: "opened", next_default: "c2", next_alt: "c2" }),
      node({ id: "c2", node_type: "condition", condition_type: "opened", next_default: "c1", next_alt: "c1" }),
    ];
    const r = resolveActionable(nodes, nodes[0], ACT_OPENED);
    expect(r.node).toBeNull();
    expect(r.aborted).toBe(true);
    expect(r.hops).toBeLessThanOrEqual(MAX_CONDITION_HOPS + 1);
  });

  it("self-loop su singola condition → aborted (seen guard)", () => {
    const nodes = [
      node({ id: "c", node_type: "condition", condition_type: "opened", next_default: "c", next_alt: "c" }),
    ];
    const r = resolveActionable(nodes, nodes[0], ACT_OPENED);
    expect(r.aborted).toBe(true);
    expect(r.node).toBeNull();
  });
});

// ── planNextAction: azione del dispatcher (send / advance / complete) ────────
describe("planNextAction", () => {
  it("successore email → kind 'send' col delay dell'email destinazione", () => {
    const nodes = [
      node({ id: "a", node_type: "email", next_default: "b" }),
      node({ id: "b", node_type: "email", delay_days: 3, delay_hours: 2 }),
    ];
    const p = planNextAction(nodes, "b", ACT_NONE);
    expect(p.kind).toBe("send");
    expect(p.node?.id).toBe("b");
    expect(p.delayDays).toBe(3);
    expect(p.delayHours).toBe(2);
  });

  it("successore wait → kind 'advance' col delay del wait (differito)", () => {
    const nodes = [
      node({ id: "a", node_type: "email", next_default: "w" }),
      node({ id: "w", node_type: "wait", delay_days: 2, next_default: "b" }),
      node({ id: "b", node_type: "email" }),
    ];
    const p = planNextAction(nodes, "w", ACT_NONE);
    expect(p.kind).toBe("advance");
    expect(p.node?.id).toBe("w");
    expect(p.delayDays).toBe(2);
  });

  it("condition attraversata subito → si ferma sull'email del ramo (send)", () => {
    const nodes = [
      node({ id: "c", node_type: "condition", condition_type: "opened", next_default: "yes", next_alt: "no" }),
      node({ id: "yes", node_type: "email", delay_days: 1 }),
      node({ id: "no", node_type: "email", delay_days: 5 }),
    ];
    const opened = planNextAction(nodes, "c", ACT_OPENED);
    expect(opened.kind).toBe("send");
    expect(opened.node?.id).toBe("yes");
    expect(opened.delayDays).toBe(1);
    const notOpened = planNextAction(nodes, "c", ACT_NONE);
    expect(notOpened.node?.id).toBe("no");
    expect(notOpened.delayDays).toBe(5);
  });

  it("startId NULL → complete", () => {
    expect(planNextAction([], null, ACT_NONE)).toMatchObject({ kind: "complete", node: null });
  });

  it("condition → end → complete", () => {
    const nodes = [
      node({ id: "c", node_type: "condition", condition_type: "replied", next_default: "stop", next_alt: "go" }),
      node({ id: "stop", node_type: "end" }),
      node({ id: "go", node_type: "email" }),
    ];
    expect(planNextAction(nodes, "c", ACT_REPLIED)).toMatchObject({ kind: "complete", aborted: false });
  });

  it("loop di condizioni → complete con aborted=true (sicuro)", () => {
    const nodes = [
      node({ id: "c1", node_type: "condition", condition_type: "opened", next_default: "c2", next_alt: "c2" }),
      node({ id: "c2", node_type: "condition", condition_type: "opened", next_default: "c1", next_alt: "c1" }),
    ];
    const p = planNextAction(nodes, "c1", ACT_OPENED);
    expect(p.kind).toBe("complete");
    expect(p.aborted).toBe(true);
  });
});
