// ── graph — adattatore PURO tra outreach_sequence_steps e React Flow ─────────
//
// Converte gli step della sequenza (modello Fase 1) in nodi+archi React Flow e
// viceversa. Nessuna dipendenza da Supabase/React: solo trasformazioni dati.
//
//   • Caricamento GRAFO   : step con pos_*/next_* valorizzati → nodi+edge dal grafo.
//   • Caricamento LINEARE  : step legacy (next_* NULL) → catena verticale di email
//                            con edge derivati da step_order (auto-layout).
//   • Salvataggio          : nodi+edge → righe step (node_type/condition_type/
//                            subject/body/delay/pos), next_default/next_alt dagli
//                            edge, step_order coerente con la topologia.

import type { Node, Edge } from "@xyflow/react";

export type OutreachNodeType = "email" | "wait" | "condition" | "end";
export type OutreachConditionType = "opened" | "not_opened" | "replied" | "not_replied";

/** Riga `outreach_sequence_steps` (campi rilevanti per il builder). */
export interface StepRow {
  id: string;
  sequence_id: string;
  step_order: number;
  channel: string;
  delay_days: number;
  delay_hours: number;
  subject: string | null;
  body: string;
  node_type: OutreachNodeType | null;
  condition_type: OutreachConditionType | null;
  next_default: string | null;
  next_alt: string | null;
  pos_x: number | null;
  pos_y: number | null;
}

/** Dati portati da un nodo React Flow del builder. */
export interface FlowNodeData extends Record<string, unknown> {
  label?: string;
  subject?: string;
  body?: string;
  delay_days?: number;
  delay_hours?: number;
  condition_type?: OutreachConditionType | null;
  hasWarning?: boolean;
}

const COL = { x: 320, yStart: 60, yGap: 150 };

/** node_type effettivo con fallback 'email' (step legacy: colonna a default 'email'). */
function ntype(s: StepRow): OutreachNodeType {
  return (s.node_type as OutreachNodeType) ?? "email";
}

/** True se gli step formano un grafo (almeno un next_* o un nodo non-email). */
export function isGraph(steps: StepRow[]): boolean {
  return steps.some(
    (s) =>
      (s.next_default != null && s.next_default !== "") ||
      (s.next_alt != null && s.next_alt !== "") ||
      ntype(s) !== "email",
  );
}

function mkNode(s: StepRow, pos: { x: number; y: number }): Node<FlowNodeData> {
  return {
    id: s.id,
    type: ntype(s),
    position: pos,
    data: {
      label: s.subject ?? undefined,
      subject: s.subject ?? "",
      body: s.body ?? "",
      delay_days: s.delay_days ?? 0,
      delay_hours: s.delay_hours ?? 0,
      condition_type: s.condition_type ?? null,
    },
  };
}

function mkEdge(source: string, target: string, handle?: "yes" | "no"): Edge {
  return {
    id: `e-${source}-${handle ?? "d"}-${target}`,
    source,
    target,
    sourceHandle: handle,
    type: "smoothstep",
    animated: true,
    style: { strokeWidth: 2 },
    label: handle === "yes" ? "SÌ" : handle === "no" ? "NO" : undefined,
  };
}

/**
 * DB → React Flow. Ricostruisce nodi+edge da un grafo esistente, oppure rende
 * una sequenza lineare legacy come catena verticale di email (auto-layout) così
 * le sequenze esistenti si aprono nel builder e possono essere arricchite.
 */
export function stepsToFlow(steps: StepRow[]): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  if (steps.length === 0) return { nodes: [], edges: [] };

  if (isGraph(steps)) {
    // Grafo: usa pos_* salvate (fallback a layout verticale se mancano).
    const nodes = steps.map((s, i) =>
      mkNode(s, {
        x: s.pos_x ?? COL.x,
        y: s.pos_y ?? COL.yStart + i * COL.yGap,
      }),
    );
    const ids = new Set(steps.map((s) => s.id));
    const edges: Edge[] = [];
    for (const s of steps) {
      const isCond = ntype(s) === "condition";
      if (s.next_default && ids.has(s.next_default)) {
        edges.push(mkEdge(s.id, s.next_default, isCond ? "yes" : undefined));
      }
      if (isCond && s.next_alt && ids.has(s.next_alt)) {
        edges.push(mkEdge(s.id, s.next_alt, "no"));
      }
    }
    return { nodes, edges };
  }

  // Lineare legacy: catena di email per step_order + nodo Fine terminale.
  const ordered = [...steps].sort((a, b) => a.step_order - b.step_order);
  const nodes: Node<FlowNodeData>[] = ordered.map((s, i) =>
    mkNode({ ...s, node_type: "email" }, { x: COL.x, y: COL.yStart + i * COL.yGap }),
  );
  const edges: Edge[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    edges.push(mkEdge(ordered[i].id, ordered[i + 1].id));
  }
  // Nodo Fine in coda (solo client: viene materializzato al salvataggio).
  const endId = `end-${ordered[ordered.length - 1].id}`;
  nodes.push({
    id: endId,
    type: "end",
    position: { x: COL.x, y: COL.yStart + ordered.length * COL.yGap },
    data: {},
  });
  edges.push(mkEdge(ordered[ordered.length - 1].id, endId));

  return { nodes, edges };
}

/** Riga da scrivere su DB (subset upsert: niente created_at). */
export interface StepUpsert {
  id: string;
  sequence_id: string;
  step_order: number;
  channel: string;
  delay_days: number;
  delay_hours: number;
  subject: string | null;
  body: string;
  node_type: OutreachNodeType;
  condition_type: OutreachConditionType | null;
  next_default: string | null;
  next_alt: string | null;
  pos_x: number;
  pos_y: number;
}

/**
 * Ordinamento topologico (Kahn) dei nodi a partire dall'entry, per assegnare
 * step_order coerente. I cicli (improbabili) ricadono in coda per posizione Y.
 * L'entry node è quello non puntato da alcun edge.
 */
export function topoOrder(nodes: Node<FlowNodeData>[], edges: Edge[]): string[] {
  const ids = nodes.map((n) => n.id);
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!indeg.has(e.target) || !adj.has(e.source)) continue;
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    adj.get(e.source)!.push(e.target);
  }
  const yOf = new Map(nodes.map((n) => [n.id, n.position.y]));
  // Coda iniziale: nodi senza archi in ingresso, ordinati per Y.
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0).sort((a, b) => (yOf.get(a) ?? 0) - (yOf.get(b) ?? 0));
  const order: string[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    const next = (adj.get(id) ?? []).filter((t) => !seen.has(t));
    for (const t of next) {
      indeg.set(t, (indeg.get(t) ?? 1) - 1);
      if ((indeg.get(t) ?? 0) <= 0) queue.push(t);
    }
    queue.sort((a, b) => (yOf.get(a) ?? 0) - (yOf.get(b) ?? 0));
  }
  // Nodi residui (cicli): in coda per Y.
  for (const id of ids) if (!seen.has(id)) order.push(id);
  return order;
}

/**
 * React Flow → DB. Per ogni nodo una riga step; next_default = target dell'edge
 * di default (handle "yes" per le condizioni), next_alt = target dell'edge "no".
 * step_order assegnato in ordine topologico. Ritorna anche gli id rimasti per
 * calcolare le cancellazioni a monte.
 */
export function flowToSteps(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  sequenceId: string,
): StepUpsert[] {
  const order = topoOrder(nodes, edges);
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Mappa source → { default, alt } dai suoi edge uscenti.
  const outDefault = new Map<string, string>();
  const outAlt = new Map<string, string>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const src = byId.get(e.source)!;
    if (src.type === "condition") {
      if (e.sourceHandle === "no") outAlt.set(e.source, e.target);
      else outDefault.set(e.source, e.target); // "yes" o default
    } else {
      outDefault.set(e.source, e.target);
    }
  }

  return nodes.map((n) => {
    const data = (n.data ?? {}) as FlowNodeData;
    const type = (n.type ?? "email") as OutreachNodeType;
    const isCond = type === "condition";
    return {
      id: n.id,
      sequence_id: sequenceId,
      step_order: orderIndex.get(n.id) ?? 0,
      channel: "email", // CHECK su channel invariato: tutti i nodi restano 'email'
      delay_days: Math.max(0, Math.trunc(data.delay_days ?? 0)),
      delay_hours: Math.max(0, Math.trunc(data.delay_hours ?? 0)),
      subject: type === "email" ? (data.subject?.trim() ? data.subject : null) : null,
      body: type === "email" ? (data.body ?? "") : "",
      node_type: type,
      condition_type: isCond ? (data.condition_type ?? null) : null,
      next_default: outDefault.get(n.id) ?? null,
      next_alt: isCond ? (outAlt.get(n.id) ?? null) : null,
      pos_x: Math.round(n.position.x),
      pos_y: Math.round(n.position.y),
    };
  });
}

/** Esito validazione soft (non bloccante). */
export interface ValidationIssue {
  nodeId?: string;
  level: "warning";
  message: string;
}

/**
 * Validazione soft: condizione senza tipo o senza entrambi i rami; nodi orfani
 * (non raggiungibili dall'entry); nessun nodo email. Non blocca il salvataggio.
 */
export function validateFlow(nodes: Node<FlowNodeData>[], edges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (nodes.length === 0) return issues;

  const hasEmail = nodes.some((n) => n.type === "email");
  if (!hasEmail) {
    issues.push({ level: "warning", message: "Il flusso non ha nessun nodo Email: nessun messaggio verrà inviato." });
  }

  // Raggiungibilità dall'entry (nodi senza edge in ingresso). Se il grafo è
  // ciclico e nessun nodo è "radice", si ripiega sul nodo più in alto (coerente
  // con entryNode del dispatcher, che usa lo step_order minimo).
  const targets = new Set(edges.map((e) => e.target));
  let roots = nodes.filter((n) => !targets.has(n.id));
  if (roots.length === 0) {
    roots = [...nodes].sort((a, b) => a.position.y - b.position.y).slice(0, 1);
  }
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) adj.get(e.source)?.push(e.target);
  const reachable = new Set<string>();
  const stack = roots.map((r) => r.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const t of adj.get(id) ?? []) stack.push(t);
  }

  for (const n of nodes) {
    if (n.type === "condition") {
      const data = (n.data ?? {}) as FlowNodeData;
      if (!data.condition_type) {
        issues.push({ nodeId: n.id, level: "warning", message: "Condizione senza tipo selezionato." });
      }
      const hasYes = edges.some((e) => e.source === n.id && e.sourceHandle !== "no");
      const hasNo = edges.some((e) => e.source === n.id && e.sourceHandle === "no");
      if (!hasYes || !hasNo) {
        issues.push({ nodeId: n.id, level: "warning", message: "Condizione senza entrambi i rami (SÌ e NO) collegati." });
      }
    }
    // Orfano: non raggiungibile e non è esso stesso una radice valida.
    if (!reachable.has(n.id)) {
      issues.push({ nodeId: n.id, level: "warning", message: "Nodo non raggiungibile dall'inizio del flusso." });
    }
  }

  return issues;
}
