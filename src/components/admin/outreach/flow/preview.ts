// ── preview — traversata PURA del grafo lato CLIENT per l'anteprima percorso ──
//
// Replica deterministica della logica del dispatcher (Fase 1,
// supabase/functions/_shared/outreach-flow.ts: planNextAction / resolveActionable
// / evalCondition / nextNode) ma a partire dai NODI+ARCHI di React Flow, così
// l'anteprima nel builder mostra ESATTAMENTE il cammino che il lead seguirebbe
// senza dover ricaricare/serializzare su DB.
//
// Mappatura coerente col salvataggio (graph.ts flowToSteps):
//   • email/wait → arco "default" (sourceHandle assente) = next_default
//   • condition  → arco "yes" (next_default, ramo SÌ) se la condizione è vera,
//                  arco "no"  (next_alt,     ramo NO) se falsa
//   • end        → fine cammino
//
// Niente React/Supabase qui: solo trasformazioni dati testabili in vitest.

import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData, OutreachConditionType, OutreachNodeType } from "./graph";

/** Ipotesi del simulatore: cosa fa il contatto (per valutare le condizioni). */
export interface PreviewActivity {
  /** Ha aperto l'ultima email (rilevante per opened/not_opened). */
  opened: boolean;
  /** Ha risposto (rilevante per replied/not_replied; stop implicito a parte). */
  replied: boolean;
}

/** Una tappa "email" del cammino simulato (ciò che il lead riceverebbe). */
export interface PreviewEmail {
  nodeId: string;
  subject: string;
  body: string;
  /** Ritardo cumulato (giorni) dall'inizio del flusso a questa email. */
  cumulativeDays: number;
}

/** Esito della simulazione del cammino. */
export interface PreviewResult {
  /** id dei nodi attraversati, in ordine. */
  pathNodeIds: string[];
  /** id degli archi attraversati, in ordine. */
  pathEdgeIds: string[];
  /** email che il lead riceverebbe lungo il cammino. */
  emails: PreviewEmail[];
  /** true se la simulazione si è interrotta per una guardia anti-loop. */
  aborted: boolean;
  /** true se il cammino termina su un nodo "end" (o naturalmente senza successori). */
  reachedEnd: boolean;
}

const MAX_HOPS = 100;

function nodeType(n: Node<FlowNodeData>): OutreachNodeType {
  return (n.type as OutreachNodeType) ?? "email";
}

/** Valuta una condizione sulle ipotesi (stessa semantica di evalCondition Fase 1). */
export function evalConditionPreview(
  condition: OutreachConditionType | null | undefined,
  activity: PreviewActivity,
): boolean {
  switch (condition) {
    case "opened": return activity.opened === true;
    case "not_opened": return activity.opened !== true;
    case "replied": return activity.replied === true;
    case "not_replied": return activity.replied !== true;
    default: return false; // tipo mancante → ramo NO (conservativo, come il dispatcher)
  }
}

/**
 * Nodo di ingresso: quello senza archi entranti (radice). Se il grafo è ciclico
 * o tutti i nodi sono puntati, ripiega sul nodo più in alto (minor Y) — coerente
 * con entryNode del dispatcher che usa lo step_order minimo (≈ posizione Y dopo
 * il layout topologico).
 */
export function entryNodeId(nodes: Node<FlowNodeData>[], edges: Edge[]): string | null {
  if (nodes.length === 0) return null;
  const targeted = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !targeted.has(n.id));
  if (roots.length > 0) {
    return [...roots].sort((a, b) => a.position.y - b.position.y)[0].id;
  }
  return [...nodes].sort((a, b) => a.position.y - b.position.y)[0].id;
}

/**
 * Sceglie l'arco uscente da `nodeId` da seguire, dati i segnali.
 *   • condition → arco "yes" se la condizione è vera, "no" se falsa
 *   • email/wait → l'arco "default" (sourceHandle assente/diverso da no), se più
 *     d'uno il primo trovato (al salvataggio se ne tiene comunque solo uno).
 * Ritorna l'edge scelto o null se non c'è successore.
 */
function pickOutgoing(
  node: Node<FlowNodeData>,
  edges: Edge[],
  activity: PreviewActivity,
): Edge | null {
  const out = edges.filter((e) => e.source === node.id);
  if (out.length === 0) return null;
  if (nodeType(node) === "condition") {
    const cond = (node.data as FlowNodeData)?.condition_type ?? null;
    const yes = evalConditionPreview(cond, activity);
    if (yes) {
      // ramo SÌ = handle "yes" (o, in mancanza, l'arco non-"no").
      return out.find((e) => e.sourceHandle === "yes")
        ?? out.find((e) => e.sourceHandle !== "no")
        ?? null;
    }
    return out.find((e) => e.sourceHandle === "no") ?? null;
  }
  // email/wait: ramo default (handle assente o non "no").
  return out.find((e) => (e.sourceHandle ?? undefined) !== "no") ?? out[0];
}

/**
 * Simula il cammino del lead dal nodo di ingresso fino a un "end" / fine catena,
 * dato cosa fa il contatto (opened/replied). Raccoglie nodi+archi attraversati e
 * le email che riceverebbe (con ritardo cumulato). Guardia anti-loop a MAX_HOPS.
 *
 * NB: "stop implicito su risposta" — nella realtà il dispatcher ferma la cadenza
 * appena arriva una risposta. Qui non interrompiamo d'autorità sulla risposta
 * (sarebbe ambiguo dove), ma esponiamo `replied` così le condizioni "replied"/
 * "not_replied" diramano correttamente; l'avviso sullo stop è mostrato in UI.
 */
export function simulatePath(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  activity: PreviewActivity,
): PreviewResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pathNodeIds: string[] = [];
  const pathEdgeIds: string[] = [];
  const emails: PreviewEmail[] = [];
  const seen = new Set<string>();
  let cumulativeDays = 0;
  let aborted = false;
  let reachedEnd = false;

  let currentId = entryNodeId(nodes, edges);
  let hops = 0;

  while (currentId) {
    const node = byId.get(currentId);
    if (!node) break;
    if (seen.has(currentId) || hops++ > MAX_HOPS) { aborted = true; break; }
    seen.add(currentId);
    pathNodeIds.push(currentId);

    const t = nodeType(node);
    const data = (node.data ?? {}) as FlowNodeData;

    if (t === "email" || t === "wait") {
      cumulativeDays += Math.max(0, Math.trunc(data.delay_days ?? 0));
    }
    if (t === "email") {
      emails.push({
        nodeId: currentId,
        subject: (data.subject ?? "").trim(),
        body: (data.body ?? "").trim(),
        cumulativeDays,
      });
    }
    if (t === "end") { reachedEnd = true; break; }

    const edge = pickOutgoing(node, edges, activity);
    if (!edge) { reachedEnd = true; break; } // fine catena = completato
    pathEdgeIds.push(edge.id);
    currentId = edge.target;
  }

  return { pathNodeIds, pathEdgeIds, emails, aborted, reachedEnd };
}
