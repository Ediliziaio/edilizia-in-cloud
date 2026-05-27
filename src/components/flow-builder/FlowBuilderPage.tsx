import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WorkflowError } from "./panels/WorkflowErrorsPanel";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type OnConnect,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAutomationBuilder } from "@/hooks/useAutomationBuilder";
import { useIsAdminMarketing } from "@/hooks/useMarketingRoutePrefix";
import { nodesToReactFlow, connectionsToEdges } from "@/components/flow-builder/hooks/useFlowAdapter";
import { nodeTypes, edgeTypes } from "@/components/flow-builder/nodes";
import { FlowBuilderHeader, type BuilderTab } from "./FlowBuilderHeader";
import { FlowBuilderSidebar, type LeftPanel } from "./FlowBuilderSidebar";
import { WorkflowRightPanel } from "./WorkflowRightPanel";
import { WorkflowImpostazioni } from "./tabs/WorkflowImpostazioni";
import { WorkflowCronologia } from "./tabs/WorkflowCronologia";
import { WorkflowRegistro } from "./tabs/WorkflowRegistro";
import { TestFlowDialog } from "./TestFlowDialog";
import { type CatalogItem } from "@/lib/flow-node-catalog";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";

export function FlowBuilderPage() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast: uiToast } = useToast();
  const isNewFlowRoute = !routeId || routeId === "nuova";
  const flowId = isNewFlowRoute ? undefined : routeId;
  const creationAttemptedRef = useRef(false);

  const isAdmin = useIsAdminMarketing();
  const builder = useAutomationBuilder(flowId);
  const {
    flow, isLoading, isSaving, hasUnsavedChanges, canUndo, canRedo,
    undo, redo, saveImmediate, togglePublish,
    addNode, updateNode, removeNode, removeConnection, addConnection,
    effectiveCompany, user, createFlowMutation, updateFlowMutation,
  } = builder;

  // UI state
  const [activeTab, setActiveTab] = useState<BuilderTab>("builder");
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("none");
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<"catalog" | "config">("catalog");
  const [catalogTab, setCatalogTab] = useState<"trigger" | "action" | "condition">("trigger");
  const [catalogContext, setCatalogContext] = useState<"trigger" | "action">("trigger");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingInsertEdgeId, setPendingInsertEdgeId] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [testEnrollmentId, setTestEnrollmentId] = useState<string | null>(null);
  const [nodeTestStatus, setNodeTestStatus] = useState<Record<string, "success" | "error" | "skipped">>({});

  // ReactFlow state
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const initializedRef = useRef(false);

  // Reset initialized flag when flowId changes (e.g. /nuova → /{realId})
  useEffect(() => { initializedRef.current = false; }, [flowId]);
  // Reset creation guard on route change
  useEffect(() => { if (!isNewFlowRoute) creationAttemptedRef.current = false; }, [isNewFlowRoute]);

  useEffect(() => {
    const requestedPanel = searchParams.get("panel") || searchParams.get("mode");
    if (requestedPanel === "ai") setLeftPanel("ai");
  }, [searchParams]);

  // Sync DB → ReactFlow (only on initial load)
  useEffect(() => {
    if (initializedRef.current) return;
    if (builder.nodes.length > 0 || builder.connections.length > 0) {
      const rfNodesData = nodesToReactFlow(builder.nodes);
      // Inject onOpenCatalog on empty triggers
      setRfNodes(rfNodesData.map(n => {
        if (n.type === "trigger" && !n.data?.itemId) {
          return { ...n, data: { ...n.data, onOpenCatalog: () => openCatalog("trigger") } };
        }
        if (n.type === "trigger" && n.data?.itemId) {
          return { ...n, data: { ...n.data, onAddTrigger: () => openCatalog("trigger") } };
        }
        return n;
      }));
      // Inject onAddStep callback into all edges loaded from DB
      const rfEdgesData = connectionsToEdges(builder.connections);
      setRfEdges(rfEdgesData.map(e => ({
        ...e,
        data: { ...e.data, onAddStep: (edgeId: string) => openCatalogForEdge(edgeId) },
      })));
      initializedRef.current = true;
    } else if (!isLoading && builder.nodes.length === 0 && (flowId || isNewFlowRoute)) {
      // Empty canvas placeholder: trigger + end node
      const triggerId = "placeholder-trigger";
      const endId = "placeholder-end";
      setRfNodes([
        {
          id: triggerId,
          type: "trigger",
          position: { x: 300, y: 80 },
          data: { label: "Aggiungi trigger", isEmpty: true, nodeType: "trigger", onOpenCatalog: () => openCatalog("trigger") },
        },
        {
          id: endId,
          type: "end",
          position: { x: 300, y: 500 },
          data: { label: "Fine", nodeType: "end" },
        },
      ]);
      setRfEdges([
        {
          id: "e-placeholder",
          source: triggerId,
          target: endId,
          type: "addStep",
          animated: false,
          style: { strokeWidth: 1.5, strokeDasharray: "6 3" },
          data: { onAddStep: (edgeId: string) => openCatalogForEdge(edgeId) },
        },
      ]);
      initializedRef.current = true;
    }
  }, [builder.nodes, builder.connections, setRfNodes, setRfEdges, flowId, isLoading]);

  // Create flow if new
  useEffect(() => {
    if (isNewFlowRoute && effectiveCompany && user && !createFlowMutation.isPending && !createFlowMutation.data && !creationAttemptedRef.current) {
      creationAttemptedRef.current = true;
      createFlowMutation.mutate("Nuova Automazione", {
        onSuccess: (data) => {
          // Detect current path prefix for admin vs company
          const prefix = window.location.pathname.startsWith("/admin") ? "/admin" : "/azienda";
          const panelParam = searchParams.get("panel") || searchParams.get("mode");
          navigate(`${prefix}/marketing/automazioni/${data.id}${panelParam === "ai" ? "?panel=ai" : ""}`, { replace: true });
        },
      });
    }
  }, [isNewFlowRoute, effectiveCompany, user, searchParams, createFlowMutation, navigate]);

  // Handle connect
  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      if (params.source === params.target) return;

      const sourceNode = rfNodes.find((n) => n.id === params.source);
      const targetNode = rfNodes.find((n) => n.id === params.target);

      if (sourceNode?.type === "note" || targetNode?.type === "note") return;
      if (targetNode?.type === "trigger") {
        uiToast({ title: "Connessione non valida", description: "Il trigger non può avere connessioni in ingresso.", variant: "destructive" });
        return;
      }

      const newEdge: Edge = {
        id: crypto.randomUUID(),
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle ?? undefined,
        targetHandle: params.targetHandle ?? undefined,
        type: "addStep",
        animated: true,
        style: { strokeWidth: 2 },
        data: { onAddStep: (edgeId: string) => openCatalogForEdge(edgeId) },
        label: params.sourceHandle === "yes" ? "Sì" : params.sourceHandle === "no" ? "No" : undefined,
      };
      setRfEdges((eds) => addEdge(newEdge, eds));
      if (flowId && effectiveCompany) {
        addConnection({
          id: newEdge.id, flow_id: flowId, company_id: effectiveCompany.id,
          from_node_id: params.source, to_node_id: params.target,
          label: (newEdge.label as string) ?? null, created_at: new Date().toISOString(),
        });
      }
    },
    [flowId, effectiveCompany, setRfEdges, addConnection, rfNodes, uiToast]
  );

  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      // Protect end nodes from deletion
      const safeDeletions = deletedNodes.filter((n) => n.type !== "end");
      if (safeDeletions.length < deletedNodes.length) {
        toast.info("Il nodo Fine non può essere eliminato.");
      }
      for (const node of safeDeletions) removeNode(node.id);
      setSelectedNodeId((prev) => safeDeletions.some((n) => n.id === prev) ? null : prev);
    },
    [removeNode]
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => { for (const edge of deletedEdges) removeConnection(edge.id); },
    [removeConnection]
  );

  // Handle drop from right panel catalog
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("application/flow-node");
      if (!data || !reactFlowInstance || !flowId || !effectiveCompany || !user) return;

      const item: CatalogItem = JSON.parse(data);
      const position = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeFromItem(item, position);
    },
    [reactFlowInstance, flowId, effectiveCompany, user, setRfNodes, addNode]
  );
  // Open catalog panel with context filtering
  const openCatalog = useCallback((tab?: "trigger" | "action" | "condition") => {
    const ctx = tab === "trigger" ? "trigger" : "action";
    setCatalogContext(ctx);
    setRightPanelOpen(true);
    setRightPanelMode("catalog");
    setSelectedNodeId(null);
    if (tab) setCatalogTab(tab);
  }, []);

  // Open catalog for edge insertion (tracks which edge was clicked)
  const openCatalogForEdge = useCallback((edgeId: string) => {
    setPendingInsertEdgeId(edgeId);
    openCatalog("action");
  }, [openCatalog]);

  const addNodeFromItem = useCallback(
    (item: CatalogItem, position?: { x: number; y: number }) => {
      if (!flowId || !effectiveCompany || !user) {
        toast.error("Impossibile aggiungere il nodo: il flusso non è ancora pronto.");
        return;
      }

      // If selecting a trigger and there's a placeholder trigger, replace it
      if (item.kind === "trigger") {
        const placeholder = rfNodes.find((n) => n.type === "trigger" && n.data?.isEmpty);
        if (placeholder) {
          const newNodeId = crypto.randomUUID();
          setRfNodes((nds) =>
            nds.map((n) =>
              n.id === placeholder.id
                ? {
                    ...n,
                    id: newNodeId,
                    data: {
                      label: item.label,
                      nodeType: "trigger",
                      itemId: item.id,
                      dbNodeId: newNodeId,
                      onAddTrigger: () => openCatalog("trigger"),
                    },
                  }
                : n
            )
          );
          // Update edges that referenced the placeholder
          setRfEdges((eds) =>
            eds.map((e) => (e.source === placeholder.id ? { ...e, source: newNodeId } : e))
          );
          addNode({
            id: newNodeId, flow_id: flowId, company_id: effectiveCompany.id,
            node_type: "trigger",
            position_x: Math.round(placeholder.position.x), position_y: Math.round(placeholder.position.y),
            config_json: { item_id: item.id },
            label: item.label, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          });
          // Auto-open config for the new trigger
          setSelectedNodeId(newNodeId);
          setRightPanelMode("config");
          return;
        }
      }

      // If adding extra trigger (no placeholder), align horizontally
      if (item.kind === "trigger") {
        const existingTriggers = rfNodes.filter((n) => n.type === "trigger");
        const firstTrigger = existingTriggers[0];
        const baseY = firstTrigger?.position.y ?? 100;
        const offsetX = existingTriggers.length * 280;
        const pos = position ?? { x: 300 + offsetX, y: baseY };
        const newNodeId = crypto.randomUUID();
        const rfNode: Node = {
          id: newNodeId,
          type: "trigger",
          position: pos,
          data: { label: item.label, nodeType: "trigger", itemId: item.id, dbNodeId: newNodeId, onAddTrigger: () => openCatalog("trigger") },
        };
        setRfNodes((nds) => [...nds, rfNode]);
        // Connect to the first action or end node
        const endNode = rfNodes.find((n) => n.type === "end");
        const firstActionEdge = rfEdges.find((e) => e.source === existingTriggers[0]?.id);
        const targetId = firstActionEdge?.target ?? endNode?.id;
        if (targetId) {
          const edgeId = crypto.randomUUID();
          const newEdge: Edge = {
            id: edgeId,
            source: newNodeId,
            target: targetId,
            type: "addStep",
            animated: true,
            style: { strokeWidth: 2 },
            data: { onAddStep: (eid: string) => openCatalogForEdge(eid) },
          };
          setRfEdges((eds) => [...eds, newEdge]);
          if (flowId && effectiveCompany) {
            addConnection({
              id: edgeId, flow_id: flowId, company_id: effectiveCompany.id,
              from_node_id: newNodeId, to_node_id: targetId,
              label: null, created_at: new Date().toISOString(),
            });
          }
        }
        addNode({
          id: newNodeId, flow_id: flowId, company_id: effectiveCompany.id,
          node_type: "trigger",
          position_x: Math.round(pos.x), position_y: Math.round(pos.y),
          config_json: { item_id: item.id },
          label: item.label, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        // Auto-open config for the new trigger
        setSelectedNodeId(newNodeId);
        setRightPanelMode("config");
        return;
      }

      const pos = position ?? { x: 300 + Math.random() * 100, y: 200 + rfNodes.length * 120 };
      const newNodeId = crypto.randomUUID();
      const rfNode: Node = {
        id: newNodeId,
        type: item.kind,
        position: pos,
        data: {
          label: item.label,
          nodeType: item.kind === "condition" ? "condition" : item.kind === "delay" ? "delay" : item.kind === "goal" ? "goal" : item.kind === "split" ? "split" : "action",
          itemId: item.id,
          dbNodeId: newNodeId,
          ...(item.kind === "note" ? { note_text: "" } : {}),
        },
      };

      setRfNodes((nds) => [...nds, rfNode]);
      addNode({
        id: newNodeId, flow_id: flowId, company_id: effectiveCompany.id,
        node_type: rfNode.data.nodeType as any,
        position_x: Math.round(pos.x), position_y: Math.round(pos.y),
        config_json: { item_id: item.id, ...(item.kind === "note" ? { note_text: "" } : {}) },
        label: item.label, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });

      // Auto-open config for non-note nodes
      if (item.kind !== "note") {
        setSelectedNodeId(newNodeId);
        setRightPanelOpen(true);
        setRightPanelMode("config");
      }
    },
    [flowId, effectiveCompany, user, setRfNodes, setRfEdges, addNode, addConnection, rfNodes, rfEdges, openCatalogForEdge]
  );

  const handleSelectItem = useCallback(
    (item: CatalogItem) => {
      // If we have a pending edge insertion, insert node into that edge
      if (pendingInsertEdgeId) {
        const edge = rfEdges.find((e) => e.id === pendingInsertEdgeId);
        if (edge && flowId && effectiveCompany && user) {
          const sourceNode = rfNodes.find((n) => n.id === edge.source);
          const targetNode = rfNodes.find((n) => n.id === edge.target);
          if (sourceNode && targetNode) {
            const midX = (sourceNode.position.x + targetNode.position.x) / 2;
            const midY = (sourceNode.position.y + targetNode.position.y) / 2;

            // Shift target node and all nodes below it down by 160px
            const targetY = targetNode.position.y;
            setRfNodes((nds) =>
              nds.map((n) => {
                if (n.position.y >= targetY && n.id !== sourceNode.id && n.type !== "trigger") {
                  return { ...n, position: { ...n.position, y: n.position.y + 160 } };
                }
                return n;
              })
            );

            const newNodeId = crypto.randomUUID();
            const pos = { x: sourceNode.position.x, y: midY };
            const nodeType = item.kind === "condition" ? "condition" : item.kind === "delay" ? "delay" : item.kind === "goal" ? "goal" : item.kind === "split" ? "split" : "action";

            const rfNode: Node = {
              id: newNodeId,
              type: item.kind,
              position: pos,
              data: { label: item.label, nodeType, itemId: item.id, dbNodeId: newNodeId },
            };

            // Remove old edge, add node, add new edges
            const edge1Id = crypto.randomUUID();
            const edge2Id = crypto.randomUUID();
            const makeEdge = (id: string, source: string, target: string, sourceHandle?: string, label?: string): Edge => ({
              id,
              source,
              target,
              sourceHandle,
              type: "addStep",
              animated: true,
              style: { strokeWidth: 2 },
              data: { onAddStep: (eid: string) => openCatalogForEdge(eid) },
              label,
            });

            if (item.kind === "condition") {
              // Condition node: "yes" branch goes to original target, "no" branch goes to a new End node
              const endNodeId = crypto.randomUUID();
              const edge3Id = crypto.randomUUID();
              const endPos = { x: pos.x + 200, y: pos.y + 160 };

              setRfEdges((eds) => [
                ...eds.filter((e) => e.id !== pendingInsertEdgeId),
                makeEdge(edge1Id, edge.source, newNodeId),
                makeEdge(edge2Id, newNodeId, edge.target, "yes", "Sì"),
                makeEdge(edge3Id, newNodeId, endNodeId, "no", "No"),
              ]);
              setRfNodes((nds) => [
                ...nds,
                rfNode,
                {
                  id: endNodeId,
                  type: "end",
                  position: endPos,
                  data: { label: "Fine", nodeType: "end" },
                },
              ]);

              removeConnection(pendingInsertEdgeId);
              addConnection({
                id: edge1Id, flow_id: flowId, company_id: effectiveCompany.id,
                from_node_id: edge.source, to_node_id: newNodeId,
                label: null, created_at: new Date().toISOString(),
              });
              addConnection({
                id: edge2Id, flow_id: flowId, company_id: effectiveCompany.id,
                from_node_id: newNodeId, to_node_id: edge.target,
                label: "Sì", created_at: new Date().toISOString(),
              });
            } else if (item.kind === "split") {
              // Split A/B node: branch A goes to original target, branch B goes to new End node
              const endNodeId = crypto.randomUUID();
              const edge3Id = crypto.randomUUID();
              const endPos = { x: pos.x + 200, y: pos.y + 160 };

              setRfEdges((eds) => [
                ...eds.filter((e) => e.id !== pendingInsertEdgeId),
                makeEdge(edge1Id, edge.source, newNodeId),
                makeEdge(edge2Id, newNodeId, edge.target, "split_0", "A: 50%"),
                makeEdge(edge3Id, newNodeId, endNodeId, "split_1", "B: 50%"),
              ]);
              setRfNodes((nds) => [
                ...nds,
                rfNode,
                {
                  id: endNodeId,
                  type: "end",
                  position: endPos,
                  data: { label: "Fine", nodeType: "end" },
                },
              ]);

              removeConnection(pendingInsertEdgeId);
              addConnection({
                id: edge1Id, flow_id: flowId, company_id: effectiveCompany.id,
                from_node_id: edge.source, to_node_id: newNodeId,
                label: null, created_at: new Date().toISOString(),
              });
              addConnection({
                id: edge2Id, flow_id: flowId, company_id: effectiveCompany.id,
                from_node_id: newNodeId, to_node_id: edge.target,
                label: "A: 50%", created_at: new Date().toISOString(),
              });
            } else {
              setRfEdges((eds) => [
                ...eds.filter((e) => e.id !== pendingInsertEdgeId),
                makeEdge(edge1Id, edge.source, newNodeId),
                makeEdge(edge2Id, newNodeId, edge.target),
              ]);
              setRfNodes((nds) => [...nds, rfNode]);
            }

            // Persist node + edges (for non-condition; condition already persisted above)
            if (item.kind !== "condition") {
              removeConnection(pendingInsertEdgeId);
              addNode({
                id: newNodeId, flow_id: flowId, company_id: effectiveCompany.id,
                node_type: nodeType as any,
                position_x: Math.round(pos.x), position_y: Math.round(pos.y),
                config_json: { item_id: item.id },
                label: item.label, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              });
              addConnection({
                id: edge1Id, flow_id: flowId, company_id: effectiveCompany.id,
                from_node_id: edge.source, to_node_id: newNodeId,
                label: null, created_at: new Date().toISOString(),
              });
              addConnection({
                id: edge2Id, flow_id: flowId, company_id: effectiveCompany.id,
                from_node_id: newNodeId, to_node_id: edge.target,
                label: null, created_at: new Date().toISOString(),
              });
            } else {
              // Condition node already persisted; just persist the main node
              addNode({
                id: newNodeId, flow_id: flowId, company_id: effectiveCompany.id,
                node_type: nodeType as any,
                position_x: Math.round(pos.x), position_y: Math.round(pos.y),
                config_json: { item_id: item.id },
                label: item.label, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              });
            }

            // Auto-open config for the inserted node
            setSelectedNodeId(newNodeId);
            setRightPanelMode("config");
          }
        }
        setPendingInsertEdgeId(null);
        return;
      }

      addNodeFromItem(item);
    },
    [addNodeFromItem, pendingInsertEdgeId, rfEdges, rfNodes, flowId, effectiveCompany, user, setRfNodes, setRfEdges, addNode, addConnection, removeConnection, openCatalogForEdge]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      updateNode(node.id, { position_x: Math.round(node.position.x), position_y: Math.round(node.position.y) });
    },
    [updateNode]
  );


  // Node click → open config in right panel (but NOT for empty trigger placeholder)
  const onNodeClick = useCallback((_: any, node: Node) => {
    if (node.type === "note") return;
    // If clicking an empty trigger placeholder, open trigger catalog instead
    if (node.type === "trigger" && node.data?.isEmpty) {
      openCatalog("trigger");
      return;
    }
    setSelectedNodeId(node.id);
    setRightPanelOpen(true);
    setRightPanelMode("config");
  }, [openCatalog]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    if (rightPanelMode === "config") {
      setRightPanelOpen(false);
    }
  }, [rightPanelMode]);

  // Config panel handlers
  const selectedRfNode = useMemo(
    () => rfNodes.find((n) => n.id === selectedNodeId) ?? null,
    [rfNodes, selectedNodeId]
  );

  // Trigger context: itemId of the first configured trigger node
  const triggerItemId = useMemo(() => {
    const t = rfNodes.find(n => n.type === "trigger" && !n.data?.isEmpty);
    return (t?.data?.itemId as string) || undefined;
  }, [rfNodes]);

  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Record<string, any>) => {
      setRfNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: newData } : n)));
      updateNode(nodeId, { config_json: { item_id: newData.itemId, ...newData }, label: newData.label ?? null });
    },
    [setRfNodes, updateNode]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      // Find incoming and outgoing edges to reconnect
      const incomingEdges = rfEdges.filter((e) => e.target === nodeId);
      const outgoingEdges = rfEdges.filter((e) => e.source === nodeId);

      // Build reconnection edges: for each (source → deleted → target), create source → target
      const newEdges: Edge[] = [];
      for (const inEdge of incomingEdges) {
        for (const outEdge of outgoingEdges) {
          const newEdgeId = crypto.randomUUID();
          newEdges.push({
            id: newEdgeId,
            source: inEdge.source,
            target: outEdge.target,
            type: "addStep",
            animated: true,
            style: { strokeWidth: 2 },
            data: { onAddStep: (eid: string) => openCatalogForEdge(eid) },
          });
          // Persist new connection
          addConnection({
            id: newEdgeId,
            flow_id: flowId,
            company_id: effectiveCompany?.id ?? "",
            from_node_id: inEdge.source,
            to_node_id: outEdge.target,
            label: null, created_at: new Date().toISOString(),
          });
        }
      }

      // Remove old edges for the deleted node, add reconnection edges
      setRfEdges((eds) => [
        ...eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
        ...newEdges,
      ]);

      // Remove old connections from persistence
      for (const e of [...incomingEdges, ...outgoingEdges]) {
        removeConnection(e.id);
      }

      setRfNodes((nds) => nds.filter((n) => n.id !== nodeId));
      removeNode(nodeId);
      setSelectedNodeId(null);
      setRightPanelOpen(false);
    },
    [setRfNodes, setRfEdges, rfEdges, removeNode, addConnection, removeConnection, flowId, effectiveCompany, openCatalogForEdge]
  );

  const handleUpdateName = useCallback(
    (name: string) => {
      updateFlowMutation.mutate({ name });
    },
    [updateFlowMutation]
  );

  const handleArchive = useCallback(() => {
    updateFlowMutation.mutate({ status: "archived" as any });
    toast.success("Workflow archiviato");
  }, [updateFlowMutation]);

  const handleBack = useCallback(async () => {
    const prefix = window.location.pathname.startsWith("/admin") ? "/admin" : "/azienda";
    const backUrl = `${prefix}/marketing/automazioni`;
    const hasPersistedNodes = builder.nodes.some((n) => n.node_type !== ("end" as typeof n.node_type));

    // If flow was auto-created but user never added any persisted nodes, delete it silently.
    if (flowId && !hasPersistedNodes) {
      try {
        let deleteQuery = supabase.from("automation_flows").delete().eq("id", flowId);
        if (effectiveCompany?.id) deleteQuery = deleteQuery.eq("company_id", effectiveCompany.id);
        await deleteQuery;
      } catch { /* silently ignore */ }
    }
    navigate(backUrl);
  }, [flowId, builder.nodes, navigate, effectiveCompany?.id]);

  // Compute validation errors from nodes
  const validationErrors = useMemo<WorkflowError[]>(() => {
    const errs: WorkflowError[] = [];
    const nonNoteNodes = rfNodes.filter(n => n.type !== "note");
    const configuredTriggers = nonNoteNodes.filter(n => n.type === "trigger" && !n.data?.isEmpty);
    const configuredActions = nonNoteNodes.filter(n => n.type === "action" && (n.data?.itemId || n.data?.action_type));
    const triggerIds = configuredTriggers
      .map((n) => String(n.data?.itemId ?? n.data?.trigger_event ?? ""))
      .filter(Boolean);
    const actionIds = configuredActions
      .map((n) => String(n.data?.itemId ?? n.data?.action_type ?? ""))
      .filter(Boolean);

    // No trigger at all
    if (nonNoteNodes.length > 1 && !nonNoteNodes.some(n => n.type === "trigger")) {
      errs.push({ nodeId: "", nodeLabel: "Flusso", tipo: "errore", messaggio: "Il flusso non ha un trigger di avvio." });
    }

    if (configuredTriggers.length > 1) {
      errs.push({ nodeId: "", nodeLabel: "Flusso", tipo: "avviso", messaggio: "Sono presenti più trigger: verifica che non attivino lo stesso contatto due volte." });
    }

    const hasContactUpdateLoop = triggerIds.some(id => id.includes("contact") && id.includes("updated"))
      && actionIds.some(id => id.includes("update_contact"));
    const hasOpportunityUpdateLoop = triggerIds.some(id => id.includes("opportunity") && (id.includes("updated") || id.includes("stage")))
      && actionIds.some(id => id.includes("opportunity") && (id.includes("update") || id.includes("stage") || id.includes("move")));
    if (hasContactUpdateLoop || hasOpportunityUpdateLoop) {
      errs.push({
        nodeId: "",
        nodeLabel: "Anti-loop",
        tipo: "avviso",
        messaggio: "Il trigger e un'azione aggiornano la stessa area dati: verifica le condizioni per evitare riattivazioni continue.",
      });
    }

    for (const n of nonNoteNodes) {
      if (n.type === "end") continue;

      // Trigger: empty placeholder not configured
      if (n.type === "trigger" && n.data?.isEmpty) {
        errs.push({ nodeId: n.id, nodeLabel: "Trigger", tipo: "errore", messaggio: "Trigger non configurato — seleziona un evento di attivazione." });
        continue;
      }

      // Action without type configured
      if (n.type === "action" && !n.data?.itemId && !n.data?.action_type) {
        errs.push({ nodeId: n.id, nodeLabel: n.data?.label || "Azione", tipo: "errore", messaggio: "Azione non configurata — apri il nodo e scegli il tipo di azione." });
      }

      // Condition without field
      if (n.type === "condition") {
        const hasField = n.data?.condition_field || n.data?.conditions?.length > 0;
        if (!hasField) {
          errs.push({ nodeId: n.id, nodeLabel: n.data?.label || "Condizione", tipo: "avviso", messaggio: "Condizione senza criterio configurato." });
        }
      }

      // Delay without duration
      if (n.type === "delay") {
        const delayValue = Number(n.data?.delay_durata ?? n.data?.delay_value);
        if (!Number.isFinite(delayValue) || delayValue <= 0) {
        errs.push({ nodeId: n.id, nodeLabel: n.data?.label || "Attesa", tipo: "avviso", messaggio: "Durata dell'attesa non impostata." });
        }
      }

      // Disconnected node (no incoming edge, except trigger)
      if (n.type !== "trigger") {
        const hasIncoming = rfEdges.some(e => e.target === n.id);
        if (!hasIncoming) {
          errs.push({ nodeId: n.id, nodeLabel: n.data?.label || "Nodo", tipo: "avviso", messaggio: "Nodo isolato — nessuna connessione in ingresso." });
        }
      }

      // Action / trigger: no outgoing edge (and not goal/end)
      if (n.type !== "end" && n.type !== "goal") {
        const hasOutgoing = rfEdges.some(e => e.source === n.id);
        if (!hasOutgoing) {
          errs.push({ nodeId: n.id, nodeLabel: n.data?.label || "Nodo", tipo: "avviso", messaggio: "Nodo terminale senza connessione uscente — aggiungi un'azione successiva." });
        }
      }
    }

    return errs;
  }, [rfNodes, rfEdges]);

  const readinessChecks = useMemo(() => {
    const nonNoteNodes = rfNodes.filter(n => n.type !== "note");
    const hasTrigger = nonNoteNodes.some(n => n.type === "trigger" && !n.data?.isEmpty);
    const hasAction = nonNoteNodes.some(n => ["action", "condition", "delay", "goal", "split"].includes(String(n.type)));
    const blockingErrors = validationErrors.filter(e => e.tipo === "errore").length;
    const warnings = validationErrors.filter(e => e.tipo === "avviso").length;

    return [
      { label: "Trigger configurato", ok: hasTrigger },
      { label: "Almeno uno step operativo", ok: hasAction },
      { label: "Nessun errore bloccante", ok: blockingErrors === 0 },
      { label: "Controlli anti-loop verificati", ok: warnings === 0 },
    ];
  }, [rfNodes, validationErrors]);

  const publishSummary = useMemo(() => {
    const nonNoteNodes = rfNodes.filter(n => n.type !== "note" && n.type !== "end");
    const triggers = nonNoteNodes.filter(n => n.type === "trigger" && !n.data?.isEmpty).length;
    const actions = nonNoteNodes.filter(n => n.type === "action").length;
    const conditions = nonNoteNodes.filter(n => n.type === "condition").length;
    const delays = nonNoteNodes.filter(n => n.type === "delay").length;
    return { triggers, actions, conditions, delays };
  }, [rfNodes]);

  const canPublish = readinessChecks.every(check => check.ok);

  useEffect(() => {
    const errorNodeIds = new Set(validationErrors.filter(e => e.tipo === "errore" && e.nodeId).map(e => e.nodeId));
    const warningNodeIds = new Set(validationErrors.filter(e => e.tipo === "avviso" && e.nodeId).map(e => e.nodeId));

    setRfNodes((nodes) => {
      let changed = false;
      const next = nodes.map((node) => {
        const hasError = errorNodeIds.has(node.id);
        const hasWarning = warningNodeIds.has(node.id);
        if (node.data?.hasError === hasError && node.data?.hasWarning === hasWarning) return node;
        changed = true;
        return { ...node, data: { ...node.data, hasError, hasWarning } };
      });
      return changed ? next : nodes;
    });
  }, [validationErrors, setRfNodes]);

  // Badge counts for tabs
  const { data: enrollmentCount = 0 } = useQuery({
    queryKey: ["flow-enrollment-count", flowId],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("automation_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("flow_id", flowId!);
      return count ?? 0;
    },
    enabled: !!flowId,
    refetchInterval: activeTab === "cronologia" ? false : 30000,
  });

  // Canvas overlay: poll execution log after test
  useQuery({
    queryKey: ["test-overlay", testEnrollmentId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("automation_execution_log")
        .select("node_id, status")
        .eq("enrollment_id", testEnrollmentId!);
      if (!data?.length) return null;
      const statuses: Record<string, "success" | "error" | "skipped"> = {};
      for (const row of data) {
        statuses[row.node_id] = row.status;
      }
      setNodeTestStatus(statuses);
      return statuses;
    },
    enabled: !!testEnrollmentId,
    // 2026-05-27 (perf audit): polling ogni 2s era senza upper bound — se
    // l'utente lascia la pagina aperta con testEnrollmentId attivo (cambio
    // tab, distrazione) il polling batte Supabase 30/min indefinitamente.
    // Ora: polling 2s SOLO se almeno un nodo è ancora in-flight (no status
    // terminale). Quando tutti i nodi hanno status finale, refetchInterval
    // ritorna false (stop polling). Safety extra: cap massimo 5 min
    // dall'inizio test.
    refetchInterval: (query) => {
      const data = query.state.data as Record<string, string> | undefined;
      // Se non abbiamo dati ancora, continua a polling (test appena partito)
      if (!data) return 2000;
      const values = Object.values(data);
      if (values.length === 0) return 2000;
      // Se ALMENO uno non è in stato finale, continua
      const allTerminal = values.every((s) => s === "success" || s === "error" || s === "skipped");
      return allTerminal ? false : 2000;
    },
    refetchIntervalInBackground: false,
  });

  // Apply canvas overlay colors to nodes
  useEffect(() => {
    if (Object.keys(nodeTestStatus).length === 0) return;
    setRfNodes(nds => nds.map(n => {
      const dbId = n.data?.dbNodeId || n.id;
      const status = nodeTestStatus[dbId];
      if (!status) return { ...n, className: "" };
      const ring = status === "success"
        ? "ring-2 ring-green-500 ring-offset-1"
        : status === "error"
        ? "ring-2 ring-red-500 ring-offset-1"
        : "ring-2 ring-muted-foreground ring-offset-1";
      return { ...n, className: ring };
    }));
  }, [nodeTestStatus, setRfNodes]);

  // Auto-save removed: manual save only via Ctrl+S or Save button

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveImmediate(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, saveImmediate]);

  // Error / loading states
  const isError = !isLoading && flowId && !flow && !isNewFlowRoute;

  // Guard: require company selection for super_admin
  if (!effectiveCompany && !isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertCircle className="h-10 w-10 text-warning" />
          <p className="text-sm font-medium text-foreground">Seleziona un'azienda</p>
          <p className="text-xs text-muted-foreground">Per utilizzare il builder delle automazioni devi prima selezionare un'azienda dal selettore in alto.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Torna indietro</Button>
        </div>
      </div>
    );
  }

  if (isLoading || (isNewFlowRoute && createFlowMutation.isPending)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">Errore nel caricamento del flow.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Torna indietro</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <FlowBuilderHeader
        flow={flow}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        canUndo={canUndo}
        canRedo={canRedo}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSave={saveImmediate}
        onUndo={undo}
        onRedo={redo}
        onTogglePublish={() => {
          if (flow?.status === "published") {
            togglePublish();
            return;
          }
          if (!canPublish) {
            setLeftPanel("errors");
            toast.error("Automazione non pronta", { description: validationErrors.find(e => e.tipo === "errore")?.messaggio || "Controlla la checklist prima di pubblicare." });
            return;
          }
          setPublishDialogOpen(true);
        }}
        onUpdateName={handleUpdateName}
        onArchive={handleArchive}
        onTest={() => setTestDialogOpen(true)}
        onBack={handleBack}
        tabBadges={{ cronologia: enrollmentCount > 0 ? enrollmentCount : undefined }}
      />

      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pubblicare questa automazione?</AlertDialogTitle>
            <AlertDialogDescription>
              Dopo la pubblicazione il flusso potrà reagire agli eventi reali configurati. Verifica trigger, azioni e condizioni prima di procedere.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="font-semibold">{publishSummary.triggers}</span> trigger</div>
              <div><span className="font-semibold">{publishSummary.actions}</span> azioni</div>
              <div><span className="font-semibold">{publishSummary.conditions}</span> condizioni</div>
              <div><span className="font-semibold">{publishSummary.delays}</span> attese</div>
            </div>
            <div className="space-y-1.5">
              {readinessChecks.map((check) => (
                <div key={check.label} className="flex items-center justify-between gap-3 text-xs">
                  <span>{check.label}</span>
                  <span className={check.ok ? "font-medium text-emerald-600" : "font-medium text-destructive"}>
                    {check.ok ? "OK" : "Da verificare"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPublishDialogOpen(false);
                void togglePublish();
              }}
            >
              Pubblica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test dialog */}
      <TestFlowDialog
        open={testDialogOpen}
        onClose={() => setTestDialogOpen(false)}
        flow={flow}
        companyId={effectiveCompany?.id}
        onEnrollmentCreated={(id) => {
          setTestEnrollmentId(id);
          setActiveTab("cronologia");
          toast.info("Test avviato — visualizzo il percorso in Cronologia");
        }}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — only in builder tab */}
        {activeTab === "builder" && (
          <FlowBuilderSidebar activePanel={leftPanel} onPanelChange={setLeftPanel} flowId={flowId} errors={validationErrors} readinessChecks={readinessChecks} />
        )}

        {/* Center content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === "builder" && (
            <div className="flex-1 relative" ref={reactFlowWrapper}>
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodesDelete={onNodesDelete}
                onEdgesDelete={onEdgesDelete}
                onInit={setReactFlowInstance}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                deleteKeyCode={["Backspace", "Delete"]}
                className="bg-muted/30"
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                <Controls />
                <MiniMap
                  nodeStrokeWidth={3}
                  className="!bg-background !border-border"
                  maskColor="hsl(var(--muted) / 0.5)"
                />
              </ReactFlow>

              {/* Floating button to open catalog when right panel is closed */}
              {!rightPanelOpen && (
                <div className="absolute top-3 right-3 flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs shadow-sm" onClick={() => openCatalog("trigger")}>
                    + Trigger
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs shadow-sm" onClick={() => openCatalog("action")}>
                    + Azione
                  </Button>
                </div>
              )}
            </div>
          )}
          {activeTab === "impostazioni" && <WorkflowImpostazioni flowId={flowId} />}
          {activeTab === "cronologia" && <WorkflowCronologia flowId={flowId} />}
          {activeTab === "registro" && <WorkflowRegistro flowId={flowId} />}
        </div>

        {/* Right panel — only in builder tab */}
        {activeTab === "builder" && rightPanelOpen && (
          <WorkflowRightPanel
            mode={rightPanelMode}
            catalogTab={catalogTab}
            catalogContext={catalogContext}
            onCatalogTabChange={setCatalogTab}
            selectedNode={selectedRfNode}
            onUpdateData={handleUpdateNodeData}
            onDelete={handleDeleteNode}
            onClose={() => { setRightPanelOpen(false); setSelectedNodeId(null); }}
            onSave={saveImmediate}
            onDragStart={() => {}}
            onSelectItem={handleSelectItem}
            companyId={effectiveCompany?.id}
            triggerItemId={triggerItemId}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  );
}
