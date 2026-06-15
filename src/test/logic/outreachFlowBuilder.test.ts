import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import {
  aiFlowToReactFlow,
  insertNodeOnEdge,
  flowToSteps,
  channelOfNodeType,
  isSendNodeType,
  validateFlow,
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

// ── E. MULTICANALE: nodi whatsapp/sms nel builder ────────────────────────────
describe("channelOfNodeType / isSendNodeType", () => {
  it("mappa i nodi d'invio sul loro canale", () => {
    expect(channelOfNodeType("email")).toBe("email");
    expect(channelOfNodeType("whatsapp")).toBe("whatsapp");
    expect(channelOfNodeType("sms")).toBe("sms");
    expect(channelOfNodeType("wait")).toBeNull();
    expect(channelOfNodeType("end")).toBeNull();
  });
  it("isSendNodeType true solo per email/whatsapp/sms", () => {
    expect(isSendNodeType("email")).toBe(true);
    expect(isSendNodeType("whatsapp")).toBe(true);
    expect(isSendNodeType("sms")).toBe(true);
    expect(isSendNodeType("condition")).toBe(false);
  });
});

describe("flowToSteps — canale/node_type/body dei nodi messaggio", () => {
  // email(root) → whatsapp → sms → end
  const nodes = [
    n("e", "email", { subject: "Oggetto", body: "Corpo email", delay_days: 0 }, 0),
    n("w", "whatsapp", { body: "Ciao via WhatsApp {{first_name}}", delay_days: 2 }, 150),
    n("s", "sms", { body: "Promemoria SMS", delay_days: 1 }, 300),
    n("end", "end", {}, 450),
  ];
  const edges = [
    e("e1", "e", "w"),
    e("e2", "w", "s"),
    e("e3", "s", "end"),
  ];

  it("il nodo whatsapp → channel 'whatsapp', node_type 'whatsapp', body valorizzato, subject null", () => {
    const steps = flowToSteps(nodes, edges, "seq-1");
    const wa = steps.find((s) => s.id === "w")!;
    expect(wa.channel).toBe("whatsapp");
    expect(wa.node_type).toBe("whatsapp");
    expect(wa.body).toBe("Ciao via WhatsApp {{first_name}}");
    expect(wa.subject).toBeNull();
  });

  it("il nodo sms → channel 'sms', node_type 'sms', body valorizzato, subject null", () => {
    const steps = flowToSteps(nodes, edges, "seq-1");
    const sms = steps.find((s) => s.id === "s")!;
    expect(sms.channel).toBe("sms");
    expect(sms.node_type).toBe("sms");
    expect(sms.body).toBe("Promemoria SMS");
    expect(sms.subject).toBeNull();
  });

  it("l'email resta channel 'email' con oggetto; i link next_default sono coerenti", () => {
    const steps = flowToSteps(nodes, edges, "seq-1");
    const em = steps.find((s) => s.id === "e")!;
    expect(em.channel).toBe("email");
    expect(em.subject).toBe("Oggetto");
    expect(em.next_default).toBe("w");
    expect(steps.find((s) => s.id === "w")!.next_default).toBe("s");
  });

  it("il wait resta su channel 'email' (placeholder neutro) con body vuoto", () => {
    const wnodes = [n("e", "email", { body: "x" }, 0), n("wt", "wait", { delay_days: 1 }, 150)];
    const wedges = [e("ee", "e", "wt")];
    const steps = flowToSteps(wnodes, wedges, "seq-2");
    const wt = steps.find((s) => s.id === "wt")!;
    expect(wt.channel).toBe("email");
    expect(wt.node_type).toBe("wait");
    expect(wt.body).toBe("");
  });
});

describe("flowToSteps — template WhatsApp (compliance Meta)", () => {
  it("nodo whatsapp con template → persiste template_name/language/params", () => {
    const nodes = [
      n("w", "whatsapp", {
        body: "",
        template_name: "promo_estate",
        template_language: "it",
        template_params: { "1": "{{first_name}}", "2": "Edilizia in Cloud" },
      }, 0),
      n("end", "end", {}, 150),
    ];
    const steps = flowToSteps(nodes, [e("e1", "w", "end")], "seq-1");
    const wa = steps.find((s) => s.id === "w")!;
    expect(wa.template_name).toBe("promo_estate");
    expect(wa.template_language).toBe("it");
    expect(wa.template_params).toEqual({ "1": "{{first_name}}", "2": "Edilizia in Cloud" });
  });

  it("nodo whatsapp SENZA template → tripletta NULL (testo libero/legacy)", () => {
    const nodes = [n("w", "whatsapp", { body: "Ciao {{first_name}}" }, 0), n("end", "end", {}, 150)];
    const steps = flowToSteps(nodes, [e("e1", "w", "end")], "seq-1");
    const wa = steps.find((s) => s.id === "w")!;
    expect(wa.template_name).toBeNull();
    expect(wa.template_language).toBeNull();
    expect(wa.template_params).toBeNull();
  });

  it("template_language default 'it' se non specificata", () => {
    const nodes = [n("w", "whatsapp", { template_name: "ciao" }, 0), n("end", "end", {}, 150)];
    const steps = flowToSteps(nodes, [e("e1", "w", "end")], "seq-1");
    expect(steps.find((s) => s.id === "w")!.template_language).toBe("it");
  });

  it("params vuoti → null (il CHECK DB rifiuta params senza valore)", () => {
    const nodes = [n("w", "whatsapp", { template_name: "ciao", template_params: {} }, 0), n("end", "end", {}, 150)];
    const steps = flowToSteps(nodes, [e("e1", "w", "end")], "seq-1");
    expect(steps.find((s) => s.id === "w")!.template_params).toBeNull();
  });

  it("template impostato su un nodo NON-whatsapp (email) → ignorato (NULL)", () => {
    // i campi template non hanno senso fuori da whatsapp: vengono scartati.
    const nodes = [n("e", "email", { subject: "x", body: "y", template_name: "promo" }, 0), n("end", "end", {}, 150)];
    const steps = flowToSteps(nodes, [e("e1", "e", "end")], "seq-1");
    expect(steps.find((s) => s.id === "e")!.template_name).toBeNull();
  });

  it("whatsapp con template e body vuoto resta valido (body opzionale col template)", () => {
    const nodes = [n("w", "whatsapp", { body: "", template_name: "promo" }, 0), n("end", "end", {}, 150)];
    const steps = flowToSteps(nodes, [e("e1", "w", "end")], "seq-1");
    const wa = steps.find((s) => s.id === "w")!;
    expect(wa.template_name).toBe("promo");
    expect(wa.body).toBe("");
  });
});

describe("validateFlow — nodi messaggio", () => {
  it("un flusso di soli whatsapp/sms (nessuna email) NON segnala 'nessun messaggio'", () => {
    const nodes = [n("w", "whatsapp", { body: "ciao" }, 0), n("end", "end", {}, 150)];
    const edges = [e("e1", "w", "end")];
    const issues = validateFlow(nodes, edges);
    expect(issues.some((i) => /nessun nodo messaggio/i.test(i.message))).toBe(false);
  });

  it("nodo whatsapp senza corpo → warning dedicato", () => {
    const nodes = [n("e", "email", { body: "x" }, 0), n("w", "whatsapp", { body: "" }, 150), n("end", "end", {}, 300)];
    const edges = [e("e1", "e", "w"), e("e2", "w", "end")];
    const issues = validateFlow(nodes, edges);
    expect(issues.some((i) => i.nodeId === "w" && /senza testo/i.test(i.message))).toBe(true);
  });

  it("nodo whatsapp SENZA template → warning compliance cold (serve template)", () => {
    const nodes = [n("e", "email", { body: "x" }, 0), n("w", "whatsapp", { body: "Ciao" }, 150), n("end", "end", {}, 300)];
    const edges = [e("e1", "e", "w"), e("e2", "w", "end")];
    const issues = validateFlow(nodes, edges);
    expect(issues.some((i) => i.nodeId === "w" && /senza template approvato/i.test(i.message))).toBe(true);
  });

  it("nodo whatsapp CON template → niente warning compliance e niente 'senza testo' anche col body vuoto", () => {
    const nodes = [
      n("e", "email", { body: "x" }, 0),
      n("w", "whatsapp", { body: "", template_name: "promo_estate" }, 150),
      n("end", "end", {}, 300),
    ];
    const edges = [e("e1", "e", "w"), e("e2", "w", "end")];
    const issues = validateFlow(nodes, edges);
    expect(issues.some((i) => i.nodeId === "w")).toBe(false);
  });

  it("nodo sms NON eredita il warning compliance whatsapp (solo whatsapp è cold-gated)", () => {
    const nodes = [n("e", "email", { body: "x" }, 0), n("s", "sms", { body: "Promemoria" }, 150), n("end", "end", {}, 300)];
    const edges = [e("e1", "e", "s"), e("e2", "s", "end")];
    const issues = validateFlow(nodes, edges);
    expect(issues.some((i) => i.nodeId === "s" && /template/i.test(i.message))).toBe(false);
  });
});

describe("simulatePath — i nodi messaggio compaiono nel percorso col loro canale", () => {
  // email → whatsapp → sms → end (cammino lineare, nessuna condizione)
  const nodes = [
    n("e", "email", { subject: "Apertura", body: "Email", delay_days: 0 }, 0),
    n("w", "whatsapp", { body: "WA follow-up", delay_days: 2 }, 150),
    n("s", "sms", { body: "SMS reminder", delay_days: 1 }, 300),
    n("end", "end", {}, 450),
  ];
  const edges = [e("e1", "e", "w"), e("e2", "w", "s"), e("e3", "s", "end")];

  it("raccoglie email + whatsapp + sms con canale e ritardo cumulato", () => {
    const act: PreviewActivity = { opened: true, replied: false };
    const r = simulatePath(nodes, edges, act);
    expect(r.pathNodeIds).toEqual(["e", "w", "s", "end"]);
    expect(r.emails.map((m) => m.channel)).toEqual(["email", "whatsapp", "sms"]);
    // ritardo cumulato: email 0, whatsapp +2 = 2, sms +1 = 3
    expect(r.emails.map((m) => m.cumulativeDays)).toEqual([0, 2, 3]);
    // whatsapp/sms non hanno oggetto
    expect(r.emails[1].subject).toBe("");
    expect(r.emails[2].subject).toBe("");
    expect(r.emails[0].subject).toBe("Apertura");
    expect(r.reachedEnd).toBe(true);
  });
});

// ── F. AI-flow client mapping: whatsapp/sms ──────────────────────────────────
describe("aiFlowToReactFlow — nodi whatsapp/sms", () => {
  const graph: AiFlowGraph = {
    name: "Multi",
    nodes: [
      { key: "open", type: "email", subject: "Ciao", body: "E", delay_days: 0 },
      { key: "wa", type: "whatsapp", body: "Msg WA", delay_days: 1 },
      { key: "sms1", type: "sms", body: "Msg SMS", delay_days: 1 },
      { key: "end", type: "end" },
    ],
    edges: [
      { from_key: "open", to_key: "wa", branch: "default" },
      { from_key: "wa", to_key: "sms1", branch: "default" },
      { from_key: "sms1", to_key: "end", branch: "default" },
    ],
  };

  it("materializza i nodi whatsapp/sms col corpo e senza oggetto", () => {
    const { nodes } = aiFlowToReactFlow(graph);
    const wa = nodes.find((nd) => nd.type === "whatsapp")!;
    const sms = nodes.find((nd) => nd.type === "sms")!;
    expect(wa.data.body).toBe("Msg WA");
    expect(wa.data.subject).toBeUndefined();
    expect(sms.data.body).toBe("Msg SMS");
    expect(sms.data.delay_days).toBe(1);
  });

  it("flowToSteps sui nodi AI mappa i canali correttamente", () => {
    const { nodes, edges } = aiFlowToReactFlow(graph);
    const steps = flowToSteps(nodes, edges, "seq-x");
    const channels = steps.map((s) => s.channel).sort();
    expect(channels).toEqual(["email", "email", "sms", "whatsapp"].sort()); // end resta 'email' placeholder
  });
});
