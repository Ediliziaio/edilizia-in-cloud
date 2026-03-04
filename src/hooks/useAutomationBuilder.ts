import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AutomationFlow, AutomationNode, AutomationConnection } from "@/types/automationBuilder";

interface BuilderState {
  nodes: AutomationNode[];
  connections: AutomationConnection[];
}

const MAX_HISTORY = 50;

export function useAutomationBuilder(flowId: string | undefined) {
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAllRef = useRef<() => Promise<void>>(async () => {});
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Use refs for history to avoid callback recreation cascades
  const historyRef = useRef<BuilderState[]>([]);
  const historyIndexRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Load flow
  const { data: flow, isLoading: flowLoading } = useQuery({
    queryKey: ["automation-flow", flowId],
    queryFn: async () => {
      if (!flowId || flowId === "nuova") return null;
      const { data, error } = await supabase
        .from("automation_flows")
        .select("*")
        .eq("id", flowId)
        .single();
      if (error) throw error;
      return data as AutomationFlow;
    },
    enabled: !!flowId && flowId !== "nuova",
  });

  // Load nodes
  const { data: dbNodes, isLoading: nodesLoading } = useQuery({
    queryKey: ["automation-nodes", flowId],
    queryFn: async () => {
      if (!flowId || flowId === "nuova") return [];
      const { data, error } = await supabase
        .from("automation_nodes")
        .select("*")
        .eq("flow_id", flowId)
        .order("created_at");
      if (error) throw error;
      return data as AutomationNode[];
    },
    enabled: !!flowId && flowId !== "nuova",
  });

  // Load connections
  const { data: dbConnections, isLoading: connectionsLoading } = useQuery({
    queryKey: ["automation-connections", flowId],
    queryFn: async () => {
      if (!flowId || flowId === "nuova") return [];
      const { data, error } = await supabase
        .from("automation_connections")
        .select("*")
        .eq("flow_id", flowId);
      if (error) throw error;
      return data as AutomationConnection[];
    },
    enabled: !!flowId && flowId !== "nuova",
  });

  const [nodes, setNodes] = useState<AutomationNode[]>([]);
  const [connections, setConnections] = useState<AutomationConnection[]>([]);

  // Sync from DB
  useEffect(() => {
    if (dbNodes) setNodes(dbNodes);
  }, [dbNodes]);
  useEffect(() => {
    if (dbConnections) setConnections(dbConnections);
  }, [dbConnections]);

  // Push to history (no state deps — uses refs)
  const pushHistory = useCallback((newNodes: AutomationNode[], newConns: AutomationConnection[]) => {
    const truncated = historyRef.current.slice(0, historyIndexRef.current + 1);
    const next = [...truncated, { nodes: newNodes, connections: newConns }];
    if (next.length > MAX_HISTORY) next.shift();
    historyRef.current = next;
    historyIndexRef.current = Math.min(historyIndexRef.current + 1, MAX_HISTORY - 1);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // Undo / Redo
  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const prev = historyRef.current[historyIndexRef.current];
    setNodes(prev.nodes);
    setConnections(prev.connections);
    setHasUnsavedChanges(true);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const next = historyRef.current[historyIndexRef.current];
    setNodes(next.nodes);
    setConnections(next.connections);
    setHasUnsavedChanges(true);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // Auto-save with debounce
  const triggerAutoSave = useCallback(() => {
    setHasUnsavedChanges(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAllRef.current();
    }, 2000);
  }, []);

  // Immediate save (bypasses debounce)
  const saveImmediate = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveAllRef.current();
  }, []);

  // Create flow - with input validation
  const createFlowMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!effectiveCompany) throw new Error("Nessuna azienda selezionata.");
      if (!user) throw new Error("Utente non autenticato.");
      const safeName = name.trim().slice(0, 100) || "Nuova Automazione";
      const { data, error } = await supabase
        .from("automation_flows")
        .insert({ name: safeName, company_id: effectiveCompany.id, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });

  const canPersist = Boolean(flowId && flowId !== "nuova" && flow);

  // Validation before publishing
  const validateForPublish = useCallback((): string[] => {
    const errors: string[] = [];
    const hasTrigger = nodes.some(n => n.node_type === "trigger");
    if (!hasTrigger) errors.push("Aggiungi almeno un trigger prima di pubblicare.");
    if (nodes.length < 2) errors.push("Aggiungi almeno un'azione dopo il trigger.");
    return errors;
  }, [nodes]);

  // Save all nodes + connections
  const saveAll = useCallback(async () => {
    if (!flowId || flowId === "nuova") return;
    const persistCompanyId = effectiveCompany?.id ?? flow?.company_id;
    if (!persistCompanyId) {
      toast.error("Impossibile salvare", { description: "Nessuna azienda attiva." });
      return;
    }
    if (nodes.length === 0) {
      toast("Bozza vuota", { description: "Aggiungi almeno un trigger per un flusso completo." });
    }
    setIsSaving(true);
    try {
      if (nodes.length > 0) {
        const { error: nErr } = await supabase
          .from("automation_nodes")
          .upsert(nodes.map(n => ({
            id: n.id,
            flow_id: flowId,
            company_id: persistCompanyId,
            node_type: n.node_type,
            position_x: n.position_x,
            position_y: n.position_y,
            config_json: n.config_json,
            label: n.label,
          })));
        if (nErr) throw nErr;
      }

      const nodeIds = nodes.map(n => n.id);
      if (dbNodes && dbNodes.length > 0) {
        const removedIds = dbNodes.filter(n => !nodeIds.includes(n.id)).map(n => n.id);
        if (removedIds.length > 0) {
          await supabase.from("automation_nodes").delete().in("id", removedIds);
        }
      }

      if (connections.length > 0) {
        const { error: cErr } = await supabase
          .from("automation_connections")
          .upsert(connections.map(c => ({
            id: c.id,
            flow_id: flowId,
            company_id: persistCompanyId,
            from_node_id: c.from_node_id,
            to_node_id: c.to_node_id,
            label: c.label,
          })));
        if (cErr) throw cErr;
      }

      const connIds = connections.map(c => c.id);
      if (dbConnections && dbConnections.length > 0) {
        const removedConnIds = dbConnections.filter(c => !connIds.includes(c.id)).map(c => c.id);
        if (removedConnIds.length > 0) {
          await supabase.from("automation_connections").delete().in("id", removedConnIds);
        }
      }

      await supabase.from("automation_flows").update({ updated_at: new Date().toISOString() }).eq("id", flowId);

      setHasUnsavedChanges(false);
      toast.success("Salvato con successo");
      queryClient.invalidateQueries({ queryKey: ["automation-nodes", flowId] });
      queryClient.invalidateQueries({ queryKey: ["automation-connections", flowId] });
    } catch (err: any) {
      toast.error("Errore salvataggio", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  }, [flowId, effectiveCompany, flow, nodes, connections, dbNodes, dbConnections, queryClient]);

  // Keep saveAllRef in sync
  useEffect(() => {
    saveAllRef.current = saveAll;
  }, [saveAll]);

  // Add node (uses functional updates to avoid deps on nodes/connections)
  const addNode = useCallback((node: AutomationNode) => {
    setNodes(prev => {
      const next = [...prev, node];
      setConnections(currentConns => {
        pushHistory(next, currentConns);
        return currentConns;
      });
      return next;
    });
    triggerAutoSave();
  }, [pushHistory, triggerAutoSave]);

  // Update node
  const updateNode = useCallback((id: string, updates: Partial<AutomationNode>) => {
    setNodes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, ...updates } : n);
      setConnections(currentConns => {
        pushHistory(next, currentConns);
        return currentConns;
      });
      return next;
    });
    triggerAutoSave();
  }, [pushHistory, triggerAutoSave]);

  // Remove node
  const removeNode = useCallback((id: string) => {
    setNodes(prev => {
      const next = prev.filter(n => n.id !== id);
      setConnections(currentConns => {
        const newConns = currentConns.filter(c => c.from_node_id !== id && c.to_node_id !== id);
        pushHistory(next, newConns);
        return newConns;
      });
      return next;
    });
    setSelectedNodeId(prev => prev === id ? null : prev);
    triggerAutoSave();
  }, [pushHistory, triggerAutoSave]);

  // Add connection
  const addConnection = useCallback((conn: AutomationConnection) => {
    setConnections(prev => {
      const next = [...prev, conn];
      setNodes(currentNodes => {
        pushHistory(currentNodes, next);
        return currentNodes;
      });
      return next;
    });
    triggerAutoSave();
  }, [pushHistory, triggerAutoSave]);

  // Remove connection
  const removeConnection = useCallback((id: string) => {
    setConnections(prev => {
      const next = prev.filter(c => c.id !== id);
      setNodes(currentNodes => {
        pushHistory(currentNodes, next);
        return currentNodes;
      });
      return next;
    });
    triggerAutoSave();
  }, [pushHistory, triggerAutoSave]);

  // Update flow name/description - with input validation
  const updateFlowMutation = useMutation({
    mutationFn: async (updates: Partial<AutomationFlow>) => {
      if (!flowId || flowId === "nuova") return;
      const safeUpdates = { ...updates };
      if (safeUpdates.name) {
        safeUpdates.name = safeUpdates.name.trim().slice(0, 100);
        if (!safeUpdates.name) delete safeUpdates.name;
      }
      const { error } = await supabase.from("automation_flows").update(safeUpdates).eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-flow", flowId] });
      queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
    },
  });

  // Publish / Unpublish
  const togglePublish = useCallback(async () => {
    if (!flow) {
      toast.error("Flow non ancora pronto");
      return;
    }
    if (updateFlowMutation.isPending) return;
    try {
      const newStatus = flow.status === "published" ? "draft" : "published";
      if (newStatus === "published") {
        const errors = validateForPublish();
        if (errors.length > 0) {
          toast.error("Impossibile pubblicare", { description: errors[0] });
          return;
        }
      }
      const newVersion = newStatus === "published" ? flow.version + 1 : flow.version;
      await updateFlowMutation.mutateAsync({ status: newStatus, version: newVersion });
      toast.success(newStatus === "published" ? "Automazione pubblicata" : "Automazione in bozza");
    } catch (err: any) {
      toast.error("Errore aggiornamento stato", { description: err.message });
    }
  }, [flow, updateFlowMutation, validateForPublish]);

  const isLoading = flowLoading || nodesLoading || connectionsLoading;
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  return {
    flow, nodes, connections, isLoading, isSaving, hasUnsavedChanges, canPersist,
    selectedNodeId, selectedNode, setSelectedNodeId,
    addNode, updateNode, removeNode,
    addConnection, removeConnection,
    undo, redo, canUndo, canRedo,
    saveAll, saveImmediate, createFlowMutation, updateFlowMutation, togglePublish, validateForPublish,
    effectiveCompany, user,
  };
}
