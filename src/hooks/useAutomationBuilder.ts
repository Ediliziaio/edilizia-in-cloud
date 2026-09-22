import { useState, useCallback, useRef, useEffect } from "react";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { emailSenzaOggettoOTesto } from "@/lib/flow-node-catalog";
import type { AutomationFlow, AutomationNode, AutomationConnection } from "@/types/automationBuilder";

interface BuilderState {
  nodes: AutomationNode[];
  connections: AutomationConnection[];
}

const MAX_HISTORY = 50;
const PUBLISHABLE_NODE_TYPES = new Set(["action", "condition", "delay", "goal", "split"]);

type AutomationConfig = Record<string, unknown>;

function getNodeConfig(node: AutomationNode): AutomationConfig {
  return (node.config_json ?? {}) as AutomationConfig;
}

function isPersistableNode(node: AutomationNode): boolean {
  return node.node_type !== ("end" as AutomationNode["node_type"]);
}

function hasDelayDuration(config: AutomationConfig): boolean {
  const c = (config ?? {}) as Record<string, unknown>;
  // "Fino alle HH:MM": la durata non serve.
  if (c.delay_tipo === "fino_a" && typeof c.delay_orario === "string" && /^\d{1,2}:\d{2}$/.test(c.delay_orario)) {
    return true;
  }
  // Invalida SOLO una durata esplicitamente non valida; assente = ok
  // (il motore applica il default sicuro di 1h, e i template usano lo
  // schema giorni/ore/minuti che PRIMA veniva bocciato qui).
  const value = c.delay_durata ?? c.delay_value;
  if (value != null && value !== "") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0;
  }
  const totalMin = (Number(c.giorni) || 0) * 1440 + (Number(c.ore) || 0) * 60 + (Number(c.minuti) || 0);
  return totalMin >= 0;
}

export function useAutomationBuilder(flowId: string | undefined) {
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAllRef = useRef<() => Promise<boolean>>(async () => false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  useBeforeUnload(hasUnsavedChanges);

  // Use refs for history to avoid callback recreation cascades
  const historyRef = useRef<BuilderState[]>([]);
  const historyIndexRef = useRef(-1);
  const historySeededRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Contatore incrementato SOLO da undo/redo: il builder lo osserva per
  // ricostruire il canvas ReactFlow dal mirror. Le modifiche normali partono
  // già dal canvas, quindi non devono far scattare la ricostruzione.
  const [revision, setRevision] = useState(0);

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

  const companyId = effectiveCompany?.id;

  // Load flow — Bug 2 fix: add company_id filter
  const { data: flow, isLoading: flowLoading } = useQuery({
    queryKey: queryKeys.automations.flow(flowId),
    queryFn: async () => {
      if (!flowId || flowId === "nuova" || !companyId) return null;
      const { data, error } = await supabase
        .from("automation_flows")
        .select("*")
        .eq("id", flowId)
        .eq("company_id", companyId)
        .single();
      if (error) throw error;
      return data as AutomationFlow;
    },
    enabled: !!flowId && flowId !== "nuova" && !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Load nodes — Bug 2 fix: add company_id filter
  const { data: dbNodes, isLoading: nodesLoading } = useQuery({
    queryKey: queryKeys.automations.nodes(flowId),
    queryFn: async () => {
      if (!flowId || flowId === "nuova" || !companyId) return [];
      const { data, error } = await supabase
        .from("automation_nodes")
        .select("*")
        .eq("flow_id", flowId)
        .eq("company_id", companyId)
        .order("created_at");
      if (error) throw error;
      return data as AutomationNode[];
    },
    enabled: !!flowId && flowId !== "nuova" && !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Load connections — Bug 2 fix: add company_id filter
  const { data: dbConnections, isLoading: connectionsLoading } = useQuery({
    queryKey: queryKeys.automations.connections(flowId),
    queryFn: async () => {
      if (!flowId || flowId === "nuova" || !companyId) return [];
      const { data, error } = await supabase
        .from("automation_connections")
        .select("*")
        .eq("flow_id", flowId)
        .eq("company_id", companyId);
      if (error) throw error;
      return data as AutomationConnection[];
    },
    enabled: !!flowId && flowId !== "nuova" && !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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

  // History: reset al cambio flusso e seed del baseline caricato dal DB.
  // Senza il seed la prima entry di history è la PRIMA MODIFICA (indice 0,
  // canUndo=false): lo stato appena caricato non è mai raggiungibile con
  // Ctrl+Z e la prima modifica non è annullabile.
  useEffect(() => {
    historyRef.current = [];
    historyIndexRef.current = -1;
    historySeededRef.current = false;
    updateUndoRedoState();
  }, [flowId, updateUndoRedoState]);
  useEffect(() => {
    if (historySeededRef.current) return;
    if (!dbNodes || !dbConnections) return;
    historyRef.current = [{ nodes: dbNodes, connections: dbConnections }];
    historyIndexRef.current = 0;
    historySeededRef.current = true;
    updateUndoRedoState();
  }, [dbNodes, dbConnections, updateUndoRedoState]);

  // Push to history (no state deps — uses refs)
  const pushHistory = useCallback((newNodes: AutomationNode[], newConns: AutomationConnection[]) => {
    const truncated = historyRef.current.slice(0, historyIndexRef.current + 1);
    const next = [...truncated, { nodes: newNodes, connections: newConns }];
    if (next.length > MAX_HISTORY) next.shift();
    historyRef.current = next;
    historyIndexRef.current = Math.min(historyIndexRef.current + 1, MAX_HISTORY - 1);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // Undo / Redo — bump di `revision` per far ricostruire il canvas ReactFlow
  // dal mirror: senza, Ctrl+Z cambiava solo lo stato salvato (non lo schermo)
  // e il prossimo "Salva" persisteva un grafo diverso da quello visibile.
  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const prev = historyRef.current[historyIndexRef.current];
    setNodes(prev.nodes);
    setConnections(prev.connections);
    setRevision(r => r + 1);
    setHasUnsavedChanges(true);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const next = historyRef.current[historyIndexRef.current];
    setNodes(next.nodes);
    setConnections(next.connections);
    setRevision(r => r + 1);
    setHasUnsavedChanges(true);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // Mark as dirty (no auto-save — manual only)
  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true);
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
    onError: (error: any) => {
      toast.error("Errore", { description: error.message || "Operazione non riuscita. Riprova." });
    },
  });

  const canPersist = Boolean(flowId && flowId !== "nuova" && flow);

  // Validation before publishing
  const validateForPublish = useCallback((): string[] => {
    const errors: string[] = [];
    const persistableNodes = nodes.filter(isPersistableNode);
    const hasTrigger = persistableNodes.some(n => n.node_type === "trigger");
    const hasPublishableStep = persistableNodes.some(n => PUBLISHABLE_NODE_TYPES.has(n.node_type));
    // Senza trigger il flusso è "ricevente": si pubblica se ha almeno uno step
    // (ci si entra dall'azione "Passa a un'altra automazione").
    if (!hasTrigger && !hasPublishableStep) errors.push("Aggiungi un trigger o almeno un'azione: il flusso è vuoto.");
    if (hasTrigger && !hasPublishableStep) errors.push("Aggiungi almeno un'azione dopo il trigger.");

    const incompleteAction = persistableNodes.find(n => {
      if (n.node_type !== "action") return false;
      const config = getNodeConfig(n);
      return !config.itemId && !config.item_id && !config.action_type;
    });
    if (incompleteAction) errors.push("Completa tutte le azioni prima di pubblicare.");

    // Validazione per canale: un'email senza oggetto/corpo o un SMS senza testo
    // fallirebbero in esecuzione — meglio bloccare qui con un messaggio chiaro.
    // Campi: il builder salva gli id italiani del catalogo (oggetto/corpo, testo);
    // i nodi legacy possono usare gli alias inglesi normalizzati dall'engine.
    const hasText = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
    let emailIncompleta = false;
    let smsIncompleto = false;
    for (const n of persistableNodes) {
      if (n.node_type !== "action") continue;
      const config = getNodeConfig(n);
      const actionId = String(config.action_type ?? config.itemId ?? config.item_id ?? "");
      if (emailSenzaOggettoOTesto(actionId, config)) emailIncompleta = true;
      if (actionId.includes("sms")) {
        const hasMessage = hasText(config.testo) || hasText(config.sms_body) || hasText(config.message);
        if (!hasMessage) smsIncompleto = true;
      }
    }
    if (emailIncompleta) errors.push("Un'azione email non ha oggetto o testo.");
    if (smsIncompleto) errors.push("Un'azione SMS non ha il testo del messaggio.");

    const incompleteDelay = persistableNodes.find(n => n.node_type === "delay" && !hasDelayDuration(getNodeConfig(n)));
    if (incompleteDelay) errors.push("Imposta una durata valida per tutte le attese.");

    return errors;
  }, [nodes]);

  // Save all nodes + connections — Bug 4 fix: invalidate flows list after save.
  // Ritorna true se il salvataggio è andato a buon fine (usato da togglePublish
  // per NON pubblicare un canvas non salvato).
  const saveAll = useCallback(async (): Promise<boolean> => {
    if (!flowId || flowId === "nuova") return false;
    const persistCompanyId = effectiveCompany?.id ?? flow?.company_id;
    if (!persistCompanyId) {
      toast.error("Impossibile salvare", { description: "Nessuna azienda attiva." });
      return false;
    }
    if (nodes.length === 0) {
      toast("Bozza vuota", { description: "Aggiungi almeno un trigger per un flusso completo." });
    }
    setIsSaving(true);
    try {
      const persistableNodes = nodes.filter(isPersistableNode);
      const persistableNodeIds = new Set(persistableNodes.map(n => n.id));
      const persistableConnections = connections.filter(c => persistableNodeIds.has(c.from_node_id) && persistableNodeIds.has(c.to_node_id));

      if (persistableNodes.length > 0) {
        const { error: nErr } = await supabase
          .from("automation_nodes")
          .upsert(persistableNodes.map(n => ({
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

      const nodeIds = persistableNodes.map(n => n.id);
      if (dbNodes && dbNodes.length > 0) {
        const removedIds = dbNodes.filter(n => !nodeIds.includes(n.id)).map(n => n.id);
        if (removedIds.length > 0) {
          await supabase
            .from("automation_nodes")
            .delete()
            .eq("flow_id", flowId)
            .eq("company_id", persistCompanyId)
            .in("id", removedIds);
        }
      }

      if (persistableConnections.length > 0) {
        const { error: cErr } = await supabase
          .from("automation_connections")
          .upsert(persistableConnections.map(c => ({
            id: c.id,
            flow_id: flowId,
            company_id: persistCompanyId,
            from_node_id: c.from_node_id,
            to_node_id: c.to_node_id,
            label: c.label,
          })));
        if (cErr) throw cErr;
      }

      const connIds = persistableConnections.map(c => c.id);
      if (dbConnections && dbConnections.length > 0) {
        const removedConnIds = dbConnections.filter(c => !connIds.includes(c.id)).map(c => c.id);
        if (removedConnIds.length > 0) {
          await supabase
            .from("automation_connections")
            .delete()
            .eq("flow_id", flowId)
            .eq("company_id", persistCompanyId)
            .in("id", removedConnIds);
        }
      }

      await supabase
        .from("automation_flows")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", flowId)
        .eq("company_id", persistCompanyId);

      setHasUnsavedChanges(false);
      toast.success("Salvato con successo");
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.nodes(flowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.connections(flowId) });
      queryClient.invalidateQueries({ queryKey: ["automation-node-summaries", persistCompanyId] });
      // Bug 4 fix: invalidate flows list so updated_at refreshes
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.all });
      return true;
    } catch (err: any) {
      toast.error("Errore salvataggio", { description: err.message });
      return false;
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
    markDirty();
  }, [pushHistory, markDirty]);

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
    markDirty();
  }, [pushHistory, markDirty]);

  // Bulk position update (auto-layout): un solo history push + dirty, così
  // "Riordina" si annulla con un solo Ctrl+Z e si salva come un drag normale.
  const updateNodePositions = useCallback((positions: Record<string, { x: number; y: number }>) => {
    setNodes(prev => {
      const next = prev.map(n => {
        const p = positions[n.id];
        return p ? { ...n, position_x: Math.round(p.x), position_y: Math.round(p.y) } : n;
      });
      setConnections(currentConns => {
        pushHistory(next, currentConns);
        return currentConns;
      });
      return next;
    });
    markDirty();
  }, [pushHistory, markDirty]);

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
    markDirty();
  }, [pushHistory, markDirty]);

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
    markDirty();
  }, [pushHistory, markDirty]);

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
    markDirty();
  }, [pushHistory, markDirty]);

  // Update flow name/description - with input validation
  const updateFlowMutation = useMutation({
    mutationFn: async (updates: Partial<AutomationFlow>) => {
      if (!flowId || flowId === "nuova") return;
      const persistCompanyId = effectiveCompany?.id ?? flow?.company_id;
      if (!persistCompanyId) throw new Error("Nessuna azienda attiva.");
      const safeUpdates = { ...updates };
      if (safeUpdates.name) {
        safeUpdates.name = safeUpdates.name.trim().slice(0, 100);
        if (!safeUpdates.name) delete safeUpdates.name;
      }
      const { error } = await supabase
        .from("automation_flows")
        .update(safeUpdates)
        .eq("id", flowId)
        .eq("company_id", persistCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.flow(flowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.all });
    },
    onError: (error: any) => {
      toast.error("Errore", { description: error.message || "Operazione non riuscita. Riprova." });
    },
  });

  // Bug 1 fix: Publish / Unpublish — save canvas before publishing
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
        // Bug 1 fix: save all unsaved changes before publishing.
        // Se il salvataggio fallisce NON pubblicare: si pubblicherebbe la
        // versione vecchia del canvas (diversa da quella a schermo).
        if (hasUnsavedChanges) {
          let saved = false;
          try {
            saved = await saveAll();
          } catch {
            saved = false;
          }
          if (!saved) {
            toast.error("Salvataggio fallito — risolvi prima di pubblicare");
            return;
          }
        }
      }
      const newVersion = newStatus === "published" ? flow.version + 1 : flow.version;
      await updateFlowMutation.mutateAsync({ status: newStatus, version: newVersion });
      toast.success(newStatus === "published" ? "Automazione pubblicata" : "Automazione in bozza");
    } catch (err: any) {
      toast.error("Errore aggiornamento stato", { description: err.message });
    }
  }, [flow, updateFlowMutation, validateForPublish, hasUnsavedChanges, saveAll]);

  const isLoading = flowLoading || nodesLoading || connectionsLoading;
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  // `remoteEmpty` è calcolato sui DATI GREZZI della query (dbNodes/dbConnections),
  // non sullo state `nodes` che viene sincronizzato un render dopo. Serve al builder
  // per distinguere "il flusso è davvero vuoto" da "i nodi stanno ancora arrivando":
  // senza questo, una race mostrava il placeholder vuoto su flussi che HANNO nodi.
  const remoteEmpty =
    !isLoading && (dbNodes?.length ?? 0) === 0 && (dbConnections?.length ?? 0) === 0;

  return {
    flow, nodes, connections, isLoading, remoteEmpty, isSaving, hasUnsavedChanges, canPersist,
    // Dati GREZZI della query (non lo state sincronizzato un render dopo): il builder
    // li usa per il PRIMO paint del canvas, così nodi ED edge appaiono insieme.
    dbNodes: dbNodes ?? [], dbConnections: dbConnections ?? [],
    selectedNodeId, selectedNode, setSelectedNodeId,
    addNode, updateNode, updateNodePositions, removeNode,
    addConnection, removeConnection,
    undo, redo, canUndo, canRedo, revision,
    saveAll, saveImmediate, createFlowMutation, updateFlowMutation, togglePublish, validateForPublish,
    effectiveCompany, user,
  };
}
