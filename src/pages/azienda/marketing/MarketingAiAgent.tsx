import { Bot, Wallet, BookOpen, ArrowRight, AlertTriangle, MessageSquare, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useAgents } from "@/modules/ai-agents/hooks/useAgents";
import { useAgentCredits } from "@/modules/ai-agents/hooks/useAgentCredits";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";

interface RecentConversation {
  id: string;
  agent_id: string;
  duration_seconds: number;
  status: string;
  started_at: string;
}

export default function MarketingAiAgent() {
  const navigate = useNavigate();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: credits, isLoading: creditsLoading } = useAgentCredits();

  const { data: recentConvs, isLoading: convsLoading } = useQuery({
    queryKey: ["ai-recent-conversations-marketing"],
    queryFn: async (): Promise<RecentConversation[]> => {
      const { data, error } = await supabase
        .from("ai_agent_conversations" as never)
        .select("id, agent_id, duration_seconds, status, started_at")
        .order("started_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as RecentConversation[];
    },
  });

  const activeAgents = agents?.filter(a => a.status === "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;
  const balance = credits?.balance_eur ?? 0;
  const blocked = credits?.calls_blocked ?? false;

  const isLoading = agentsLoading || creditsLoading;

  const agentNameMap = new Map(
    (agents ?? []).map(a => [a.id, a.name])
  );

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agente AI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci i tuoi agenti vocali AI per qualificare lead e fissare appuntamenti.
          </p>
        </div>
        <Button onClick={() => navigate("/azienda/marketing/agente-ai")} className="gap-2">
          Gestisci tutti gli agenti <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Blocked banner */}
      {blocked && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive">Chiamate bloccate — Saldo esaurito</p>
              <p className="text-xs text-destructive/80">Ricarica i crediti per riattivare gli agenti.</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => navigate("/azienda/marketing/agente-ai/crediti")}>
              Ricarica
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/azienda/marketing/agente-ai")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bot className="h-4 w-4" /> Agenti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold">{totalAgents}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeAgents} attivi · {totalAgents - activeAgents} bozze/archiviati
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/azienda/marketing/agente-ai/crediti")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Saldo Crediti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-extrabold ${balance <= 0 ? "text-destructive" : balance <= 5 ? "text-amber-500" : "text-primary"}`}>
              {formatEur(balance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Speso: {formatEur(credits?.total_spent_eur ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/azienda/marketing/agente-ai/knowledge-base")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Knowledge Base
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">Documenti globali</p>
            <p className="text-xs text-muted-foreground mt-1">
              Gestisci i documenti condivisi tra tutti gli agenti
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Agent list */}
      {agents && agents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">I tuoi agenti</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {agents.map(agent => (
              <Card key={agent.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.llm_model} · {agent.language.toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                      {agent.status === "active" ? "Attivo" : agent.status === "archived" ? "Archiviato" : "Bozza"}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/azienda/marketing/agente-ai/${agent.id}`)}>
                      Configura
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent conversations */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Conversazioni recenti
        </h2>
        {convsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : !recentConvs || recentConvs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              Nessuna conversazione recente.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentConvs.map(conv => (
              <Card key={conv.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {agentNameMap.get(conv.agent_id) ?? "Agente sconosciuto"}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(conv.started_at), { addSuffix: true, locale: it })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{formatDuration(conv.duration_seconds)}</span>
                    <Badge variant={conv.status === "completed" ? "default" : "secondary"}>
                      {conv.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Azioni rapide</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Button variant="outline" className="justify-between h-auto py-3" onClick={() => navigate("/azienda/marketing/agente-ai")}>
            <span>Gestisci agenti</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="justify-between h-auto py-3" onClick={() => navigate("/azienda/marketing/agente-ai/crediti")}>
            <span>Crediti & Utilizzo</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="justify-between h-auto py-3" onClick={() => navigate("/azienda/marketing/agente-ai/impostazioni")}>
            <span>Impostazioni piattaforma</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="justify-between h-auto py-3" onClick={() => navigate("/azienda/marketing/agente-ai/numeri-telefono")}>
            <span>Numeri di telefono</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
