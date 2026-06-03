// ── autoLayout — dispone i nodi del flusso in un layout verticale pulito ──
//
// Algoritmo (cycle-safe, gestisce grafi sconnessi):
//  1. Livelli (y): cammino più LUNGO dalle radici (trigger o nodi senza archi
//     entranti), così un nodo di merge finisce sempre sotto TUTTI i suoi genitori.
//     Propagazione tipo BFS con guardia anti-ciclo (max "tocchi" per nodo).
//  2. Posizione orizzontale (x): ogni nodo è centrato sotto i propri genitori;
//     i rami (sì/no di una condizione, split A/B) vengono spaziati ai lati grazie
//     a un bias sull'handle sorgente. Niente sovrapposizioni (gap minimo) e ogni
//     livello viene ricentrato sul baricentro delle posizioni desiderate.
//  3. Normalizzazione in coordinate positive.
//
// I nodi "note" non vengono mai spostati (sono annotazioni libere).

import type { Node, Edge } from "@xyflow/react";

// I nodi reali sono alti ~96-126px (trigger/condizione i più alti, +20px con
// il badge "Da verificare"): 180px lascia un respiro pulito tra un livello e
// l'altro evitando che le card si tocchino.
const VERTICAL_GAP = 180; // distanza verticale tra livelli
const HORIZONTAL_GAP = 320; // distanza orizzontale tra colonne dello stesso livello (card larghe ~220-300px)
const ORIGIN_X = 160;
const ORIGIN_Y = 60;

/** Bias orizzontale del ramo in base all'handle sorgente (sì/no, split_n). */
function handleBias(handle?: string | null): number {
  if (!handle) return 0;
  if (handle === "yes") return -0.5;
  if (handle === "no") return 0.5;
  if (handle.startsWith("split_")) {
    const idx = Number.parseInt(handle.slice("split_".length), 10);
    return Number.isFinite(idx) ? idx - 0.5 : 0;
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

  // ── 1) Livelli: cammino più lungo dalle radici, con guardia anti-ciclo ──
  const level = new Map<string, number>();
  // Un DAG valido di N nodi ha cammino più lungo ≤ N-1: limitiamo i livelli a N
  // così un eventuale ciclo non gonfia all'infinito le coordinate (resta compatto).
  const maxLevel = layoutNodes.length;
  const cap = maxLevel + 1; // massimi "tocchi" per nodo (guardia secondaria sui cicli)

  const relax = (seeds: string[]) => {
    const queue = [...seeds];
    const touches = new Map<string, number>();
    for (const s of seeds) if (!level.has(s)) level.set(s, 0);
    while (queue.length > 0) {
      const u = queue.shift()!;
      const t = (touches.get(u) ?? 0) + 1;
      touches.set(u, t);
      if (t > cap) continue; // ciclo: interrompi la propagazione da questo nodo
      const lu = level.get(u) ?? 0;
      for (const v of outAdj.get(u) ?? []) {
        const candidate = lu + 1;
        if (candidate > maxLevel) continue; // ciclo: non superare N livelli
        const lv = level.get(v);
        if (lv === undefined || lv < candidate) {
          level.set(v, candidate);
          queue.push(v);
        }
      }
    }
  };

  const roots = layoutNodes
    .filter((n) => n.type === "trigger" || inEdges.get(n.id)!.length === 0)
    .map((n) => n.id);
  relax(roots.length > 0 ? roots : [layoutNodes[0].id]);

  // Componenti sconnesse / cicli puri: seed iterativo sui nodi rimasti.
  let guard = 0;
  while (guard++ < layoutNodes.length) {
    const leftover = layoutNodes.find((n) => !level.has(n.id));
    if (!leftover) break;
    relax([leftover.id]);
  }
  for (const n of layoutNodes) if (!level.has(n.id)) level.set(n.id, 0);

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
          ? ins.reduce((s, ie) => s + xPos.get(ie.parent)! + handleBias(ie.handle) * HORIZONTAL_GAP, 0) / ins.length
          : null;
      return { id, order, desired };
    });
    items.sort((a, b) => {
      const da = a.desired ?? a.order * HORIZONTAL_GAP;
      const db = b.desired ?? b.order * HORIZONTAL_GAP;
      return da - db;
    });
    // posiziona sinistra→destra rispettando il gap minimo
    let prev = Number.NEGATIVE_INFINITY;
    for (const it of items) {
      let x = it.desired ?? it.order * HORIZONTAL_GAP;
      if (x < prev + HORIZONTAL_GAP) x = prev + HORIZONTAL_GAP;
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
  const widthOf = (n: Node) =>
    (n as { measured?: { width?: number } }).measured?.width ?? (n.width ?? 260);
  const topLeftX = new Map<string, number>();
  for (const n of layoutNodes) topLeftX.set(n.id, (xPos.get(n.id) ?? 0) - widthOf(n) / 2);

  let minX = Number.POSITIVE_INFINITY;
  for (const n of layoutNodes) minX = Math.min(minX, topLeftX.get(n.id) ?? 0);
  if (!Number.isFinite(minX)) minX = 0;

  const positions: Record<string, { x: number; y: number }> = {};
  let movedCount = 0;
  for (const n of layoutNodes) {
    const x = Math.round((topLeftX.get(n.id) ?? 0) - minX + ORIGIN_X);
    const y = Math.round(level.get(n.id)! * VERTICAL_GAP + ORIGIN_Y);
    positions[n.id] = { x, y };
    if (Math.round(n.position.x) !== x || Math.round(n.position.y) !== y) movedCount++;
  }
  return { positions, movedCount };
}
