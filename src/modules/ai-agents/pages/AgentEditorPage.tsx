import { useParams, useNavigate } from "react-router-dom";
import { useAgent, useUpdateAgent } from "../hooks/useAgents";
import { AgentTab } from "../components/AgentTab";
import { AgentKBTab } from "../components/AgentKBTab";
import { AgentWidgetTab } from "../components/AgentWidgetTab";
import { AgentAnalyticsTab } from "../components/AgentAnalyticsTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Bot, Construction, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Attivo", variant: "default" },
  draft: { label: "Bozza", variant: "secondary" },
  archived: { label: "Archiviato", variant: "outline" },
};

function ComingSoonTab({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
      <Construction className="h-10 w-10 text-muted-foreground/40" />
      <p className="text-muted-foreground">
        La sezione <span className="font-medium">{title}</span> è in fase di sviluppo.
      </p>
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
          <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
          <TabsTrigger value="analytics">Analisi</TabsTrigger>
          <TabsTrigger value="tools">Strumenti</TabsTrigger>
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

        <TabsContent value="workflow"><ComingSoonTab title="Workflow" /></TabsContent>
        <TabsContent value="kb"><ComingSoonTab title="Knowledge Base" /></TabsContent>
        <TabsContent value="analytics"><ComingSoonTab title="Analisi" /></TabsContent>
        <TabsContent value="tools"><ComingSoonTab title="Strumenti" /></TabsContent>
        <TabsContent value="widget"><ComingSoonTab title="Widget" /></TabsContent>
        <TabsContent value="security"><ComingSoonTab title="Sicurezza" /></TabsContent>
        <TabsContent value="advanced"><ComingSoonTab title="Avanzato" /></TabsContent>
      </Tabs>
    </div>
  );
}
