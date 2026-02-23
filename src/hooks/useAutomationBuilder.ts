import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
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
  const [history, setHistory] = useState<BuilderState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAllRef = useRef<() => Promise<void>>(async () => {});
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // Push to history
  const pushHistory = useCallback((newNodes: AutomationNode[], newConns: AutomationConnection[]) => {
    setHistory(prev => {
      const truncated = prev.slice(0, historyIndex + 1);
      const next = [...truncated, { nodes: newNodes, connections: newConns }];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  // Undo / Redo
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setNodes(prev.nodes);
    setConnections(prev.connections);
    setHistoryIndex(i => i - 1);
    setHasUnsavedChanges(true);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setNodes(next.nodes);
    setConnections(next.connections);
    setHistoryIndex(i => i + 1);
    setHasUnsavedChanges(true);
  }, [history, historyIndex]);

  // Auto-save with debounce (uses ref to always call latest saveAll)
  const triggerAutoSave = useCallback(() => {
    setHasUnsavedChanges(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAllRef.current();
    }, 2000);
  }, []);

  // Create flow - with guards for effectiveCompany and user
  const createFlowMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!effectiveCompany) throw new Error("Nessuna azienda selezionata. Seleziona un'azienda prima di creare un'automazione.");
      if (!user) throw new Error("Utente non autenticato.");
      const { data, error } = await supabase
        .from("automation_flows")
        .insert({ name, company_id: effectiveCompany.id, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Whether persist actions are possible
  const canPersist = Boolean(flowId && flowId !== "nuova" && effectiveCompany);

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
    if (!flowId || flowId === "nuova" || !effectiveCompany) {
      toast({ title: "Impossibile salvare", description: "Flow non ancora pronto. Attendi il completamento della creazione.", variant: "destructive" });
      return;
    }
    if (nodes.length === 0) {
      toast({ title: "Bozza vuota", description: "Aggiungi almeno un trigger per un flusso completo." });
    }
    setIsSaving(true);
    try {
      // Upsert nodes
      if (nodes.length > 0) {
        const { error: nErr } = await supabase
          .from("automation_nodes")
          .upsert(nodes.map(n => ({
            id: n.id,
            flow_id: flowId,
            company_id: effectiveCompany.id,
            node_type: n.node_type,
            position_x: n.position_x,
            position_y: n.position_y,
            config_json: n.config_json,
            label: n.label,
          })));
        if (nErr) throw nErr;
      }

      // Delete removed nodes
      const nodeIds = nodes.map(n => n.id);
      if (dbNodes && dbNodes.length > 0) {
        const removedIds = dbNodes.filter(n => !nodeIds.includes(n.id)).map(n => n.id);
        if (removedIds.length > 0) {
          await supabase.from("automation_nodes").delete().in("id", removedIds);
        }
      }

      // Upsert connections
      if (connections.length > 0) {
        const { error: cErr } = await supabase
          .from("automation_connections")
          .upsert(connections.map(c => ({
            id: c.id,
            flow_id: flowId,
            company_id: effectiveCompany.id,
            from_node_id: c.from_node_id,
            to_node_id: c.to_node_id,
            label: c.label,
          })));
        if (cErr) throw cErr;
      }

      // Delete removed connections
      const connIds = connections.map(c => c.id);
      if (dbConnections && dbConnections.length > 0) {
        const removedConnIds = dbConnections.filter(c => !connIds.includes(c.id)).map(c => c.id);
        if (removedConnIds.length > 0) {
          await supabase.from("automation_connections").delete().in("id", removedConnIds);
        }
      }

      // Update flow updated_at
      await supabase.from("automation_flows").update({ updated_at: new Date().toISOString() }).eq("id", flowId);

      setHasUnsavedChanges(false);
      toast({ title: "Salvato con successo" });
      queryClient.invalidateQueries({ queryKey: ["automation-nodes", flowId] });
      queryClient.invalidateQueries({ queryKey: ["automation-connections", flowId] });
    } catch (err: any) {
      toast({ title: "Errore salvataggio", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [flowId, effectiveCompany, nodes, connections, dbNodes, dbConnections, queryClient]);

  // Keep saveAllRef in sync
  useEffect(() => {
    saveAllRef.current = saveAll;
  }, [saveAll]);

  // Add node
  const addNode = useCallback((node: AutomationNode) => {
    setNodes(prev => {
      const next = [...prev, node];
      pushHistory(next, connections);
      return next;
    });
    triggerAutoSave();
  }, [connections, pushHistory, triggerAutoSave]);

  // Update node
  const updateNode = useCallback((id: string, updates: Partial<AutomationNode>) => {
    setNodes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, ...updates } : n);
      pushHistory(next, connections);
      return next;
    });
    triggerAutoSave();
  }, [connections, pushHistory, triggerAutoSave]);

  // Remove node
  const removeNode = useCallback((id: string) => {
    setNodes(prev => {
      const next = prev.filter(n => n.id !== id);
      const newConns = connections.filter(c => c.from_node_id !== id && c.to_node_id !== id);
      setConnections(newConns);
      pushHistory(next, newConns);
      return next;
    });
    if (selectedNodeId === id) setSelectedNodeId(null);
    triggerAutoSave();
  }, [connections, pushHistory, selectedNodeId, triggerAutoSave]);

  // Add connection
  const addConnection = useCallback((conn: AutomationConnection) => {
    setConnections(prev => {
      const next = [...prev, conn];
      pushHistory(nodes, next);
      return next;
    });
    triggerAutoSave();
  }, [nodes, pushHistory, triggerAutoSave]);

  // Remove connection
  const removeConnection = useCallback((id: string) => {
    setConnections(prev => {
      const next = prev.filter(c => c.id !== id);
      pushHistory(nodes, next);
      return next;
    });
    triggerAutoSave();
  }, [nodes, pushHistory, triggerAutoSave]);

  // Update flow name/description
  const updateFlowMutation = useMutation({
    mutationFn: async (updates: Partial<AutomationFlow>) => {
      if (!flowId || flowId === "nuova") {
        console.warn("updateFlowMutation called without valid flowId, skipping");
        return;
      }
      const { error } = await supabase.from("automation_flows").update(updates).eq("id", flowId);
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
      toast({ title: "Flow non ancora pronto", variant: "destructive" });
      return;
    }
    if (updateFlowMutation.isPending) return;
    try {
      const newStatus = flow.status === "published" ? "draft" : "published";
      // Validate before publishing
      if (newStatus === "published") {
        const errors = validateForPublish();
        if (errors.length > 0) {
          toast({ title: "Impossibile pubblicare", description: errors[0], variant: "destructive" });
          return;
        }
      }
      const newVersion = newStatus === "published" ? flow.version + 1 : flow.version;
      await updateFlowMutation.mutateAsync({ status: newStatus, version: newVersion });
      toast({ title: newStatus === "published" ? "Automazione pubblicata" : "Automazione in bozza" });
    } catch (err: any) {
      toast({ title: "Errore aggiornamento stato", description: err.message, variant: "destructive" });
    }
  }, [flow, updateFlowMutation, validateForPublish]);

  const isLoading = flowLoading || nodesLoading || connectionsLoading;
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  return {
    flow, nodes, connections, isLoading, isSaving, hasUnsavedChanges, canPersist,
    selectedNodeId, selectedNode, setSelectedNodeId,
    addNode, updateNode, removeNode,
    addConnection, removeConnection,
    undo, redo, canUndo: historyIndex > 0, canRedo: historyIndex < history.length - 1,
    saveAll, createFlowMutation, updateFlowMutation, togglePublish, validateForPublish,
    effectiveCompany, user,
  };
}
