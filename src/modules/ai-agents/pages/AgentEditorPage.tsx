import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAgent, useUpdateAgent } from "../hooks/useAgents";
import { AgentTab } from "../components/AgentTab";
import { AgentKBTab } from "../components/AgentKBTab";
import { AgentWidgetTab } from "../components/AgentWidgetTab";
import { AgentAnalyticsTab } from "../components/AgentAnalyticsTab";
import { AgentBranchTab } from "../components/AgentBranchTab";
import { AgentTestTab } from "../components/AgentTestTab";
import { AgentToolsTab } from "../components/AgentToolsTab";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ChevronRight, Shield, Settings2, Globe, Clock, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Attivo", variant: "default" },
  draft: { label: "Bozza", variant: "secondary" },
  archived: { label: "Archiviato", variant: "outline" },
};

function SecurityTab() {
  const [domainWhitelist, setDomainWhitelist] = useState("");
  const [requireAuth, setRequireAuth] = useState(false);
  const [rateLimitEnabled, setRateLimitEnabled] = useState(true);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState("10");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" /> Whitelist Domini
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={domainWhitelist}
            onChange={(e) => setDomainWhitelist(e.target.value)}
            placeholder={"esempio.it\nwww.miosito.com"}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Domini autorizzati per il widget embed. Uno per riga. Lascia vuoto per consentire tutti.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Autenticazione
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Richiedi autenticazione</Label>
              <p className="text-xs text-muted-foreground">Gli utenti devono essere autenticati per parlare con l'agente</p>
            </div>
            <Switch checked={requireAuth} onCheckedChange={setRequireAuth} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Rate Limiting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Abilita rate limiting</Label>
              <p className="text-xs text-muted-foreground">Limita il numero di conversazioni per utente</p>
            </div>
            <Switch checked={rateLimitEnabled} onCheckedChange={setRateLimitEnabled} />
          </div>
          {rateLimitEnabled && (
            <div className="space-y-2">
              <Label>Conversazioni max per minuto</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={rateLimitPerMinute}
                onChange={(e) => setRateLimitPerMinute(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => toast.info("Configurazione sicurezza salvata (demo)")}>
          Salva configurazione
        </Button>
      </div>
    </div>
  );
}

function AdvancedTab() {
  const [conversationTimeout, setConversationTimeout] = useState("300");
  const [maxDuration, setMaxDuration] = useState("1800");
  const [errorMessage, setErrorMessage] = useState("Mi scusi, si è verificato un errore. Riproviamo.");
  const [autoEndOnSilence, setAutoEndOnSilence] = useState(true);
  const [silenceTimeout, setSilenceTimeout] = useState("30");

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
              <Label>Timeout inattività (secondi)</Label>
              <Input
                type="number"
                min="30"
                max="600"
                value={conversationTimeout}
                onChange={(e) => setConversationTimeout(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Tempo massimo di inattività prima della chiusura</p>
            </div>
            <div className="space-y-2">
              <Label>Durata massima conversazione (secondi)</Label>
              <Input
                type="number"
                min="60"
                max="7200"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">30 min = 1800 secondi</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Silenzio automatico
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Termina su silenzio prolungato</Label>
              <p className="text-xs text-muted-foreground">Chiudi la conversazione se l'utente non parla</p>
            </div>
            <Switch checked={autoEndOnSilence} onCheckedChange={setAutoEndOnSilence} />
          </div>
          {autoEndOnSilence && (
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
          )}
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
            <p className="text-xs text-muted-foreground">Messaggio che l'agente pronuncia in caso di errore</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => toast.info("Configurazione avanzata salvata (demo)")}>
          Salva configurazione
        </Button>
      </div>
    </div>
  );
}

export default function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(id);
  const updateAgent = useUpdateAgent(id);

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
        <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/marketing/agente-ai")}>
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/marketing/agente-ai")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <button
              onClick={() => navigate("/azienda/marketing/agente-ai")}
              className="hover:text-foreground transition-colors"
            >
              Agenti
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
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="branch">Branch</TabsTrigger>
          <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
          <TabsTrigger value="analytics">Analisi</TabsTrigger>
          <TabsTrigger value="tools">Strumenti</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="widget">Widget</TabsTrigger>
          <TabsTrigger value="security">Sicurezza</TabsTrigger>
          <TabsTrigger value="advanced">Avanzato</TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className="mt-4">
          <AgentTab
            agent={agent}
            onSave={(update) => updateAgent.mutate(update)}
            isSaving={updateAgent.isPending}
          />
        </TabsContent>

        <TabsContent value="workflow" className="mt-4">
          <WorkflowCanvas />
        </TabsContent>
        <TabsContent value="branch" className="mt-4">
          <AgentBranchTab />
        </TabsContent>
        <TabsContent value="kb" className="mt-4">
          <AgentKBTab agentId={agent.id} companyId={agent.company_id} />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <AgentAnalyticsTab agentId={agent.id} />
        </TabsContent>
        <TabsContent value="tools" className="mt-4">
          <AgentToolsTab />
        </TabsContent>
        <TabsContent value="test" className="mt-4">
          <AgentTestTab />
        </TabsContent>
        <TabsContent value="widget" className="mt-4">
          <AgentWidgetTab agent={agent} />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="advanced" className="mt-4">
          <AdvancedTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
