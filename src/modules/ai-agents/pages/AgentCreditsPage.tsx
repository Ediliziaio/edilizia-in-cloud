import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CreditCard, TrendingUp, Clock, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditUsageBar } from "../components/CreditUsageBar";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Credits {
  id: string;
  total_minutes_purchased: number;
  minutes_used: number;
  cost_per_minute_platform: number;
  cost_per_minute_billed: number;
}

interface ConversationUsage {
  agent_id: string;
  agent_name: string;
  total_duration: number;
  total_conversations: number;
  month: string;
}

export default function AgentCreditsPage() {
  const { data: credits, isLoading } = useQuery({
    queryKey: ["ai-agent-credits"],
    queryFn: async (): Promise<Credits | null> => {
      const { data, error } = await supabase
        .from("ai_agent_credits" as never)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Credits | null;
    },
  });

  // Usage per agent from conversations
  const { data: usageByAgent } = useQuery({
    queryKey: ["ai-agent-usage-by-agent"],
    queryFn: async (): Promise<ConversationUsage[]> => {
      const { data: conversations, error } = await supabase
        .from("ai_agent_conversations" as never)
        .select("agent_id, duration_seconds")
        .order("started_at", { ascending: false });
      if (error) throw error;

      const { data: agents } = await supabase
        .from("ai_agents" as never)
        .select("id, name");

      const agentMap = new Map((agents as { id: string; name: string }[] ?? []).map((a) => [a.id, a.name]));
      const grouped = new Map<string, { total_duration: number; total_conversations: number }>();

      for (const conv of (conversations as { agent_id: string; duration_seconds: number }[] ?? [])) {
        const existing = grouped.get(conv.agent_id) || { total_duration: 0, total_conversations: 0 };
        existing.total_duration += conv.duration_seconds;
        existing.total_conversations += 1;
        grouped.set(conv.agent_id, existing);
      }

      return Array.from(grouped.entries()).map(([agentId, data]) => ({
        agent_id: agentId,
        agent_name: agentMap.get(agentId) || "Sconosciuto",
        total_duration: data.total_duration,
        total_conversations: data.total_conversations,
        month: format(new Date(), "MMMM yyyy", { locale: it }),
      }));
    },
  });

  const total = credits?.total_minutes_purchased ?? 0;
  const used = credits?.minutes_used ?? 0;
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const costPlatform = credits?.cost_per_minute_platform ?? 0;
  const costBilled = credits?.cost_per_minute_billed ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Crediti & Utilizzo</h1>
        <Button disabled>
          <CreditCard className="h-4 w-4 mr-2" /> Acquista minuti
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Minuti acquistati</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Minuti utilizzati</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{used}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Minuti rimanenti</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{remaining}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" /> Costo/minuto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">€{costBilled.toFixed(3)}</p>
            <p className="text-xs text-muted-foreground">Costo piattaforma: €{costPlatform.toFixed(3)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Utilizzo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={pct} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {used} / {total} minuti utilizzati ({pct}%)
          </p>
        </CardContent>
      </Card>

      {/* Usage by agent */}
      {usageByAgent && usageByAgent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Utilizzo per agente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead>Conversazioni</TableHead>
                    <TableHead>Durata totale</TableHead>
                    <TableHead>Minuti</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageByAgent.map((usage) => (
                    <TableRow key={usage.agent_id}>
                      <TableCell className="font-medium">{usage.agent_name}</TableCell>
                      <TableCell>{usage.total_conversations}</TableCell>
                      <TableCell>{Math.floor(usage.total_duration / 60)}m {usage.total_duration % 60}s</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{(usage.total_duration / 60).toFixed(1)} min</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!credits && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nessun pacchetto crediti attivo. Contatta l'amministratore per acquistare minuti.
        </p>
      )}
    </div>
  );
}
