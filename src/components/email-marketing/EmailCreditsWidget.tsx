import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { CreditUsageBar } from "@/modules/ai-agents/components/CreditUsageBar";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Wallet, TrendingUp, AlertTriangle } from "lucide-react";

export function EmailCreditsWidget() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: credits, isLoading } = useQuery({
    queryKey: ["email-credits", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("email_credits")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="h-16 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!credits) return null;

  const balance = credits.balance_eur ?? 0;
  const spent = credits.total_spent_eur ?? 0;
  const recharged = credits.total_recharged_eur ?? 0;
  const blocked = credits.sends_blocked ?? false;

  return (
    <div className="space-y-3">
      {blocked && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Invii bloccati: saldo insufficiente. Ricarica i crediti per continuare.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className="text-lg font-semibold">{formatEur(balance)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Speso</p>
                <p className="text-lg font-semibold">{formatEur(spent)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Ricaricato</p>
                <p className="text-lg font-semibold">{formatEur(recharged)}</p>
              </div>
            </div>
          </div>

          <CreditUsageBar
            spentEur={spent}
            rechargedEur={recharged}
            label="Utilizzo crediti email"
          />
        </CardContent>
      </Card>
    </div>
  );
}
