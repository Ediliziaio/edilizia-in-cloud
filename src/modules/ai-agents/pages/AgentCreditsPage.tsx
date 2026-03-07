import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CreditCard, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface Credits {
  id: string;
  total_minutes_purchased: number;
  minutes_used: number;
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

  const total = credits?.total_minutes_purchased ?? 0;
  const used = credits?.minutes_used ?? 0;
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      {!credits && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nessun pacchetto crediti attivo. Contatta l'amministratore per acquistare minuti.
        </p>
      )}
    </div>
  );
}
