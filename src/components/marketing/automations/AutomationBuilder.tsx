import { useState, useCallback, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import { useAutomationBuilder } from "@/hooks/useAutomationBuilder";
import { AutomationCanvas } from "./AutomationCanvas";
import { AutomationNodeConfig } from "./AutomationNodeConfig";
import { TriggerPickerDialog } from "./TriggerPickerDialog";
import { ActionPickerDialog } from "./ActionPickerDialog";
import { AutomationSettingsTab } from "./AutomationSettingsTab";
import { AutomationEnrollmentsTab } from "./AutomationEnrollmentsTab";
import { AutomationLogsTab } from "./AutomationLogsTab";
import type { AutomationNode, PickerItem } from "@/types/automationBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Save, Loader2, Undo2, Redo2, PlayCircle, Pencil, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

type RightPanel = "none" | "trigger" | "action" | "config";
type BuilderTab = "builder" | "settings" | "enrollments" | "logs";

export function AutomationBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const flowId = id === "nuova" ? undefined : id;

  const {
    flow, nodes, connections, isLoading, isSaving, hasUnsavedChanges,
    selectedNodeId, selectedNode, setSelectedNodeId,
    addNode, updateNode, removeNode,
    addConnection, removeConnection,
    undo, redo, canUndo, canRedo,
    saveAll, createFlowMutation, updateFlowMutation, togglePublish,
  } = useAutomationBuilder(flowId);

  const [rightPanel, setRightPanel] = useState<RightPanel>("none");
  const [addAfterNodeId, setAddAfterNodeId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("");
  const [activeTab, setActiveTab] = useState<BuilderTab>("builder");
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    if (flow) setFlowName(flow.name);
  }, [flow]);

  // Auto-open trigger picker for new empty flows
  useEffect(() => {
    if (flow && nodes.length === 0 && rightPanel === "none") {
      setRightPanel("trigger");
    }
  }, [flow, nodes.length]);

  // When selecting a node, show config panel
  useEffect(() => {
    if (selectedNodeId) {
      setRightPanel("config");
    }
  }, [selectedNodeId]);

  // Create flow on first visit
  useEffect(() => {
    if (id === "nuova" && !createFlowMutation.isPending && !createFlowMutation.data) {
      createFlowMutation.mutate("Nuova Automazione", {
        onSuccess: (data) => {
          navigate(`/azienda/marketing/automazioni/${data.id}`, { replace: true });
        },
      });
    }
  }, [id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.isContentEditable || (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
        if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
        if (e.key === "s") { e.preventDefault(); saveAll(); }
      }
      if (e.key === "Delete" && selectedNodeId) { removeNode(selectedNodeId); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, saveAll, selectedNodeId, removeNode]);

  const openTriggerPicker = useCallback(() => {
    setSelectedNodeId(null);
    setRightPanel("trigger");
  }, [setSelectedNodeId]);

  const openActionPicker = useCallback((nodeId?: string) => {
    setSelectedNodeId(null);
    setAddAfterNodeId(nodeId || null);
    setRightPanel("action");
  }, [setSelectedNodeId]);

  const closeRightPanel = useCallback(() => {
    setRightPanel("none");
    setSelectedNodeId(null);
    setAddAfterNodeId(null);
  }, [setSelectedNodeId]);

  const handleTriggerSelect = useCallback((item: PickerItem) => {
    const newNode: AutomationNode = {
      id: crypto.randomUUID(),
      flow_id: flowId || "",
      company_id: "",
      node_type: "trigger",
      position_x: 300,
      position_y: 100,
      config_json: { trigger_category: item.category, trigger_event: item.id },
      label: item.label,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    addNode(newNode);
    setRightPanel("none");
  }, [flowId, addNode]);

  const handleActionSelect = useCallback((item: PickerItem) => {
    const nodeType = item.id === "delay" ? "delay" as const
      : item.id === "if_else" ? "condition" as const
      : item.id === "split_percentage" ? "split" as const
      : item.id === "goal" ? "goal" as const
      : "action" as const;

    const parentNode = addAfterNodeId ? nodes.find(n => n.id === addAfterNodeId) : null;
    const posX = parentNode ? parentNode.position_x : 300;
    const posY = parentNode ? parentNode.position_y + 120 : nodes.length * 120 + 100;

    const configByType: Record<string, Record<string, any>> = {
      delay: { delay_value: 1, delay_unit: "days" },
      condition: { condition_filters: { logic: "AND", conditions: [] } },
      split: { split_a: 50, split_b: 50 },
      goal: { goal_condition: "" },
    };

    const newNode: AutomationNode = {
      id: crypto.randomUUID(),
      flow_id: flowId || "",
      company_id: "",
      node_type: nodeType,
      position_x: posX,
      position_y: posY,
      config_json: configByType[nodeType] || { action_type: item.id },
      label: item.label,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    addNode(newNode);

    if (addAfterNodeId) {
      addConnection({
        id: crypto.randomUUID(),
        flow_id: flowId || "",
        company_id: "",
        from_node_id: addAfterNodeId,
        to_node_id: newNode.id,
        label: null,
        created_at: new Date().toISOString(),
      });
    }
    setAddAfterNodeId(null);
    setRightPanel("none");
  }, [flowId, addAfterNodeId, nodes, addNode, addConnection]);

  const handleDuplicate = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newNode: AutomationNode = {
      ...node,
      id: crypto.randomUUID(),
      position_x: node.position_x + 40,
      position_y: node.position_y + 40,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    addNode(newNode);
  }, [nodes, addNode]);

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    if (id) setRightPanel("config");
  }, [setSelectedNodeId]);

  const handleFlowNameBlur = useCallback(() => {
    setIsEditingName(false);
    if (flowName && flowName !== flow?.name) {
      updateFlowMutation.mutate({ name: flowName });
    }
  }, [flowName, flow, updateFlowMutation]);

  const isPublished = flow?.status === "published";

  if (isLoading || (id === "nuova" && createFlowMutation.isPending)) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { key: BuilderTab; label: string }[] = [
    { key: "builder", label: "Builder" },
    { key: "settings", label: "Impostazioni" },
    { key: "enrollments", label: "Cronologia delle iscrizioni" },
    { key: "logs", label: "Registro di esecuzione" },
  ];

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Row 1: back link + name center + actions right */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <button
          onClick={() => navigate("/azienda/marketing/automazioni")}
          className="text-sm text-primary hover:underline whitespace-nowrap"
        >
          ← Indietro a Flussi di lavoro
        </button>

        <div className="flex-1 flex items-center justify-center gap-1.5">
          {isEditingName ? (
            <Input
              value={flowName}
              onChange={e => setFlowName(e.target.value)}
              onBlur={handleFlowNameBlur}
              onKeyDown={e => { if (e.key === "Enter") handleFlowNameBlur(); }}
              autoFocus
              className="max-w-xs font-semibold border-none shadow-none focus-visible:ring-1 h-8 text-center"
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
            >
              {flowName || "Senza nome"}
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-xs text-muted-foreground">Modifiche non salvate</span>
          )}
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveAll} disabled={isSaving}>
            <Save className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={async () => {
              try {
                await updateFlowMutation.mutateAsync({ status: "archived" });
                toast({ title: "Automazione archiviata con successo" });
                navigate("/azienda/marketing/automazioni");
              } catch (err: any) {
                toast({ title: "Errore durante l'archiviazione", description: err.message, variant: "destructive" });
              }
            }}
          >
            <Archive className="h-4 w-4 mr-1" /> Archivia
          </Button>
        </div>
      </div>

      {/* Row 2: tabs + toggle publish + test */}
      <div className="flex items-center px-4 border-b bg-background shrink-0">
        <nav className="flex items-center gap-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <button className="text-sm text-primary hover:underline flex items-center gap-1">
            <PlayCircle className="h-4 w-4" />
            Test flusso
          </button>
          <div className="flex items-center gap-2">
            <Label htmlFor="publish-toggle" className="text-sm text-muted-foreground">
              {isPublished ? "Pubblicata" : "Bozza"}
            </Label>
            <Switch
              id="publish-toggle"
              checked={isPublished}
              onCheckedChange={togglePublish}
            />
          </div>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "builder" && (
        <div className="flex flex-1 overflow-hidden">
          <AutomationCanvas
            nodes={nodes}
            connections={connections}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            onDeleteNode={removeNode}
            onDuplicateNode={handleDuplicate}
            onAddAfterNode={openActionPicker}
            onUpdateNode={updateNode}
            onOpenTriggerPicker={openTriggerPicker}
            onOpenActionPicker={() => openActionPicker()}
          />

          {rightPanel === "config" && selectedNode && (
            <AutomationNodeConfig
              node={selectedNode}
              onUpdate={updateNode}
              onClose={closeRightPanel}
              allNodes={nodes}
            />
          )}

          <TriggerPickerDialog
            open={rightPanel === "trigger"}
            onClose={closeRightPanel}
            onSelect={handleTriggerSelect}
          />

          <ActionPickerDialog
            open={rightPanel === "action"}
            onClose={closeRightPanel}
            onSelect={handleActionSelect}
          />
        </div>
      )}

      {activeTab === "settings" && <AutomationSettingsTab />}
      {activeTab === "enrollments" && <AutomationEnrollmentsTab />}
      {activeTab === "logs" && <AutomationLogsTab />}
    </div>
  );
}
