import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import type { WorkflowError } from "./panels/WorkflowErrorsPanel";
import { useParams, useNavigate } from "react-router-dom";
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
import { nodesToReactFlow, connectionsToEdges } from "@/components/flow-builder/hooks/useFlowAdapter";
import { nodeTypes, edgeTypes } from "@/components/flow-builder/nodes";
import { FlowBuilderHeader, type BuilderTab } from "./FlowBuilderHeader";
import { FlowBuilderSidebar, type LeftPanel } from "./FlowBuilderSidebar";
import { WorkflowRightPanel } from "./WorkflowRightPanel";
import { WorkflowImpostazioni } from "./tabs/WorkflowImpostazioni";
import { WorkflowCronologia } from "./tabs/WorkflowCronologia";
import { WorkflowRegistro } from "./tabs/WorkflowRegistro";
import { type CatalogItem } from "@/lib/flow-node-catalog";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";

export function FlowBuilderPage() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { toast: uiToast } = useToast();
  const isNewFlowRoute = !routeId || routeId === "nuova";
  const flowId = isNewFlowRoute ? undefined : routeId;
  const creationAttemptedRef = useRef(false);

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

  // Sync DB → ReactFlow (only on initial load)
  useEffect(() => {
    if (initializedRef.current) return;
    if (builder.nodes.length > 0 || builder.connections.length > 0) {
      setRfNodes(nodesToReactFlow(builder.nodes));
      setRfEdges(connectionsToEdges(builder.connections));
      initializedRef.current = true;
    } else if (!isLoading && builder.nodes.length === 0 && (flowId || isNewFlowRoute)) {
      // Empty canvas placeholder: trigger + end node
      const triggerId = "placeholder-trigger";
      const endId = "placeholder-end";
      setRfNodes([
        {
          id: triggerId,
          type: "trigger",
          position: { x: 300, y: 100 },
          data: { label: "Aggiungi trigger", isEmpty: true, nodeType: "trigger", onOpenCatalog: () => openCatalog("trigger") },
        },
        {
          id: endId,
          type: "end",
          position: { x: 300, y: 300 },
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
          data: { onAddStep: (edgeId: string) => openCatalog("action") },
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
          navigate(`${prefix}/marketing/automazioni/${data.id}`, { replace: true });
        },
      });
    }
  }, [isNewFlowRoute, effectiveCompany, user]);

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
        data: { onAddStep: (edgeId: string) => openCatalog("action") },
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
      for (const node of deletedNodes) removeNode(node.id);
      setSelectedNodeId((prev) => deletedNodes.some((n) => n.id === prev) ? null : prev);
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
          return;
        }
      }

      const pos = position ?? { x: 300 + Math.random() * 100, y: 200 + rfNodes.length * 120 };
      const newNodeId = crypto.randomUUID();
      const rfNode: Node = {
        id: newNodeId,
        type: item.kind,
        position: pos,
        data: {
          label: item.label,
          nodeType: item.kind === "trigger" ? "trigger" : item.kind === "condition" ? "condition" : item.kind === "delay" ? "delay" : item.kind === "goal" ? "goal" : item.kind === "split" ? "split" : "action",
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
    },
    [flowId, effectiveCompany, user, setRfNodes, setRfEdges, addNode, rfNodes]
  );

  const handleSelectItem = useCallback(
    (item: CatalogItem) => {
      addNodeFromItem(item);
    },
    [addNodeFromItem]
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

  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Record<string, any>) => {
      setRfNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: newData } : n)));
      updateNode(nodeId, { config_json: { item_id: newData.itemId, ...newData }, label: newData.label ?? null });
    },
    [setRfNodes, updateNode]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setRfNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setRfEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      removeNode(nodeId);
      setSelectedNodeId(null);
      setRightPanelOpen(false);
    },
    [setRfNodes, setRfEdges, removeNode]
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

  // Open catalog panel with context filtering
  const openCatalog = useCallback((tab?: "trigger" | "action" | "condition") => {
    const ctx = tab === "trigger" ? "trigger" : "action";
    setCatalogContext(ctx);
    setRightPanelOpen(true);
    setRightPanelMode("catalog");
    setSelectedNodeId(null);
    if (tab) setCatalogTab(tab);
  }, []);

  // Compute validation errors from nodes
  const validationErrors = useMemo<WorkflowError[]>(() => {
    const errs: WorkflowError[] = [];
    for (const n of rfNodes) {
      if (n.type === "note") continue;
      if (!n.data?.label) {
        errs.push({ nodeId: n.id, nodeLabel: n.data?.label || "Nodo senza nome", tipo: "avviso", messaggio: "Il nodo non ha un'etichetta configurata." });
      }
    }
    // Check if there's at least one trigger
    if (rfNodes.length > 0 && !rfNodes.some((n) => n.type === "trigger")) {
      errs.push({ nodeId: "", nodeLabel: "Flusso", tipo: "errore", messaggio: "Il flusso non ha un trigger di avvio." });
    }
    return errs;
  }, [rfNodes]);

  // Debounced auto-save (5s after last change)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!flowId || !hasUnsavedChanges || !initializedRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveImmediate();
    }, 5000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [rfNodes, rfEdges, flowId, hasUnsavedChanges, saveImmediate]);

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
        onTogglePublish={togglePublish}
        onUpdateName={handleUpdateName}
        onArchive={handleArchive}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — only in builder tab */}
        {activeTab === "builder" && (
          <FlowBuilderSidebar activePanel={leftPanel} onPanelChange={setLeftPanel} flowId={flowId} errors={validationErrors} />
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
            onDragStart={() => {}}
            onSelectItem={handleSelectItem}
          />
        )}
      </div>
    </div>
  );
}
