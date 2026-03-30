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
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  PhoneOff, Globe, SkipForward, Users, Phone, Keyboard, Voicemail,
  Plus, Wrench, UserPlus, CalendarPlus, Search, Package,
  ChevronDown, Link,
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

interface EdiliziaTool {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultPath: string;
}

interface EdiToolConfig {
  enabled: boolean;
  webhook_url: string;
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

const EDILIZIA_TOOLS: EdiliziaTool[] = [
  { id: "get_lead_info", label: "Ottieni info lead", description: "Recupera dati lead dal CRM", icon: UserPlus, defaultPath: "/functions/v1/elevenlabs-webhook?tool=get_lead_info" },
  { id: "create_appointment", label: "Crea appuntamento", description: "Crea evento nel calendario", icon: CalendarPlus, defaultPath: "/functions/v1/elevenlabs-webhook?tool=create_appointment" },
  { id: "search_products", label: "Cerca prodotti", description: "Cerca nel catalogo prodotti", icon: Package, defaultPath: "/functions/v1/elevenlabs-webhook?tool=search_products" },
  { id: "get_availability", label: "Controlla disponibilità", description: "Verifica slot disponibili nel calendario", icon: Search, defaultPath: "/functions/v1/elevenlabs-webhook?tool=get_availability" },
  { id: "assign_to_user", label: "Assegna a utente", description: "Assegna il contatto a un membro del team", icon: Users, defaultPath: "/functions/v1/elevenlabs-webhook?tool=assign_to_user" },
];

interface AgentToolsTabProps {
  agentId: string;
}

export function AgentToolsTab({ agentId }: AgentToolsTabProps) {
  const [systemTools, setSystemTools] = useState<SystemTool[]>(DEFAULT_SYSTEM_TOOLS);
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [ediToolConfigs, setEdiToolConfigs] = useState<Record<string, EdiToolConfig>>({});
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string ?? "";

  const defaultWebhookUrl = (path: string) => `${supabaseUrl}${path}`;

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
        const savedEdilizia = (config as Record<string, unknown>).edilizia_tools as Record<string, EdiToolConfig> | undefined;

        if (savedSystem) {
          setSystemTools(prev => prev.map(t => ({
            ...t,
            enabled: savedSystem[t.id] !== undefined ? savedSystem[t.id] : t.enabled,
          })));
        }
        if (savedCustom) setCustomTools(savedCustom);
        if (savedEdilizia) setEdiToolConfigs(savedEdilizia);
      }
      setIsLoading(false);
    };
    load();
  }, [agentId]);

  const saveConfig = async (
    tools: SystemTool[],
    custom: CustomTool[],
    ediConfigs: Record<string, EdiToolConfig>
  ) => {
    const systemMap: Record<string, boolean> = {};
    tools.forEach(t => { systemMap[t.id] = t.enabled; });

    const { error } = await supabase
      .from("ai_agents" as never)
      .update({
        tools_config: { system_tools: systemMap, custom_tools: custom, edilizia_tools: ediConfigs },
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, agentId as never);

    if (error) toast.error("Errore nel salvataggio");
  };

  const toggleTool = (id: string) => {
    const updated = systemTools.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t);
    setSystemTools(updated);
    saveConfig(updated, customTools, ediToolConfigs);
  };

  const toggleEdiTool = (tool: EdiliziaTool) => {
    const current = ediToolConfigs[tool.id];
    const updated: Record<string, EdiToolConfig> = {
      ...ediToolConfigs,
      [tool.id]: {
        enabled: !current?.enabled,
        webhook_url: current?.webhook_url || defaultWebhookUrl(tool.defaultPath),
      },
    };
    setEdiToolConfigs(updated);
    saveConfig(systemTools, customTools, updated);
  };

  const updateEdiWebhook = (toolId: string, url: string) => {
    const updated: Record<string, EdiToolConfig> = {
      ...ediToolConfigs,
      [toolId]: { ...ediToolConfigs[toolId], webhook_url: url },
    };
    setEdiToolConfigs(updated);
  };

  const saveEdiWebhook = (toolId: string) => {
    saveConfig(systemTools, customTools, ediToolConfigs);
    toast.success("URL webhook salvato");
    setExpandedTool(null);
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
    saveConfig(systemTools, updated, ediToolConfigs);
    setShowAddDialog(false);
    setNewToolName("");
    setNewToolDesc("");
    toast.success("Strumento aggiunto");
  };

  const removeCustomTool = (id: string) => {
    const updated = customTools.filter(t => t.id !== id);
    setCustomTools(updated);
    saveConfig(systemTools, updated, ediToolConfigs);
    toast.success("Strumento rimosso");
  };

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
      {/* Custom + EdiliziaInCloud tools */}
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

        {/* EdiliziaInCloud tools with webhook config */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">Strumenti EdiliziaInCloud</h4>
          {EDILIZIA_TOOLS.map((tool) => {
            const cfg = ediToolConfigs[tool.id];
            const isEnabled = cfg?.enabled ?? false;
            const isExpanded = expandedTool === tool.id;
            return (
              <Collapsible
                key={tool.id}
                open={isExpanded}
                onOpenChange={(open) => setExpandedTool(open ? tool.id : null)}
              >
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <tool.icon className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{tool.label}</p>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEnabled && (
                        <Badge variant="outline" className="text-[10px] text-green-600 border-green-600">
                          Attivo
                        </Badge>
                      )}
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleEdiTool(tool)}
                      />
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div className="border-t px-3 py-3 bg-muted/30 space-y-2">
                      <Label className="text-xs flex items-center gap-1">
                        <Link className="h-3 w-3" /> URL Webhook
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          className="text-xs h-8 font-mono"
                          value={cfg?.webhook_url || defaultWebhookUrl(tool.defaultPath)}
                          onChange={(e) => updateEdiWebhook(tool.id, e.target.value)}
                          placeholder={defaultWebhookUrl(tool.defaultPath)}
                        />
                        <Button
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={() => saveEdiWebhook(tool.id)}
                        >
                          Salva
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        L'agente chiamerà questo endpoint quando usa lo strumento.
                      </p>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </div>

      {/* System tools panel */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium">Strumenti di sistema</h3>
        <div className="space-y-3">
          {systemTools.map((tool) => (
            <div key={tool.id} className="space-y-2">
              <div className="flex items-center justify-between">
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
              {/* Transfer number config */}
              {tool.id === "transfer_number" && tool.enabled && (
                <div className="ml-6 flex gap-2">
                  <Input
                    className="h-8 text-xs"
                    placeholder="+39 02 1234567"
                    value={(ediToolConfigs["__transfer_number"] as unknown as EdiToolConfig | undefined)?.webhook_url ?? ""}
                    onChange={(e) => {
                      const updated = { ...ediToolConfigs, __transfer_number: { enabled: true, webhook_url: e.target.value } };
                      setEdiToolConfigs(updated);
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => {
                      saveConfig(systemTools, customTools, ediToolConfigs);
                      toast.success("Numero di trasferimento salvato");
                    }}
                  >
                    Salva
                  </Button>
                </div>
              )}
              {/* Voicemail message config */}
              {tool.id === "voicemail_detection" && tool.enabled && (
                <div className="ml-6 space-y-2">
                  <Label className="text-xs text-muted-foreground">Messaggio segreteria</Label>
                  <div className="flex gap-2">
                    <Textarea
                      className="text-xs min-h-[60px] resize-none"
                      placeholder="Salve, sono l'assistente di EdiliziaInCloud. La richiamo al più presto. Grazie."
                      value={(ediToolConfigs["__voicemail_message"] as unknown as EdiToolConfig | undefined)?.webhook_url ?? ""}
                      onChange={(e) => {
                        const updated = { ...ediToolConfigs, __voicemail_message: { enabled: true, webhook_url: e.target.value } };
                        setEdiToolConfigs(updated);
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8 shrink-0 self-end"
                      onClick={() => {
                        saveConfig(systemTools, customTools, ediToolConfigs);
                        toast.success("Messaggio segreteria salvato");
                      }}
                    >
                      Salva
                    </Button>
                  </div>
                </div>
              )}
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
