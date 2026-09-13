// ── useFlowAdapter — converts between DB relational format and ReactFlow ──

import { useCallback, useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { AutomationNode, AutomationConnection } from "@/types/automationBuilder";
import { getCatalogItem, type FlowNodeKind } from "@/lib/flow-node-catalog";

// ── DB → ReactFlow ──

export function nodesToReactFlow(dbNodes: AutomationNode[]): Node[] {
  return dbNodes.map((n) => {
    const actionId = n.config_json?.action_type ?? n.config_json?.trigger_type ?? n.config_json?.item_id ?? "";
    const catalogItem = getCatalogItem(actionId);
    const kind: FlowNodeKind = catalogItem?.kind ?? mapNodeTypeToKind(n.node_type);

    return {
      id: n.id,
      type: kind, // maps to nodeTypes keys
      position: { x: n.position_x, y: n.position_y },
      data: {
        ...n.config_json,
        label: n.label ?? catalogItem?.label ?? n.node_type,
        nodeType: n.node_type,
        itemId: actionId,
        dbNodeId: n.id,
      },
    };
  });
}

// sourceHandle non è persistito in automation_connections: si ricostruisce
// dal label (Sì/No → handle yes/no della condizione, A…E → split_0…split_4).
// Senza, al reload gli archi dei rami ripartivano tutti dallo stesso handle.
export function labelToSourceHandle(label: string | null): string | undefined {
  const v = String(label ?? "").trim().toLowerCase();
  if (v === "sì" || v === "si" || v === "yes") return "yes";
  if (v === "no") return "no";
  // Solo le etichette che l'editor scrive per gli split: una lettera da sola
  // ("c") o seguita dai due punti ("c: 30%"). "event" o "timeout" dei nodi di
  // attesa iniziano anch'essi per lettera, e non sono rami.
  const ramo = /^([a-e])(\s*:.*)?$/.exec(v);
  if (ramo) return `split_${ramo[1].charCodeAt(0) - 97}`;
  return undefined;
}

export function connectionsToEdges(dbConnections: AutomationConnection[]): Edge[] {
  return dbConnections.map((c) => ({
    id: c.id,
    source: c.from_node_id,
    target: c.to_node_id,
    sourceHandle: labelToSourceHandle(c.label),
    label: c.label ?? undefined,
    type: "addStep",
    animated: true,
    style: { strokeWidth: 2 },
  }));
}

// ── ReactFlow → DB ──

export function reactFlowToNodes(
  rfNodes: Node[],
  flowId: string,
  companyId: string
): Omit<AutomationNode, "created_at" | "updated_at">[] {
  return rfNodes.map((n) => {
    const { label, nodeType, itemId, dbNodeId, ...rest } = n.data as any;
    return {
      id: n.id,
      flow_id: flowId,
      company_id: companyId,
      node_type: nodeType ?? kindToNodeType(n.type as FlowNodeKind),
      position_x: Math.round(n.position.x),
      position_y: Math.round(n.position.y),
      config_json: { ...rest, item_id: itemId },
      label: label ?? null,
    };
  });
}

export function edgesToConnections(
  rfEdges: Edge[],
  flowId: string,
  companyId: string
): Omit<AutomationConnection, "created_at">[] {
  return rfEdges.map((e) => ({
    id: e.id,
    flow_id: flowId,
    company_id: companyId,
    from_node_id: e.source,
    to_node_id: e.target,
    label: (e.label as string) ?? null,
  }));
}

// ── Helpers ──

function mapNodeTypeToKind(nt: string): FlowNodeKind {
  switch (nt) {
    case "trigger": return "trigger";
    case "condition": return "condition";
    case "delay": return "delay";
    case "goal": return "goal";
    case "split": return "split";
    default: return "action";
  }
}

function kindToNodeType(kind: FlowNodeKind): AutomationNode["node_type"] {
  switch (kind) {
    case "trigger": return "trigger";
    case "condition": return "condition";
    case "delay": return "delay";
    case "goal": return "goal";
    case "split": return "split";
    case "note": return "action"; // notes stored as action type
    default: return "action";
  }
}

// ── Hook ──

export function useFlowAdapter(dbNodes: AutomationNode[], dbConnections: AutomationConnection[]) {
  const rfNodes = useMemo(() => nodesToReactFlow(dbNodes), [dbNodes]);
  const rfEdges = useMemo(() => connectionsToEdges(dbConnections), [dbConnections]);

  const toDbNodes = useCallback(
    (nodes: Node[], flowId: string, companyId: string) =>
      reactFlowToNodes(nodes, flowId, companyId) as AutomationNode[],
    []
  );

  const toDbConnections = useCallback(
    (edges: Edge[], flowId: string, companyId: string) =>
      edgesToConnections(edges, flowId, companyId) as AutomationConnection[],
    []
  );

  return { rfNodes, rfEdges, toDbNodes, toDbConnections };
}
