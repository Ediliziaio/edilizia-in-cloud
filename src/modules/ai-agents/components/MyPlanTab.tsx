import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, CreditCard, Clock, Wallet } from "lucide-react";
import { formatEur } from "../lib/creditCalculator";
import { useNavigate } from "react-router-dom";

export default function MyPlanTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["ai-subscription-plan", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_subscriptions" as never)
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as { status: string; trial_ends_at: string | null; price_eur: number | null; current_period_end: string | null } | null;
    },
  });

  const { data: credits, isLoading: creditsLoading } = useQuery({
    queryKey: ["ai-credits-myplan", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_credits" as never)
        .select("balance_eur, total_spent_eur, calls_blocked")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as { balance_eur: number; total_spent_eur: number; calls_blocked: boolean } | null;
    },
  });

  const { data: billedRate } = useQuery({
    queryKey: ["ai-billed-rate", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_credit_usage" as never)
        .select("cost_billed_per_min")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { cost_billed_per_min: number } | null)?.cost_billed_per_min ?? null;
    },
  });

  const isLoading = subLoading || creditsLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    active: "Attivo",
    trial: "Prova Gratuita",
    cancelled: "Cancellato",
    paused: "In Pausa",
  };

  const statusVariant = (s: string) => {
    if (s === "active") return "default" as const;
    if (s === "trial") return "secondary" as const;
    return "destructive" as const;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Il mio piano AI</h1>
        <p className="text-muted-foreground">Dettagli del piano, saldo crediti e costi</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Subscription Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Bot className="h-4 w-4" /> Piano
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {subscription ? (
              <>
                <Badge variant={statusVariant(subscription.status)}>
                  {statusLabel[subscription.status] || subscription.status}
                </Badge>
                {subscription.price_eur != null && (
                  <p className="text-2xl font-extrabold">{formatEur(subscription.price_eur)}<span className="text-sm font-normal text-muted-foreground">/mese</span></p>
                )}
                {subscription.status === "trial" && subscription.trial_ends_at && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Scade il {new Date(subscription.trial_ends_at).toLocaleDateString("it-IT")}
                  </p>
                )}
                {subscription.current_period_end && subscription.status === "active" && (
                  <p className="text-xs text-muted-foreground">
                    Prossimo rinnovo: {new Date(subscription.current_period_end).toLocaleDateString("it-IT")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun piano attivo</p>
            )}
          </CardContent>
        </Card>

        {/* Credits Card */}
        <Card className={credits?.calls_blocked ? "border-destructive" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4" /> Saldo Crediti
              {credits?.calls_blocked && <Badge variant="destructive" className="text-[10px]">Bloccato</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className={`text-3xl font-extrabold ${credits?.calls_blocked ? "text-destructive" : ""}`}>
              {formatEur(credits?.balance_eur ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Totale speso: {formatEur(credits?.total_spent_eur ?? 0)}
            </p>
            <Button
              size="sm"
              onClick={() => navigate("/azienda/impostazioni/crediti")}
              className="w-full"
            >
              <CreditCard className="h-4 w-4 mr-2" /> Ricarica crediti
            </Button>
          </CardContent>
        </Card>

        {/* Cost Per Minute Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" /> Costo per minuto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {billedRate != null ? (
              <>
                <p className="text-3xl font-extrabold">{formatEur(billedRate)}</p>
                <p className="text-xs text-muted-foreground">Per minuto di conversazione AI</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nessuna conversazione registrata</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
