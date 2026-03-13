import { useCallback, useRef, useState, useEffect, useMemo } from "react";
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
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAutomationBuilder } from "@/hooks/useAutomationBuilder";
import { nodesToReactFlow, connectionsToEdges, reactFlowToNodes, edgesToConnections } from "@/components/flow-builder/hooks/useFlowAdapter";
import { nodeTypes } from "@/components/flow-builder/nodes";
import { FlowBuilderHeader } from "./FlowBuilderHeader";
import { FlowBuilderSidebar } from "./FlowBuilderSidebar";
import { FlowBuilderConfigPanel } from "./FlowBuilderConfigPanel";
import { getCatalogItem, type CatalogItem, type FlowNodeKind } from "@/lib/flow-node-catalog";
import { Loader2 } from "lucide-react";

export function FlowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const flowId = id === "nuova" ? undefined : id;

  const builder = useAutomationBuilder(flowId);
  const {
    flow, isLoading, isSaving, hasUnsavedChanges, canUndo, canRedo,
    undo, redo, saveImmediate, togglePublish,
    addNode, updateNode, removeNode, addConnection,
    effectiveCompany, user, createFlowMutation,
  } = builder;

  // ReactFlow state
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const initializedRef = useRef(false);

  // Sync DB → ReactFlow (only on initial load)
  useEffect(() => {
    if (initializedRef.current) return;
    if (builder.nodes.length > 0 || builder.connections.length > 0) {
      setRfNodes(nodesToReactFlow(builder.nodes));
      setRfEdges(connectionsToEdges(builder.connections));
      initializedRef.current = true;
    }
  }, [builder.nodes, builder.connections, setRfNodes, setRfEdges]);

  // Create flow if new
  useEffect(() => {
    if (id === "nuova" && effectiveCompany && user && !createFlowMutation.isPending && !createFlowMutation.data) {
      createFlowMutation.mutate("Nuova Automazione", {
        onSuccess: (data) => {
          navigate(`/azienda/marketing/automazioni/${data.id}`, { replace: true });
        },
      });
    }
  }, [id, effectiveCompany, user]);

  // Sync ReactFlow changes back to builder (debounced via builder's auto-save)
  const syncToBuilder = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      if (!flowId || !effectiveCompany) return;
      const dbNodes = reactFlowToNodes(nodes, flowId, effectiveCompany.id);
      const dbConns = edgesToConnections(edges, flowId, effectiveCompany.id);
      // Update builder state directly
      dbNodes.forEach((n) => {
        const existing = builder.nodes.find((bn) => bn.id === n.id);
        if (existing) {
          updateNode(n.id, { position_x: n.position_x, position_y: n.position_y, config_json: n.config_json, label: n.label });
        }
      });
    },
    [flowId, effectiveCompany, builder.nodes, updateNode]
  );

  // Handle connect
  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      const newEdge: Edge = {
        id: crypto.randomUUID(),
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle ?? undefined,
        targetHandle: params.targetHandle ?? undefined,
        type: "smoothstep",
        animated: true,
        style: { strokeWidth: 2 },
        label: params.sourceHandle === "yes" ? "Sì" : params.sourceHandle === "no" ? "No" : undefined,
      };
      setRfEdges((eds) => addEdge(newEdge, eds));
      // Add to builder
      if (flowId && effectiveCompany) {
        addConnection({
          id: newEdge.id,
          flow_id: flowId,
          company_id: effectiveCompany.id,
          from_node_id: params.source,
          to_node_id: params.target,
          label: (newEdge.label as string) ?? null,
          created_at: new Date().toISOString(),
        });
      }
    },
    [flowId, effectiveCompany, setRfEdges, addConnection]
  );

  // Handle drop from sidebar
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
      const position = reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const newNodeId = crypto.randomUUID();
      const rfNode: Node = {
        id: newNodeId,
        type: item.kind,
        position,
        data: {
          label: item.label,
          nodeType: item.kind === "trigger" ? "trigger" : item.kind === "condition" ? "condition" : item.kind === "delay" ? "delay" : item.kind === "goal" ? "goal" : item.kind === "split" ? "split" : "action",
          itemId: item.id,
          dbNodeId: newNodeId,
          ...(item.kind === "note" ? { note_text: "" } : {}),
        },
      };

      setRfNodes((nds) => [...nds, rfNode]);

      // Add to builder state
      addNode({
        id: newNodeId,
        flow_id: flowId,
        company_id: effectiveCompany.id,
        node_type: rfNode.data.nodeType as any,
        position_x: Math.round(position.x),
        position_y: Math.round(position.y),
        config_json: { item_id: item.id, ...(item.kind === "note" ? { note_text: "" } : {}) },
        label: item.label,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    },
    [reactFlowInstance, flowId, effectiveCompany, user, setRfNodes, addNode]
  );

  // Handle node position change (drag end)
  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      updateNode(node.id, {
        position_x: Math.round(node.position.x),
        position_y: Math.round(node.position.y),
      });
    },
    [updateNode]
  );

  // Handle node selection
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Config panel handlers
  const selectedRfNode = useMemo(
    () => rfNodes.find((n) => n.id === selectedNodeId) ?? null,
    [rfNodes, selectedNodeId]
  );

  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Record<string, any>) => {
      setRfNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: newData } : n))
      );
      updateNode(nodeId, {
        config_json: { item_id: newData.itemId, ...newData },
        label: newData.label ?? null,
      });
    },
    [setRfNodes, updateNode]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setRfNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setRfEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      removeNode(nodeId);
      setSelectedNodeId(null);
    },
    [setRfNodes, setRfEdges, removeNode]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveImmediate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, saveImmediate]);

  if (isLoading || (id === "nuova" && createFlowMutation.isPending)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <FlowBuilderHeader
        flow={flow}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        canUndo={canUndo}
        canRedo={canRedo}
        onSave={saveImmediate}
        onUndo={undo}
        onRedo={redo}
        onTogglePublish={togglePublish}
      />

      <div className="flex flex-1 overflow-hidden">
        <FlowBuilderSidebar onDragStart={() => {}} />

        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
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
        </div>

        {selectedRfNode && (
          <FlowBuilderConfigPanel
            selectedNode={selectedRfNode}
            onUpdateData={handleUpdateNodeData}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}
