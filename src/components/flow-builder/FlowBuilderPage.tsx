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
  MarkerType,
  Panel,
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
import { NodeMeasureFix } from "@/components/flow-builder/NodeMeasureFix";
import { computeAutoLayout } from "@/components/flow-builder/autoLayout";
import { FlowBuilderHeader, type BuilderTab } from "./FlowBuilderHeader";
import { FlowBuilderSidebar, type LeftPanel } from "./FlowBuilderSidebar";
import { WorkflowRightPanel } from "./WorkflowRightPanel";
import { WorkflowImpostazioni } from "./tabs/WorkflowImpostazioni";
import { WorkflowCronologia } from "./tabs/WorkflowCronologia";
import { WorkflowRegistro } from "./tabs/WorkflowRegistro";
import { TestFlowDialog } from "./TestFlowDialog";
import { type CatalogItem } from "@/lib/flow-node-catalog";
import { Loader2, AlertCircle, Wand2, Monitor } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobileDevice = useIsMobile();
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
    addNode, updateNode, updateNodePositions, removeNode, removeConnection, addConnection,
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
  const [nodeTestData, setNodeTestData] = useState<Record<string, { input?: unknown; output?: unknown }>>({});

  // ReactFlow state
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const initializedRef = useRef(false);
  const autoTidiedRef = useRef(false);

  // Reset initialized flag when flowId changes (e.g. /nuova → /{realId})
  useEffect(() => { initializedRef.current = false; autoTidiedRef.current = false; }, [flowId]);
  // Reset creation guard on route change
  useEffect(() => { if (!isNewFlowRoute) creationAttemptedRef.current = false; }, [isNewFlowRoute]);

  useEffect(() => {
    const requestedPanel = searchParams.get("panel") || searchParams.get("mode");
    if (requestedPanel === "ai") setLeftPanel("ai");
  }, [searchParams]);

  // Sync DB → ReactFlow (only on initial load).
  // Si aspetta che TUTTE le query siano finite (`!isLoading`) e si legge dai DATI
  // GREZZI `dbNodes`/`dbConnections` (non dagli state `nodes`/`connections`, che si
  // sincronizzano un render dopo). Così nodi ED edge vengono disegnati insieme: senza
  // questo, una race disegnava i nodi ma con `connections` ancora vuoto → niente linee.
  useEffect(() => {
    if (initializedRef.current) return;
    if (isLoading) return; // attendi flow + nodi + connessioni
    if (builder.dbNodes.length > 0 || builder.dbConnections.length > 0) {
      const rfNodesData = nodesToReactFlow(builder.dbNodes);
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
      const rfEdgesData = connectionsToEdges(builder.dbConnections);
      setRfEdges(rfEdgesData.map(e => ({
        ...e,
        data: { ...e.data, onAddStep: (edgeId: string) => openCatalogForEdge(edgeId) },
      })));
      initializedRef.current = true;
    } else if (builder.remoteEmpty && (flowId || isNewFlowRoute)) {
      // Empty canvas placeholder: trigger + end node.
      // Si usa `remoteEmpty` (derivato dai DATI GREZZI della query) e NON
      // `builder.nodes.length === 0`: lo state `nodes` si sincronizza un render
      // dopo che `isLoading` diventa false, e quella finestra faceva scattare il
      // placeholder (con lock permanente) su flussi che in realtà hanno nodi.
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
          data: { onAddStep: (edgeId: string) => openCatalogForEdge(edgeId) },
        },
      ]);
      initializedRef.current = true;
    }
  }, [builder.dbNodes, builder.dbConnections, builder.remoteEmpty, setRfNodes, setRfEdges, flowId, isNewFlowRoute, isLoading]);

  // Undo/Redo → risincronizza il canvas dal mirror del hook. Il mirror
  // (builder.nodes/connections) è ciò che "Salva" persiste: senza questo
  // resync Ctrl+Z non cambiava nulla a schermo ma il salvataggio scriveva
  // comunque lo stato rollbackato → perdita dati silenziosa. I nodi solo
  // visivi (Fine, trigger placeholder) e i loro archi non vivono nel mirror:
  // si preservano dal canvas corrente finché i loro estremi esistono ancora.
  useEffect(() => {
    if (builder.revision === 0) return;
    const rebuilt = nodesToReactFlow(builder.nodes).map((n) => {
      if (n.type === "trigger" && !n.data?.itemId) {
        return { ...n, data: { ...n.data, onOpenCatalog: () => openCatalog("trigger") } };
      }
      if (n.type === "trigger" && n.data?.itemId) {
        return { ...n, data: { ...n.data, onAddTrigger: () => openCatalog("trigger") } };
      }
      return n;
    });
    const rebuiltIds = new Set(rebuilt.map((n) => n.id));
    const visualOnlyNodes = rfNodes.filter(
      (n) => !rebuiltIds.has(n.id) && (n.type === "end" || Boolean(n.data?.isEmpty))
    );
    const allIds = new Set([...rebuilt, ...visualOnlyNodes].map((n) => n.id));
    const mirrorEdgeIds = new Set(builder.connections.map((c) => c.id));
    const rebuiltEdges = connectionsToEdges(builder.connections)
      .filter((e) => allIds.has(e.source) && allIds.has(e.target))
      .map((e) => ({ ...e, data: { ...e.data, onAddStep: (edgeId: string) => openCatalogForEdge(edgeId) } }));
    const visualOnlyEdges = rfEdges.filter(
      (e) => !mirrorEdgeIds.has(e.id) && allIds.has(e.source) && allIds.has(e.target)
    );
    setRfNodes([...rebuilt, ...visualOnlyNodes]);
    setRfEdges([...rebuiltEdges, ...visualOnlyEdges]);
    setSelectedNodeId((prev) => (prev && !allIds.has(prev) ? null : prev));
    // Solo `revision` nelle deps: rfNodes/rfEdges cambiano ad ogni resync e
    // rimetterli qui creerebbe un loop; servono solo come snapshot corrente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder.revision]);

  // Auto-ordina alla prima apertura: ogni flusso viene mostrato con un layout
  // verticale pulito e CENTRATO (connettori dritti, stile GHL) senza dover
  // cliccare "Riordina". È solo VISIVO (non scrive su DB, non marca dirty) e
  // non distruttivo: i flussi già ordinati hanno movedCount=0 → non si toccano;
  // se l'utente sposta i nodi a mano in sessione, restano (l'auto-ordina gira una
  // sola volta per apertura). NB: NON si usa useNodesInitialized (richiederebbe un
  // ReactFlowProvider, qui assente → crash): si aspetta `reactFlowInstance` (da onInit)
  // e un piccolo delay per far misurare le card a ReactFlow, poi si leggono i nodi
  // misurati con getNodes() per centrare in base alla larghezza reale.
  useEffect(() => {
    if (autoTidiedRef.current) return;
    if (!initializedRef.current || !reactFlowInstance) return;
    const realNodes = rfNodes.filter((n) => !String(n.id).startsWith("placeholder-"));
    if (realNodes.length < 2 || rfEdges.length === 0) {
      autoTidiedRef.current = true; // niente da ordinare (vuoto / placeholder)
      return;
    }
    autoTidiedRef.current = true; // gira una sola volta per apertura
    const t = window.setTimeout(() => {
      try {
        const measured = reactFlowInstance.getNodes?.() ?? rfNodes;
        const { positions, movedCount } = computeAutoLayout(measured, rfEdges);
        if (movedCount > 0 && Object.keys(positions).length > 0) {
          setRfNodes((nds) => nds.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)));
          window.setTimeout(() => {
            try { reactFlowInstance.fitView?.({ padding: 0.2, duration: 300 }); } catch { /* noop */ }
          }, 60);
        }
      } catch { /* noop: l'auto-ordina è best-effort, mai bloccare il builder */ }
    }, 250);
    return () => window.clearTimeout(t);
  }, [rfNodes, rfEdges, setRfNodes, reactFlowInstance]);

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
        // Label di ramo: il motore li normalizza (Sì/yes, No/no) — per gli
        // split gli handle split_0/split_1 diventano "A"/"B" (prima restavano
        // senza label e il motore seguiva ENTRAMBI i rami).
        label: params.sourceHandle === "yes" ? "Sì"
          : params.sourceHandle === "no" ? "No"
          : params.sourceHandle === "split_0" ? "A"
          : params.sourceHandle === "split_1" ? "B"
          : undefined,
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

      // Auto-connessione: niente nodi orfani. Il nuovo nodo (non-nota) viene
      // inserito nel flusso appena prima del nodo "Fine".
      if (item.kind !== "note") {
        const endNode = rfNodes.find((n) => n.type === "end");
        const edgeToEnd = endNode ? rfEdges.find((e) => e.target === endNode.id) : undefined;
        const mkEdge = (source: string, target: string): Edge => ({
          id: crypto.randomUUID(), source, target, type: "addStep", animated: true,
          style: { strokeWidth: 2 }, data: { onAddStep: (eid: string) => openCatalogForEdge(eid) },
        });
        const persist = (e: Edge) => {
          if (flowId && effectiveCompany) addConnection({
            id: e.id, flow_id: flowId, company_id: effectiveCompany.id,
            from_node_id: e.source, to_node_id: e.target, label: null, created_at: new Date().toISOString(),
          });
        };
        if (edgeToEnd) {
          // sorgente → nuovo → Fine (sostituisce sorgente → Fine)
          const e1 = mkEdge(edgeToEnd.source, newNodeId);
          const e2 = mkEdge(newNodeId, edgeToEnd.target);
          setRfEdges((eds) => [...eds.filter((e) => e.id !== edgeToEnd.id), e1, e2]);
          removeConnection(edgeToEnd.id);
          persist(e1); persist(e2);
        } else {
          // nessun arco verso Fine: collega da un nodo "foglia" (senza archi uscenti) al nuovo, e nuovo → Fine
          const leaf = rfNodes.find((n) => n.type !== "end" && n.type !== "note" && !rfEdges.some((e) => e.source === n.id))
            ?? rfNodes.find((n) => n.type === "trigger");
          if (leaf) { const e1 = mkEdge(leaf.id, newNodeId); setRfEdges((eds) => [...eds, e1]); persist(e1); }
          if (endNode) { const e2 = mkEdge(newNodeId, endNode.id); setRfEdges((eds) => [...eds, e2]); persist(e2); }
        }
      }

      // Auto-open config for non-note nodes
      if (item.kind !== "note") {
        setSelectedNodeId(newNodeId);
        setRightPanelOpen(true);
        setRightPanelMode("config");
      }
    },
    [flowId, effectiveCompany, user, setRfNodes, setRfEdges, addNode, addConnection, removeConnection, rfNodes, rfEdges, openCatalogForEdge]
  );

  // (spostato dopo addNodeFromItem: TS2448 used-before-declaration)
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("application/flow-node");
      if (!data || !reactFlowInstance || !flowId || !effectiveCompany || !user) return;

      const item: CatalogItem = JSON.parse(data);
      const position = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeFromItem(item, position);
    },
    // addNodeFromItem nelle deps: la closure stale ragionava su rfNodes/rfEdges
    // del primo render → auto-connessioni sbagliate dal secondo drop in poi.
    [reactFlowInstance, flowId, effectiveCompany, user, addNodeFromItem]
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
            const shouldShift = (n: Node) =>
              n.position.y >= targetY && n.id !== sourceNode.id && n.type !== "trigger";
            setRfNodes((nds) =>
              nds.map((n) => {
                if (shouldShift(n)) {
                  return { ...n, position: { ...n.position, y: n.position.y + 160 } };
                }
                return n;
              })
            );
            // Lo shift va propagato anche al mirror: applicarlo solo a ReactFlow
            // faceva salvare le posizioni VECCHIE → al reload i nodi tornavano
            // sovrapposti. (I nodi solo-visivi non nel mirror vengono ignorati.)
            const shiftedPositions: Record<string, { x: number; y: number }> = {};
            for (const n of rfNodes) {
              if (shouldShift(n)) shiftedPositions[n.id] = { x: n.position.x, y: n.position.y + 160 };
            }
            if (Object.keys(shiftedPositions).length > 0) updateNodePositions(shiftedPositions);

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

            // Persist node + edges (condition e split hanno già persistito le
            // LORO connessioni etichettate sopra: ri-aggiungerle qui creava id
            // duplicati → upsert Postgres in errore al salvataggio).
            if (item.kind !== "condition") {
              if (item.kind !== "split") removeConnection(pendingInsertEdgeId);
              addNode({
                id: newNodeId, flow_id: flowId, company_id: effectiveCompany.id,
                node_type: nodeType as any,
                position_x: Math.round(pos.x), position_y: Math.round(pos.y),
                config_json: { item_id: item.id },
                label: item.label, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              });
              if (item.kind !== "split") {
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
              }
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
    [addNodeFromItem, pendingInsertEdgeId, rfEdges, rfNodes, flowId, effectiveCompany, user, setRfNodes, setRfEdges, addNode, addConnection, removeConnection, updateNodePositions, openCatalogForEdge]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      updateNode(node.id, { position_x: Math.round(node.position.x), position_y: Math.round(node.position.y) });
    },
    [updateNode]
  );

  // Auto-layout "Riordina": ridispone i nodi in un layout verticale pulito
  // seguendo il grafo dai trigger. Aggiorna sia la vista (rfNodes) sia lo stato
  // DB-mirror marcando il flow come dirty (stesso meccanismo di onNodeDragStop,
  // ma in blocco → un solo undo/salvataggio). Risolve i flussi esistenti in cui
  // il nodo "Fine" resta lontano/scollegato.
  const handleAutoLayout = useCallback(() => {
    const { positions, movedCount } = computeAutoLayout(rfNodes, rfEdges);
    if (Object.keys(positions).length === 0) {
      toast.info("Nessun nodo da riordinare");
      return;
    }
    // Niente da muovere → niente updateNodePositions: marcava il flusso come
    // "modifiche non salvate" (pallino su Salva + prompt all'uscita) senza
    // alcuna modifica reale.
    if (movedCount === 0) {
      try { reactFlowInstance?.fitView?.({ padding: 0.2, duration: 400 }); } catch { /* noop */ }
      toast.success("Il flusso è già ordinato");
      return;
    }
    setRfNodes((nds) => nds.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)));
    updateNodePositions(positions);
    // Rinquadra la vista sul nuovo layout (dopo l'applicazione delle posizioni).
    window.setTimeout(() => {
      try { reactFlowInstance?.fitView?.({ padding: 0.2, duration: 400 }); } catch { /* noop */ }
    }, 60);
    toast.success("Flusso riordinato");
  }, [rfNodes, rfEdges, setRfNodes, updateNodePositions, reactFlowInstance]);


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
      // Gli AVVISI non bloccano il publish: i nodi Fine non vengono persistiti
      // by-design, quindi alla riapertura l'ultimo nodo risulta "senza uscita"
      // e con `ok: warnings === 0` NESSUN flusso lineare era ripubblicabile.
      // Il motore chiude comunque l'iscrizione sui nodi foglia.
      { label: warnings === 0 ? "Controlli anti-loop verificati" : `${warnings} avvisi (non bloccanti)`, ok: true, warning: warnings > 0 },
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
        .select("node_id, status, input_json, output_json")
        .eq("enrollment_id", testEnrollmentId!);
      if (!data?.length) return null;
      const statuses: Record<string, "success" | "error" | "skipped"> = {};
      const payloads: Record<string, { input?: unknown; output?: unknown }> = {};
      for (const row of data) {
        statuses[row.node_id] = row.status;
        payloads[row.node_id] = { input: row.input_json, output: row.output_json };
      }
      setNodeTestStatus(statuses);
      setNodeTestData(payloads);
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

  // Overlay del test: evidenzia i NODI (ring) e fa "scorrere i dati" nelle LINEE.
  useEffect(() => {
    // Test azzerato → ripristina lo stile delle linee toccate
    if (Object.keys(nodeTestStatus).length === 0) {
      setRfEdges(eds =>
        eds.some(e => (e.data as { __flow?: boolean } | undefined)?.__flow)
          ? eds.map(e =>
              (e.data as { __flow?: boolean } | undefined)?.__flow
                ? { ...e, animated: false, style: { ...e.style, stroke: undefined, strokeWidth: 1.5, filter: undefined }, data: { ...e.data, __flow: false } }
                : e,
            )
          : eds,
      );
      return;
    }
    // Mappa id-nodo-ReactFlow → stato (via dbNodeId)
    const statusByRfId: Record<string, string> = {};
    for (const n of rfNodes) {
      const dbId = (n.data?.dbNodeId as string) || n.id;
      const st = nodeTestStatus[dbId];
      if (st) statusByRfId[n.id] = st;
    }
    // Ring sui nodi
    setRfNodes(nds => nds.map(n => {
      const dbId = (n.data?.dbNodeId as string) || n.id;
      const status = nodeTestStatus[dbId];
      if (!status) return { ...n, className: "" };
      const ring = status === "success"
        ? "ring-2 ring-green-500 ring-offset-1"
        : status === "error"
        ? "ring-2 ring-red-500 ring-offset-1"
        : "ring-2 ring-muted-foreground ring-offset-1";
      return { ...n, className: ring };
    }));
    // Flusso dati sulle linee: la linea in uscita da un nodo completato si
    // illumina, anima (tratteggio in movimento) e trasporta i dati a valle.
    setRfEdges(eds => eds.map(e => {
      const srcStatus = statusByRfId[e.source];
      if (srcStatus === "success") {
        return { ...e, animated: true, style: { ...e.style, stroke: "#22c55e", strokeWidth: 2.5, strokeDasharray: undefined, filter: "drop-shadow(0 0 4px rgba(34,197,94,0.55))" }, data: { ...e.data, __flow: true } };
      }
      if (srcStatus === "error") {
        return { ...e, animated: false, style: { ...e.style, stroke: "#ef4444", strokeWidth: 2, filter: "drop-shadow(0 0 3px rgba(239,68,68,0.5))" }, data: { ...e.data, __flow: true } };
      }
      return e;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeTestStatus, setRfNodes, setRfEdges]);

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

  // Il builder è un canvas drag-drop (ReactFlow): inusabile a dito su 375px.
  // Su mobile mostriamo un messaggio invece del canvas rotto.
  if (isMobileDevice) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <Monitor className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Il builder delle automazioni richiede un computer</p>
          <p className="text-xs text-muted-foreground">L'editor a nodi (trascina e collega) non è utilizzabile da telefono. Aprilo da desktop per creare o modificare un flusso.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Torna ai flussi</Button>
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
                defaultEdgeOptions={{ type: "addStep", style: { stroke: "#64748b", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#64748b" } }}
                fitView
                deleteKeyCode={["Backspace", "Delete"]}
                className="bg-muted/30"
              >
                {/* Forza la misurazione dei nodi al mount: senza, su React 19 + RF v12
                    il ResizeObserver interno non scatta e gli archi/linee non vengono disegnati. */}
                <NodeMeasureFix />
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                <Controls />
                <Panel position="top-left">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs shadow-sm"
                    onClick={handleAutoLayout}
                    title="Riordina i nodi in un layout verticale pulito a partire dal trigger"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Riordina
                  </Button>
                </Panel>
                <MiniMap
                  nodeStrokeWidth={3}
                  className="!bg-background !border-border"
                  maskColor="hsl(var(--muted) / 0.5)"
                />
              </ReactFlow>

              {/* Floating button to open catalog when right panel is closed.
                  z-10 → sempre sopra le chrome di React Flow; max-w + flex-wrap +
                  shrink-0 → il secondo pulsante ("+ Azione") non viene mai tagliato
                  a destra: se lo spazio è poco i pulsanti vanno a capo invece di
                  sforare il bordo del canvas. */}
              {!rightPanelOpen && (
                <div className="absolute top-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs shadow-sm" onClick={() => openCatalog("trigger")}>
                    + Trigger
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs shadow-sm" onClick={() => openCatalog("action")}>
                    + Azione
                  </Button>
                </div>
              )}

              {/* Inspector dati: durante il test mostra i valori in transito per nodo */}
              {testEnrollmentId && Object.keys(nodeTestData).length > 0 && (
                <div className="absolute bottom-3 left-3 z-10 w-72 max-h-[45%] overflow-auto rounded-lg border bg-background/95 shadow-lg backdrop-blur">
                  <div className="sticky top-0 flex items-center gap-2 border-b bg-background/95 px-3 py-2 text-xs font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    Dati in transito (test)
                  </div>
                  <div className="divide-y">
                    {rfNodes
                      .map((n) => ({ id: (n.data?.dbNodeId as string) || n.id, label: String(n.data?.label ?? "Nodo") }))
                      .filter((n) => nodeTestData[n.id])
                      .map((n) => {
                        const st = nodeTestStatus[n.id];
                        const out = nodeTestData[n.id]?.output as Record<string, unknown> | undefined;
                        const entries = out && typeof out === "object" && !Array.isArray(out) ? Object.entries(out).slice(0, 8) : [];
                        return (
                          <div key={n.id} className="px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-medium">{n.label}</span>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${st === "success" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : st === "error" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-muted text-muted-foreground"}`}>
                                {st ?? "—"}
                              </span>
                            </div>
                            {entries.length > 0 ? (
                              <div className="mt-1 space-y-0.5">
                                {entries.map(([k, v]) => (
                                  <div key={k} className="flex gap-1.5 font-mono text-[10px]">
                                    <span className="max-w-[45%] truncate text-muted-foreground">{k}</span>
                                    <span className="truncate">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-1 text-[10px] text-muted-foreground">nessun dato in output</div>
                            )}
                          </div>
                        );
                      })}
                  </div>
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
