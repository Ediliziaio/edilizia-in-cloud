import { useState, useCallback, useRef, useEffect } from "react";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { emailSenzaOggettoOTesto } from "@/lib/flow-node-catalog";
import { filterErrors } from "../../supabase/functions/_shared/automationFilters";
import type { AutomationFlow, AutomationNode, AutomationConnection, RestoredAutomationGraph } from "@/types/automationBuilder";

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
  const savedRevisionRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const dirtyRevisionRef = useRef(0);
  const dirtyRef = useRef(false);
  useEffect(() => { savedRevisionRef.current = null; }, [flowId]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  useEffect(() => { dirtyRef.current = false; dirtyRevisionRef.current = 0; setHasUnsavedChanges(false); }, [flowId]);
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
  useEffect(() => { if (flow && savedRevisionRef.current == null) savedRevisionRef.current = flow.updated_at; }, [flow]);

  // Sync from DB
  useEffect(() => {
    if (dbNodes && !dirtyRef.current) setNodes(dbNodes);
  }, [dbNodes]);
  useEffect(() => {
    if (dbConnections && !dirtyRef.current) setConnections(dbConnections);
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
    dirtyRevisionRef.current++;
    dirtyRef.current = true;
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
    dirtyRevisionRef.current++;
    dirtyRef.current = true;
    setHasUnsavedChanges(true);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // Mark as dirty (no auto-save — manual only)
  const markDirty = useCallback(() => {
    dirtyRevisionRef.current++;
    dirtyRef.current = true;
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
      const filters = getNodeConfig(n).trigger_filters ?? getNodeConfig(n).filters;
      for (const message of filterErrors(filters as any)) errors.push(`${n.label || "Trigger"}: ${message}`);
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
    if (saveInFlightRef.current) return false;
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
    saveInFlightRef.current = true;
    const savingRevision = dirtyRevisionRef.current;
    try {
      const persistableNodes = nodes.filter(isPersistableNode);
      const persistableNodeIds = new Set(persistableNodes.map(n => n.id));
      const persistableConnections = connections.filter(c => persistableNodeIds.has(c.from_node_id) && persistableNodeIds.has(c.to_node_id));

      const { data: saved, error } = await (supabase as any).rpc("save_automation_graph", {
        p_flow_id: flowId, p_company_id: persistCompanyId,
        p_expected_updated_at: savedRevisionRef.current ?? flow?.updated_at,
        p_nodes: persistableNodes.map(n => ({ id: n.id, node_type: n.node_type, position_x: n.position_x,
          position_y: n.position_y, config_json: n.config_json, label: n.label })),
        p_connections: persistableConnections.map(c => ({ id: c.id, from_node_id: c.from_node_id, to_node_id: c.to_node_id, label: c.label })),
      });
      if (error) {
        if (error.code === "PGRST202") throw new Error("Salvataggio protetto non ancora disponibile sul server: applicare l’aggiornamento automazioni prima di salvare.");
        throw error;
      }
      savedRevisionRef.current = saved.updated_at;
      queryClient.setQueryData(queryKeys.automations.flow(flowId), (current: any) => current ? { ...current, updated_at: saved.updated_at, version: saved.version } : current);
      queryClient.invalidateQueries({ queryKey: ["flow-versions", flowId] });

      const changedDuringSave = dirtyRevisionRef.current !== savingRevision;
      dirtyRef.current = changedDuringSave;
      setHasUnsavedChanges(changedDuringSave);
      toast.success("Salvato con successo");
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.nodes(flowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.connections(flowId) });
      queryClient.invalidateQueries({ queryKey: ["automation-node-summaries", persistCompanyId] });
      // Bug 4 fix: invalidate flows list so updated_at refreshes
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.all });
      queryClient.invalidateQueries({ queryKey: ["automation-flows", persistCompanyId] });
      return !changedDuringSave;
    } catch (err: any) {
      toast.error("Errore salvataggio", { description: err.message });
      return false;
    } finally {
      saveInFlightRef.current = false;
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
      if (saveInFlightRef.current) throw new Error("Attendi la fine del salvataggio prima di modificare le impostazioni.");
      const { data, error } = await supabase
        .from("automation_flows")
        .update(safeUpdates)
        .eq("id", flowId)
        .eq("company_id", persistCompanyId)
        .eq("updated_at", savedRevisionRef.current ?? flow!.updated_at)
        .select("*").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Il flusso è stato modificato altrove. Ricarica prima di continuare.");
      savedRevisionRef.current = data.updated_at;
      queryClient.setQueryData(queryKeys.automations.flow(flowId), data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.flow(flowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.all });
      queryClient.invalidateQueries({ queryKey: ["automation-flows", effectiveCompany?.id] });
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
      const currentFlow = queryClient.getQueryData<AutomationFlow>(queryKeys.automations.flow(flowId)) ?? flow;
      const newVersion = newStatus === "published" ? currentFlow.version + 1 : currentFlow.version;
      await updateFlowMutation.mutateAsync({ status: newStatus, version: newVersion });
      toast.success(newStatus === "published" ? "Automazione pubblicata" : "Automazione in bozza");
    } catch (err: any) {
      toast.error("Errore aggiornamento stato", { description: err.message });
    }
  }, [flow, updateFlowMutation, validateForPublish, hasUnsavedChanges, saveAll]);

  const isLoading = flowLoading || nodesLoading || connectionsLoading;
  const applyRestoredGraph = useCallback((snapshot: RestoredAutomationGraph) => {
    dirtyRef.current = false;
    dirtyRevisionRef.current++;
    savedRevisionRef.current = snapshot.updated_at;
    setHasUnsavedChanges(false);
    setNodes(snapshot.nodes);
    setConnections(snapshot.connections);
    historyRef.current = [{ nodes: snapshot.nodes, connections: snapshot.connections }];
    historyIndexRef.current = 0;
    historySeededRef.current = true;
    updateUndoRedoState();
    queryClient.setQueryData(queryKeys.automations.nodes(flowId), snapshot.nodes);
    queryClient.setQueryData(queryKeys.automations.connections(flowId), snapshot.connections);
    queryClient.setQueryData(queryKeys.automations.flow(flowId), (current: AutomationFlow | undefined) => current ? { ...current, updated_at: snapshot.updated_at, version: snapshot.version } : current);
    setRevision(r => r + 1);
  }, [flowId, queryClient, updateUndoRedoState]);
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
    saveAll, saveImmediate, createFlowMutation, updateFlowMutation, togglePublish, validateForPublish, applyRestoredGraph,
    effectiveCompany, user,
  };
}
