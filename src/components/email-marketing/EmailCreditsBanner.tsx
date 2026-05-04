/**
 * EmailCreditsBanner — Banner compatto sopra Email Marketing.
 *
 * Mostra solo quello che serve in contesto operativo:
 *   • saldo corrente + quota residua su una riga (compatto)
 *   • alert visibile SOLO se saldo basso, invii bloccati o quota oltre
 *   • link "Gestisci crediti" → /azienda/impostazioni/crediti
 *
 * Sostituisce EmailCreditsWidget + EmailQuotaWidget che occupavano spazio
 * verticale enorme sulla home Email Marketing. I dati di dettaglio (totale
 * speso, totale ricaricato, history movimenti) sono nella pagina dedicata
 * Impostazioni → Crediti & Saldo.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { Wallet, AlertTriangle, TrendingDown, ArrowRight, Mail } from "lucide-react";

const LOW_BALANCE_THRESHOLD = 5; // EUR

type EmailQuota = {
  plan_name: string | null;
  effective_limit: number;
  sent_this_month: number;
  remaining: number;
  over_quota: boolean;
  is_free: boolean;
};

export function EmailCreditsBanner() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: credits } = useQuery({
    queryKey: ["email-credits-banner", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("email_credits")
        .select("balance_eur, sends_blocked")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as { balance_eur: number; sends_blocked: boolean } | null;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const { data: quota } = useQuery<EmailQuota | null>({
    queryKey: ["company-email-quota-banner", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase.rpc(
        "get_company_email_quota" as never,
        { p_company_id: companyId } as never,
      );
      if (error) throw error;
      return data as EmailQuota;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  if (!companyId || (!credits && !quota)) return null;

  const balance = credits?.balance_eur ?? 0;
  const blocked = credits?.sends_blocked ?? false;
  const lowBalance = balance > 0 && balance < LOW_BALANCE_THRESHOLD;
  const unlimited = quota?.effective_limit === -1;
  const overQuota = quota?.over_quota ?? false;

  // Alert critico: invii bloccati per saldo zero
  if (blocked) {
    return (
      <Alert variant="destructive" className="rounded-2xl">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>
            <strong>Invii email bloccati</strong> — saldo crediti esaurito.
          </span>
          <Link
            to="/azienda/impostazioni/crediti"
            className="shrink-0 text-sm font-semibold underline underline-offset-2"
          >
            Ricarica ora <ArrowRight className="ml-1 inline h-3 w-3" />
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  // Banner compatto stato OK / warning saldo basso / oltre quota
  return (
    <Card
      className={
        lowBalance || overQuota
          ? "rounded-2xl border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"
          : "rounded-2xl"
      }
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-4 text-sm">
          {/* Saldo */}
          <div className="flex items-center gap-2">
            <Wallet className={`h-4 w-4 ${lowBalance ? "text-amber-600" : "text-muted-foreground"}`} />
            <span className="text-muted-foreground">Saldo:</span>
            <strong className={`tabular-nums ${lowBalance ? "text-amber-700" : ""}`}>
              {formatEur(balance)}
            </strong>
            {lowBalance && (
              <Badge variant="outline" className="border-amber-400 bg-amber-100 text-[10px] text-amber-800">
                <TrendingDown className="mr-0.5 h-2.5 w-2.5" /> basso
              </Badge>
            )}
          </div>

          {/* Quota mese */}
          {quota && (
            <div className="flex items-center gap-2 border-l pl-4">
              <Mail className={`h-4 w-4 ${overQuota ? "text-amber-600" : "text-muted-foreground"}`} />
              <span className="text-muted-foreground">Quota mese:</span>
              <strong className={`tabular-nums ${overQuota ? "text-amber-700" : ""}`}>
                {quota.sent_this_month.toLocaleString("it-IT")}
                {!unlimited && ` / ${quota.effective_limit.toLocaleString("it-IT")}`}
                {unlimited && " / ∞"}
              </strong>
              {overQuota && (
                <Badge variant="outline" className="border-amber-400 bg-amber-100 text-[10px] text-amber-800">
                  oltre quota
                </Badge>
              )}
            </div>
          )}
        </div>

        <Link
          to="/azienda/impostazioni/crediti"
          className="text-xs font-medium text-primary hover:underline"
        >
          Gestisci crediti & ricariche <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
