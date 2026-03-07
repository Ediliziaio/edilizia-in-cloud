import { Bot, Wallet, BookOpen, Settings, ArrowRight, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useAgents } from "@/modules/ai-agents/hooks/useAgents";
import { useAgentCredits } from "@/modules/ai-agents/hooks/useAgentCredits";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";

export default function MarketingAiAgent() {
  const navigate = useNavigate();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: credits, isLoading: creditsLoading } = useAgentCredits();

  const activeAgents = agents?.filter(a => a.status === "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;
  const balance = credits?.balance_eur ?? 0;
  const blocked = credits?.calls_blocked ?? false;

  const isLoading = agentsLoading || creditsLoading;

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
      <div>
        <h1 className="text-2xl font-bold">Agente AI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestisci i tuoi agenti vocali AI per qualificare lead e fissare appuntamenti.
        </p>
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
