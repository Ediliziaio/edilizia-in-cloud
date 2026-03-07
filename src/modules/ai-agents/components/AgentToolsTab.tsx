import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  PhoneOff, Globe, SkipForward, Users, Phone, Keyboard, Voicemail,
  Plus, Wrench, UserPlus, CalendarPlus, Search, Package,
} from "lucide-react";

interface SystemTool {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

export function AgentToolsTab() {
  const [systemTools, setSystemTools] = useState<SystemTool[]>([
    { id: "end_conversation", label: "Termina conversazione", description: "L'agente può terminare la chiamata", icon: PhoneOff, enabled: true },
    { id: "detect_language", label: "Rileva lingua", description: "Rileva automaticamente la lingua dell'utente", icon: Globe, enabled: true },
    { id: "skip_turn", label: "Salta turno", description: "L'agente può saltare il proprio turno", icon: SkipForward, enabled: false },
    { id: "transfer_agent", label: "Trasferisci all'agente", description: "Trasferisci a un altro agente AI", icon: Users, enabled: false },
    { id: "transfer_number", label: "Trasferisci al numero", description: "Trasferisci a un numero telefonico", icon: Phone, enabled: false },
    { id: "play_dtmf", label: "Riproduci tono tastierino", description: "Riproduci toni DTMF durante la chiamata", icon: Keyboard, enabled: false },
    { id: "voicemail_detection", label: "Rilevamento segreteria", description: "Rileva segreteria telefonica automaticamente", icon: Voicemail, enabled: false },
  ]);

  const ediliziaTools = [
    { id: "get_lead_info", label: "Ottieni info lead", description: "Recupera dati lead dal CRM", icon: UserPlus },
    { id: "create_appointment", label: "Crea appuntamento", description: "Crea evento nel calendario", icon: CalendarPlus },
    { id: "search_products", label: "Cerca prodotti", description: "Cerca nel catalogo prodotti", icon: Package },
    { id: "get_availability", label: "Controlla disponibilità", description: "Verifica slot disponibili nel calendario", icon: Search },
  ];

  const toggleTool = (id: string) => {
    setSystemTools((prev) =>
      prev.map((t) => t.id === id ? { ...t, enabled: !t.enabled } : t)
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      {/* Custom tools */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Strumenti personalizzati
          </h3>
          <Button size="sm" className="gap-1" disabled>
            <Plus className="h-4 w-4" /> Aggiungi strumento
          </Button>
        </div>

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
    </div>
  );
}
