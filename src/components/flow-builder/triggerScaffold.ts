import type { Edge, Node } from "@xyflow/react";

/** Operational roots, excluding annotations and the visual entry card. Never skip to Fine when actions exist. */
export function triggerEntryTargets(nodes: Node[], edges: Edge[]): Node[] {
  const steps = nodes.filter(n => !["trigger", "end", "note"].includes(n.type ?? "") && !n.data?.isEmpty);
  const ids = new Set(steps.map(n => n.id));
  const roots = steps.filter(n => !edges.some(e => e.target === n.id && ids.has(e.source)));
  return roots.length ? roots : steps.length ? [] : nodes.filter(n => n.type === "end").slice(0, 1);
}

/** Visual only: neither placeholder nor its edges belong in persistence. Idempotent after delete/undo/reload. */
export function withTriggerScaffold(nodes: Node[], edges: Edge[], onOpenCatalog: () => void, onAddStep: (id: string) => void) {
  const placeholders = new Set(nodes.filter(n => n.type === "trigger" && n.data?.isEmpty).map(n => n.id));
  const realNodes = nodes.filter(n => !placeholders.has(n.id));
  const realEdges = edges.filter(e => !placeholders.has(e.source) && !placeholders.has(e.target));
  if (realNodes.some(n => n.type === "trigger")) {
    return placeholders.size ? { nodes: realNodes, edges: realEdges } : { nodes, edges };
  }
  const targets = triggerEntryTargets(realNodes, realEdges);
  const anchor = [...targets].sort((a, b) => a.position.y - b.position.y)[0];
  const position = { x: anchor?.position.x ?? 300, y: (anchor?.position.y ?? 280) - 200 };
  const current = nodes.find(n => placeholders.has(n.id));
  const expectedTargets = new Set(targets.map(n => n.id));
  const currentEdges = edges.filter(e => placeholders.has(e.source));
  if (placeholders.size === 1 && current?.id === "placeholder-trigger" && currentEdges.length === expectedTargets.size && currentEdges.every(e => expectedTargets.has(e.target))) return { nodes, edges };
  return {
    nodes: [{ id: "placeholder-trigger", type: "trigger", position,
      data: { label: "Aggiungi trigger", nodeType: "trigger", isEmpty: true, onOpenCatalog } }, ...realNodes] as Node[],
    edges: [...realEdges, ...targets.map(target => ({ id: `visual-trigger-${target.id}`, source: "placeholder-trigger", target: target.id,
      type: "addStep", style: { strokeWidth: 1.5, strokeDasharray: "6 3" }, data: { onAddStep } }))] as Edge[],
  };
}
