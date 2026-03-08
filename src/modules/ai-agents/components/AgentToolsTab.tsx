import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  PhoneOff, Globe, SkipForward, Users, Phone, Keyboard, Voicemail,
  Plus, Wrench, UserPlus, CalendarPlus, Search, Package,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SystemTool {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

interface CustomTool {
  id: string;
  name: string;
  description: string;
}

const DEFAULT_SYSTEM_TOOLS: SystemTool[] = [
  { id: "end_conversation", label: "Termina conversazione", description: "L'agente può terminare la chiamata", icon: PhoneOff, enabled: true },
  { id: "detect_language", label: "Rileva lingua", description: "Rileva automaticamente la lingua dell'utente", icon: Globe, enabled: true },
  { id: "skip_turn", label: "Salta turno", description: "L'agente può saltare il proprio turno", icon: SkipForward, enabled: false },
  { id: "transfer_agent", label: "Trasferisci all'agente", description: "Trasferisci a un altro agente AI", icon: Users, enabled: false },
  { id: "transfer_number", label: "Trasferisci al numero", description: "Trasferisci a un numero telefonico", icon: Phone, enabled: false },
  { id: "play_dtmf", label: "Riproduci tono tastierino", description: "Riproduci toni DTMF durante la chiamata", icon: Keyboard, enabled: false },
  { id: "voicemail_detection", label: "Rilevamento segreteria", description: "Rileva segreteria telefonica automaticamente", icon: Voicemail, enabled: false },
];

interface AgentToolsTabProps {
  agentId: string;
}

export function AgentToolsTab({ agentId }: AgentToolsTabProps) {
  const [systemTools, setSystemTools] = useState<SystemTool[]>(DEFAULT_SYSTEM_TOOLS);
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Load tools_config from ai_agents
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("ai_agents" as never)
        .select("tools_config")
        .eq("id", agentId)
        .single();

      const config = (data as unknown as { tools_config: Record<string, unknown> } | null)?.tools_config;
      if (config) {
        const savedSystem = (config as Record<string, unknown>).system_tools as Record<string, boolean> | undefined;
        const savedCustom = (config as Record<string, unknown>).custom_tools as CustomTool[] | undefined;

        if (savedSystem) {
          setSystemTools(prev => prev.map(t => ({
            ...t,
            enabled: savedSystem[t.id] !== undefined ? savedSystem[t.id] : t.enabled,
          })));
        }
        if (savedCustom) {
          setCustomTools(savedCustom);
        }
      }
      setIsLoading(false);
    };
    load();
  }, [agentId]);

  const saveConfig = async (tools: SystemTool[], custom: CustomTool[]) => {
    const systemMap: Record<string, boolean> = {};
    tools.forEach(t => { systemMap[t.id] = t.enabled; });

    const { error } = await supabase
      .from("ai_agents" as never)
      .update({
        tools_config: { system_tools: systemMap, custom_tools: custom },
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, agentId as never);

    if (error) {
      toast.error("Errore nel salvataggio");
    }
  };

  const toggleTool = (id: string) => {
    const updated = systemTools.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t);
    setSystemTools(updated);
    saveConfig(updated, customTools);
  };

  const addCustomTool = () => {
    if (!newToolName.trim()) return;
    const tool: CustomTool = {
      id: `custom-${Date.now()}`,
      name: newToolName.trim(),
      description: newToolDesc.trim(),
    };
    const updated = [...customTools, tool];
    setCustomTools(updated);
    saveConfig(systemTools, updated);
    setShowAddDialog(false);
    setNewToolName("");
    setNewToolDesc("");
    toast.success("Strumento aggiunto");
  };

  const removeCustomTool = (id: string) => {
    const updated = customTools.filter(t => t.id !== id);
    setCustomTools(updated);
    saveConfig(systemTools, updated);
    toast.success("Strumento rimosso");
  };

  const ediliziaTools = [
    { id: "get_lead_info", label: "Ottieni info lead", description: "Recupera dati lead dal CRM", icon: UserPlus },
    { id: "create_appointment", label: "Crea appuntamento", description: "Crea evento nel calendario", icon: CalendarPlus },
    { id: "search_products", label: "Cerca prodotti", description: "Cerca nel catalogo prodotti", icon: Package },
    { id: "get_availability", label: "Controlla disponibilità", description: "Verifica slot disponibili nel calendario", icon: Search },
    { id: "assign_to_user", label: "Assegna a utente", description: "Assegna il contatto a un membro del team", icon: Users },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[150px]" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      {/* Custom tools */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Strumenti personalizzati
          </h3>
          <Button size="sm" className="gap-1" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" /> Aggiungi strumento
          </Button>
        </div>

        {/* Custom tools list */}
        {customTools.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Personalizzati</h4>
            {customTools.map((tool) => (
              <div key={tool.id} className="flex items-center gap-3 border rounded-lg p-3">
                <Wrench className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => removeCustomTool(tool.id)}>
                  Rimuovi
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">Strumenti EdiliziaInCloud</h4>
          {ediliziaTools.map((tool) => (
            <div key={tool.id} className="flex items-center gap-3 border rounded-lg p-3">
              <tool.icon className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{tool.label}</p>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">Nativo</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* System tools panel */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium">Strumenti di sistema</h3>
        <div className="space-y-3">
          {systemTools.map((tool) => (
            <div key={tool.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <tool.icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm">{tool.label}</p>
                  <p className="text-[10px] text-muted-foreground">{tool.description}</p>
                </div>
              </div>
              <Switch
                checked={tool.enabled}
                onCheckedChange={() => toggleTool(tool.id)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Add custom tool dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi strumento personalizzato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={newToolName} onChange={(e) => setNewToolName(e.target.value)} placeholder="Es. Verifica disponibilità magazzino" />
            </div>
            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Textarea value={newToolDesc} onChange={(e) => setNewToolDesc(e.target.value)} placeholder="Cosa fa questo strumento..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Annulla</Button>
            <Button onClick={addCustomTool} disabled={!newToolName.trim()}>Aggiungi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
