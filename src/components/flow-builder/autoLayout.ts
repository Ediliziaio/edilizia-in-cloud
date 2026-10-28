// ── autoLayout — dispone i nodi del flusso in un layout verticale pulito ──
//
// Algoritmo (cycle-safe, gestisce grafi sconnessi):
//  1. Livelli (y): cammino più LUNGO dalle radici (trigger o nodi senza archi
//     entranti), così un nodo di merge finisce sempre sotto TUTTI i suoi genitori.
//     Ordinamento topologico; i cicli non validi restano finiti e visibili.
//  2. Posizione orizzontale (x): ogni nodo è centrato sotto i propri genitori;
//     i rami (sì/no di una condizione, split A/B) vengono spaziati ai lati grazie
//     a un bias sull'handle sorgente. Niente sovrapposizioni (gap minimo) e ogni
//     livello viene ricentrato sul baricentro delle posizioni desiderate.
//  3. Normalizzazione in coordinate positive.
//
// I nodi "note" non vengono mai spostati (sono annotazioni libere).

import type { Node, Edge } from "@xyflow/react";

// Spazio LIBERO fra le card: non fra i loro angoli superiori. Anche una
// condizione alta o una card larga deve lasciare spazio ai rami e al "+".
const VERTICAL_GAP = 96;
const HORIZONTAL_GAP = 72;
const ORIGIN_X = 160;
const ORIGIN_Y = 60;

/** Bias orizzontale del ramo in base all'handle sorgente (sì/no, split_n). */
function handleBias(handle?: string | null, splitCount = 2): number {
  if (!handle) return 0;
  if (handle === "yes") return -0.5;
  if (handle === "no") return 0.5;
  if (handle.startsWith("split_")) {
    const idx = Number.parseInt(handle.slice("split_".length), 10);
    return Number.isFinite(idx) ? idx - (splitCount - 1) / 2 : 0;
  }
  return 0;
}

export interface AutoLayoutResult {
  positions: Record<string, { x: number; y: number }>;
  /** Quanti nodi cambiano effettivamente posizione rispetto a ora. */
  movedCount: number;
}

export function computeAutoLayout(nodes: Node[], edges: Edge[]): AutoLayoutResult {
  // Le note restano dove sono: layout solo sui nodi "reali" del grafo.
  const layoutNodes = nodes.filter((n) => n.type !== "note");
  if (layoutNodes.length === 0) return { positions: {}, movedCount: 0 };

  const nodeIds = new Set(layoutNodes.map((n) => n.id));
  const widthOf = (n: Node) => n.measured?.width || n.width || (n.type === "end" ? 100 : 280);
  const heightOf = (n: Node) => n.measured?.height || n.height || (n.type === "end" ? 44 : 140);
  const nodesById = new Map(layoutNodes.map((n) => [n.id, n]));
  const columnGap = Math.max(...layoutNodes.map(widthOf)) + HORIZONTAL_GAP;
  const outAdj = new Map<string, string[]>();
  const inEdges = new Map<string, { parent: string; handle?: string | null }[]>();
  for (const n of layoutNodes) {
    outAdj.set(n.id, []);
    inEdges.set(n.id, []);
  }
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    if (e.source === e.target) continue; // self-loop ignorato
    outAdj.get(e.source)!.push(e.target);
    inEdges.get(e.target)!.push({ parent: e.source, handle: e.sourceHandle });
  }

  // ── 1) Livelli: tutti i genitori devono precedere un ricongiungimento ──
  const level = new Map<string, number>();
  const pending = new Map(layoutNodes.map((n) => [n.id, inEdges.get(n.id)!.length]));
  const queue = layoutNodes.filter((n) => pending.get(n.id) === 0).map((n) => n.id);
  const visited = new Set<string>();
  let cursor = 0;
  while (visited.size < layoutNodes.length) {
    // Un ciclo è già bloccato dalla validazione. Qui non si cambiano archi:
    // si rende comunque ispezionabile il grafo senza gonfiarlo a N² livelli.
    if (cursor === queue.length) queue.push(layoutNodes.find((n) => !visited.has(n.id))!.id);
    const id = queue[cursor++];
    if (visited.has(id)) continue;
    visited.add(id);
    level.set(id, level.get(id) ?? 0);
    for (const child of outAdj.get(id)!) {
      if (visited.has(child)) continue;
      level.set(child, Math.max(level.get(child) ?? 0, level.get(id)! + 1));
      pending.set(child, pending.get(child)! - 1);
      if (pending.get(child) === 0) queue.push(child);
    }
  }

  // ── 2) Posizione orizzontale: centrata sotto i genitori, senza overlap ──
  const byLevel = new Map<number, string[]>();
  for (const n of layoutNodes) {
    const l = level.get(n.id)!;
    let arr = byLevel.get(l);
    if (!arr) {
      arr = [];
      byLevel.set(l, arr);
    }
    arr.push(n.id);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);

  const xPos = new Map<string, number>();
  for (const l of levels) {
    const ids = byLevel.get(l)!;
    // x desiderata = media di (x genitore + bias ramo); null per le radici.
    const items = ids.map((id, order) => {
      const ins = inEdges.get(id)!.filter((ie) => xPos.has(ie.parent));
      const desired =
        ins.length > 0
          ? ins.reduce((s, ie) => {
              const parent = nodesById.get(ie.parent)!;
              const splitCount = Math.max(2, String(parent.data?.percentuali || "50,50").split(",").length);
              return s + xPos.get(ie.parent)! + handleBias(ie.handle, splitCount) * columnGap;
            }, 0) / ins.length
          : null;
      return { id, order, desired };
    });
    items.sort((a, b) => {
      const da = a.desired ?? a.order * columnGap;
      const db = b.desired ?? b.order * columnGap;
      return da - db;
    });
    // posiziona sinistra→destra rispettando il gap minimo
    let prev = Number.NEGATIVE_INFINITY;
    for (const it of items) {
      let x = it.desired ?? it.order * columnGap;
      if (x < prev + columnGap) x = prev + columnGap;
      xPos.set(it.id, x);
      prev = x;
    }
    // ricentra il livello sul baricentro delle posizioni desiderate
    const desiredVals = items.map((it) => it.desired).filter((d): d is number => d != null);
    if (desiredVals.length > 0) {
      const meanPlaced = items.reduce((s, it) => s + xPos.get(it.id)!, 0) / items.length;
      const meanDesired = desiredVals.reduce((s, d) => s + d, 0) / desiredVals.length;
      const shift = meanDesired - meanPlaced;
      for (const it of items) xPos.set(it.id, xPos.get(it.id)! + shift);
    }
  }

  // ── 3) Converti i CENTRI (xPos) in coordinate top-left, poi normalizza ──
  // xPos rappresenta il centro desiderato di ogni nodo. Per avere connettori
  // DRITTI e VERTICALI (stile GHL) i nodi vanno centrati sullo stesso asse, non
  // allineati a sinistra: senza questo, nodi di larghezza diversa (es. la pill
  // "Attendi" vs le card) hanno centri sfalsati e lo smoothstep fa lo "scalino".
  // Converto center→top-left sottraendo metà larghezza reale misurata da ReactFlow.
  const topLeftX = new Map<string, number>();
  for (const n of layoutNodes) topLeftX.set(n.id, (xPos.get(n.id) ?? 0) - widthOf(n) / 2);

  let minX = Number.POSITIVE_INFINITY;
  for (const n of layoutNodes) minX = Math.min(minX, topLeftX.get(n.id) ?? 0);
  if (!Number.isFinite(minX)) minX = 0;

  const positions: Record<string, { x: number; y: number }> = {};
  const yByLevel = new Map<number, number>();
  let nextY = ORIGIN_Y;
  for (const l of levels) {
    yByLevel.set(l, nextY);
    nextY += Math.max(...byLevel.get(l)!.map((id) => heightOf(nodesById.get(id)!))) + VERTICAL_GAP;
  }
  let movedCount = 0;
  for (const n of layoutNodes) {
    const x = Math.round((topLeftX.get(n.id) ?? 0) - minX + ORIGIN_X);
    const y = Math.round(yByLevel.get(level.get(n.id)!)!);
    positions[n.id] = { x, y };
    if (Math.round(n.position.x) !== x || Math.round(n.position.y) !== y) movedCount++;
  }
  return { positions, movedCount };
}
