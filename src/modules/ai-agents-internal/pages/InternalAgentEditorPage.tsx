import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInternalAgent, useUpdateInternalAgent } from "../hooks/useInternalAgents";
import { InternalAgentTab } from "../components/InternalAgentTab";
import { InternalToolsTab } from "../components/InternalToolsTab";
import { AgentKBTab } from "@/modules/ai-agents/components/AgentKBTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ChevronRight, Shield, Settings2, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { InternalAgentUpdate } from "../types/internalAgent.types";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Attivo", variant: "default" },
  draft: { label: "Bozza", variant: "secondary" },
  archived: { label: "Archiviato", variant: "outline" },
};

export default function InternalAgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useInternalAgent(id);
  const updateAgent = useUpdateInternalAgent(id);

  const handlePublish = () => {
    if (!id) return;
    updateAgent.mutate({ status: "active" }, {
      onSuccess: () => toast.success("Agente pubblicato"),
    });
  };

  const handleDraft = () => {
    if (!id) return;
    updateAgent.mutate({ status: "draft" }, {
      onSuccess: () => toast.success("Agente impostato come bozza"),
    });
  };

  const handleUpdate = (update: InternalAgentUpdate) => {
    updateAgent.mutate(update);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Agente non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/agente-interno")}>
          Torna alla lista
        </Button>
      </div>
    );
  }

  const config = statusConfig[agent.status] ?? statusConfig.draft;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/agente-interno")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <button
              onClick={() => navigate("/azienda/agente-interno")}
              className="hover:text-foreground transition-colors"
            >
              Agenti Interni
            </button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">{agent.name}</span>
          </div>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {agent.status === "active" ? (
            <Button variant="outline" size="sm" onClick={handleDraft}>Bozza</Button>
          ) : (
            <Button size="sm" onClick={handlePublish}>Pubblica</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agent" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
          <TabsTrigger value="agent">Agente</TabsTrigger>
          <TabsTrigger value="tools">Strumenti CRM</TabsTrigger>
          <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
          <TabsTrigger value="phone">Telefono</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="security">Sicurezza</TabsTrigger>
          <TabsTrigger value="advanced">Avanzato</TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className="mt-4">
          <InternalAgentTab
            agent={agent}
            onSave={(update) => updateAgent.mutate(update)}
            isSaving={updateAgent.isPending}
          />
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <InternalToolsTab agent={agent} onSave={handleUpdate} />
        </TabsContent>

        <TabsContent value="kb" className="mt-4">
          <AgentKBTab agentId={agent.id} companyId={agent.company_id} />
        </TabsContent>

        <TabsContent value="phone" className="mt-4">
          <PhoneTab agent={agent} onSave={handleUpdate} />
        </TabsContent>

        <TabsContent value="test" className="mt-4">
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-medium">Test — In sviluppo</p>
            <p className="text-sm">La simulazione di chiamata con tool CRM sarà disponibile a breve.</p>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-medium">Analytics — In sviluppo</p>
            <p className="text-sm">Statistiche chiamate, durata media e tool usati saranno disponibili a breve.</p>
          </div>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <SecurityTabInternal agent={agent} onSave={handleUpdate} />
        </TabsContent>

        <TabsContent value="advanced" className="mt-4">
          <AdvancedTabInternal agent={agent} onSave={handleUpdate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =================== Phone Tab ===================

function PhoneTab({ agent, onSave }: { agent: any; onSave: (u: InternalAgentUpdate) => void }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Numero di Telefono</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Il numero di telefono per questo agente viene configurato dalla sezione
            "Numeri di Telefono" del modulo AI Marketing. Seleziona il routing mode "Interno"
            o "Smart" per instradare le chiamate a questo agente.
          </p>
          {agent.phone_number_id && (
            <Badge variant="outline" className="mt-2">Numero collegato</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =================== Security Tab ===================

function SecurityTabInternal({ agent, onSave }: { agent: any; onSave: (u: InternalAgentUpdate) => void }) {
  const handleSave = () => {
    toast.success("Configurazione sicurezza salvata");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Sicurezza Chiamate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Le impostazioni di sicurezza per gli agenti interni includono rate limiting per numero chiamante,
            blacklist numeri e orari operativi. Queste funzionalità saranno disponibili con il webhook di post-call processing.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salva configurazione</Button>
      </div>
    </div>
  );
}

// =================== Advanced Tab ===================

function AdvancedTabInternal({ agent, onSave }: { agent: any; onSave: (u: InternalAgentUpdate) => void }) {
  const [maxDuration, setMaxDuration] = useState(String(agent.max_duration ?? 900));
  const [silenceTimeout, setSilenceTimeout] = useState(String(agent.silence_timeout ?? 30));
  const [errorMessage, setErrorMessage] = useState(agent.error_message ?? "Mi dispiace, si è verificato un problema.");

  const handleSave = () => {
    onSave({
      max_duration: parseInt(maxDuration) || 900,
      silence_timeout: parseInt(silenceTimeout) || 30,
      error_message: errorMessage,
    });
    toast.success("Configurazione avanzata salvata");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Timeout e Durata
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Durata massima (secondi)</Label>
              <Input
                type="number"
                min="60"
                max="3600"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">15 min = 900 secondi</p>
            </div>
            <div className="space-y-2">
              <Label>Timeout silenzio (secondi)</Label>
              <Input
                type="number"
                min="5"
                max="120"
                value={silenceTimeout}
                onChange={(e) => setSilenceTimeout(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Gestione Errori
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Messaggio di errore</Label>
            <Textarea
              value={errorMessage}
              onChange={(e) => setErrorMessage(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salva configurazione</Button>
      </div>
    </div>
  );
}
