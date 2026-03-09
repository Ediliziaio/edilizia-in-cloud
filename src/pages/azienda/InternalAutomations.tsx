import { useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useInternalAutomationFlows,
  useInternalAutomationFlow,
  useInternalAutomationNodes,
  useInternalAutomationConnections,
  useCreateInternalFlow,
  useUpdateInternalFlow,
  useDeleteInternalFlow,
  useSaveInternalNodes,
} from "@/hooks/useInternalAutomations";
import type {
  InternalAutomationNode,
  InternalAutomationConnection,
  PickerItem,
} from "@/types/internalAutomationBuilder";
import { InternalAutomationCanvas } from "@/components/internalAutomationBuilder/InternalAutomationCanvas";
import { InternalNodePanel } from "@/components/internalAutomationBuilder/InternalNodePanel";
import { InternalTriggerSelector } from "@/components/internalAutomationBuilder/InternalTriggerSelector";
import { InternalActionSelector } from "@/components/internalAutomationBuilder/InternalActionSelector";
import { InternalAutomationLogDrawer } from "@/components/internalAutomationBuilder/InternalAutomationLogDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, ArrowLeft, Zap, Save, FileText, Trash2,
  Play, Pause, BarChart3, Loader2, ChevronLeft,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// ── List View ─────────────────────────────────────────

function FlowListView() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { data: flows, isLoading } = useInternalAutomationFlows();
  const createFlow = useCreateInternalFlow();
  const deleteFlow = useDeleteInternalFlow();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const activeCount = flows?.filter((f) => f.status === "published").length || 0;
  const totalRuns = flows?.reduce((s, f) => s + f.total_runs, 0) || 0;
  const successRate = totalRuns > 0
    ? Math.round(((flows?.reduce((s, f) => s + f.successful_runs, 0) || 0) / totalRuns) * 100)
    : 0;

  const handleCreate = async () => {
    try {
      const flow = await createFlow.mutateAsync("Nuova Automazione");
      navigate(`/azienda/automazioni/${flow.id}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteFlow.mutateAsync(deleteId);
      toast.success("Automazione eliminata");
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automazioni</h1>
          <p className="text-muted-foreground text-sm">
            Configura flussi automatici per commesse, ticket, attività e altro.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={createFlow.isPending || !effectiveCompany}>
          {createFlow.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Crea Automazione
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Play className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Attive</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalRuns}</p>
              <p className="text-xs text-muted-foreground">Esecuzioni totali</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{successRate}%</p>
              <p className="text-xs text-muted-foreground">Success rate</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Flow list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !flows?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <h3 className="text-lg font-medium mb-1">Nessuna automazione</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Crea la tua prima automazione per automatizzare i processi interni.
            </p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" /> Crea Automazione
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {flows.map((flow) => (
            <Card
              key={flow.id}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => navigate(`/azienda/automazioni/${flow.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                      flow.status === "published" ? "bg-emerald-500/10" : "bg-muted"
                    )}>
                      <Zap className={cn("h-4 w-4", flow.status === "published" ? "text-emerald-600" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{flow.name}</p>
                      {flow.description && (
                        <p className="text-xs text-muted-foreground truncate">{flow.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{flow.total_runs} esecuzioni</p>
                    </div>
                    <Badge variant={flow.status === "published" ? "default" : "secondary"} className="text-xs">
                      {flow.status === "published" ? "Attiva" : flow.status === "paused" ? "In pausa" : flow.status === "archived" ? "Archiviata" : "Bozza"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(flow.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa automazione?</AlertDialogTitle>
            <AlertDialogDescription>L'azione è irreversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Builder View ──────────────────────────────────────

function FlowBuilderView({ flowId }: { flowId: string }) {
  const navigate = useNavigate();
  const { data: flow } = useInternalAutomationFlow(flowId);
  const { data: dbNodes } = useInternalAutomationNodes(flowId);
  const { data: dbConnections } = useInternalAutomationConnections(flowId);
  const updateFlow = useUpdateInternalFlow(flowId);
  const saveNodes = useSaveInternalNodes(flowId);

  const [localNodes, setLocalNodes] = useState<InternalAutomationNode[]>([]);
  const [localConnections, setLocalConnections] = useState<InternalAutomationConnection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [triggerPickerOpen, setTriggerPickerOpen] = useState(false);
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [flowName, setFlowName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [addAfterNodeId, setAddAfterNodeId] = useState<string | null>(null);

  // Sync from DB on load
  useState(() => {
    if (dbNodes) setLocalNodes(dbNodes);
    if (dbConnections) setLocalConnections(dbConnections);
    if (flow) setFlowName(flow.name);
  });

  // Keep synced when DB data changes
  useMemo(() => {
    if (dbNodes && !dirty) setLocalNodes(dbNodes);
  }, [dbNodes]);
  useMemo(() => {
    if (dbConnections && !dirty) setLocalConnections(dbConnections);
  }, [dbConnections]);
  useMemo(() => {
    if (flow && !dirty) setFlowName(flow.name);
  }, [flow]);

  const selectedNode = localNodes.find((n) => n.id === selectedNodeId) || null;

  const handleSelectTrigger = useCallback((item: PickerItem) => {
    const id = crypto.randomUUID();
    const triggerNode: InternalAutomationNode = {
      id,
      flow_id: flowId,
      company_id: "",
      node_type: "trigger",
      config_json: { trigger_type: item.id },
      label: null,
      position_x: 300,
      position_y: 60,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setLocalNodes((prev) => [...prev, triggerNode]);
    setDirty(true);
    // Also update flow trigger_type
    updateFlow.mutate({ trigger_type: item.id });
  }, [flowId, updateFlow]);

  const handleSelectAction = useCallback((item: PickerItem) => {
    const id = crypto.randomUUID();
    const nodeType = item.id === "if_condition" ? "condition" : item.id === "wait_delay" ? "delay" : "action";
    const lastNode = localNodes[localNodes.length - 1];
    const parentId = addAfterNodeId || lastNode?.id;

    const newNode: InternalAutomationNode = {
      id,
      flow_id: flowId,
      company_id: "",
      node_type: nodeType,
      config_json: nodeType === "action" ? { action_type: item.id } : {},
      label: null,
      position_x: parentId ? (localNodes.find((n) => n.id === parentId)?.position_x || 300) : 300,
      position_y: parentId ? (localNodes.find((n) => n.id === parentId)?.position_y || 60) + 120 : 180,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const newNodes = [...localNodes, newNode];
    let newConns = [...localConnections];

    if (parentId) {
      newConns.push({
        id: crypto.randomUUID(),
        flow_id: flowId,
        company_id: "",
        from_node_id: parentId,
        to_node_id: id,
        label: null,
        created_at: new Date().toISOString(),
      });
    }

    // If condition node, add "true" and "false" placeholder connections (visual only for now)
    if (nodeType === "condition") {
      // Add two placeholder child nodes for branches
    }

    setLocalNodes(newNodes);
    setLocalConnections(newConns);
    setDirty(true);
    setAddAfterNodeId(null);
    setSelectedNodeId(id);
  }, [flowId, localNodes, localConnections, addAfterNodeId]);

  const handleDeleteNode = useCallback((id: string) => {
    setLocalNodes((prev) => prev.filter((n) => n.id !== id));
    setLocalConnections((prev) => prev.filter((c) => c.from_node_id !== id && c.to_node_id !== id));
    setDirty(true);
    if (selectedNodeId === id) setSelectedNodeId(null);
  }, [selectedNodeId]);

  const handleDuplicateNode = useCallback((id: string) => {
    const node = localNodes.find((n) => n.id === id);
    if (!node || node.node_type === "trigger") return;
    const newId = crypto.randomUUID();
    setLocalNodes((prev) => [...prev, { ...node, id: newId, position_x: node.position_x + 40, position_y: node.position_y + 40 }]);
    setDirty(true);
  }, [localNodes]);

  const handleUpdateNode = useCallback((id: string, updates: Partial<InternalAutomationNode>) => {
    setLocalNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
    setDirty(true);
  }, []);

  const handleAddAfterNode = useCallback((id: string) => {
    setAddAfterNodeId(id);
    setActionPickerOpen(true);
  }, []);

  const handleSave = async () => {
    try {
      await saveNodes.mutateAsync({ nodes: localNodes, connections: localConnections });
      if (flowName !== flow?.name) {
        await updateFlow.mutateAsync({ name: flowName });
      }
      setDirty(false);
      toast.success("Automazione salvata");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = flow?.status === "published" ? "paused" : "published";
    try {
      await updateFlow.mutateAsync({ status: newStatus });
      toast.success(newStatus === "published" ? "Automazione attivata" : "Automazione in pausa");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <button onClick={() => navigate("/azienda/automazioni")} className="text-sm text-primary hover:underline whitespace-nowrap flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Indietro
        </button>
        <Input
          value={flowName}
          onChange={(e) => { setFlowName(e.target.value); setDirty(true); }}
          className="max-w-xs h-8 text-sm font-medium"
        />
        <Badge variant={flow?.status === "published" ? "default" : "secondary"} className="text-xs shrink-0">
          {flow?.status === "published" ? "Attiva" : flow?.status === "paused" ? "In pausa" : "Bozza"}
        </Badge>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Switch
            checked={flow?.status === "published"}
            onCheckedChange={handleToggleStatus}
          />
          <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
            <FileText className="h-4 w-4 mr-1" /> Log
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saveNodes.isPending}>
            {saveNodes.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Salva
          </Button>
        </div>
      </div>

      {/* Canvas + Panel */}
      <div className="flex flex-1 min-h-0">
        <InternalAutomationCanvas
          nodes={localNodes}
          connections={localConnections}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onDeleteNode={handleDeleteNode}
          onDuplicateNode={handleDuplicateNode}
          onAddAfterNode={handleAddAfterNode}
          onUpdateNode={handleUpdateNode}
          onOpenTriggerPicker={() => setTriggerPickerOpen(true)}
          onOpenActionPicker={() => setActionPickerOpen(true)}
        />
        {selectedNode && (
          <InternalNodePanel
            node={selectedNode}
            flowTriggerType={flow?.trigger_type}
            onUpdate={handleUpdateNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Pickers */}
      <InternalTriggerSelector
        open={triggerPickerOpen}
        onClose={() => setTriggerPickerOpen(false)}
        onSelect={handleSelectTrigger}
      />
      <InternalActionSelector
        open={actionPickerOpen}
        onClose={() => { setActionPickerOpen(false); setAddAfterNodeId(null); }}
        onSelect={handleSelectAction}
      />

      {/* Log drawer */}
      <InternalAutomationLogDrawer
        flowId={flowId}
        open={logOpen}
        onClose={() => setLogOpen(false)}
      />
    </div>
  );
}

// ── Main Page Router ──────────────────────────────────

export default function InternalAutomations() {
  const { id } = useParams();

  if (id) {
    return <FlowBuilderView flowId={id} />;
  }

  return <FlowListView />;
}
