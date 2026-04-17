/**
 * EmailQuotaWidget — shows the company's monthly email quota, usage, and
 * overage pricing based on the current plan + any super_admin override.
 *
 * Reads `get_company_email_quota(p_company_id)` so the UI always reflects
 * the same effective limits that `sendEmailUnified` enforces server-side.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Package, AlertTriangle, CheckCircle2 } from "lucide-react";

type EmailQuota = {
  plan_name: string | null;
  plan_limit: number | null;
  effective_limit: number;
  effective_price_eur: number;
  sent_this_month: number;
  remaining: number;
  over_quota: boolean;
  is_free: boolean;
};

const fmtInt = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("it-IT");
const fmtEur = (n: number | null | undefined) =>
  `€${Number(n ?? 0).toLocaleString("it-IT", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;

export function EmailQuotaWidget() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: q, isLoading } = useQuery<EmailQuota | null>({
    queryKey: ["company-email-quota", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase.rpc(
        "get_company_email_quota" as never,
        { p_company_id: companyId } as never
      );
      if (error) throw error;
      return data as EmailQuota;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  if (!companyId) return null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="h-12 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!q) return null;

  const unlimited = q.effective_limit === -1;
  const pct = unlimited
    ? 0
    : q.effective_limit > 0
    ? Math.min(100, (q.sent_this_month / q.effective_limit) * 100)
    : 0;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">Quota email mensile</span>
                {q.is_free && (
                  <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0">
                    Gratis
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Package className="h-3 w-3" />
                Piano {q.plan_name ?? "—"}
              </div>
            </div>
          </div>
          {q.over_quota ? (
            <Badge variant="destructive" className="gap-1 text-[11px]">
              <AlertTriangle className="h-3 w-3" />
              Oltre quota
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[11px] border-emerald-300 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Dentro quota
            </Badge>
          )}
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold">{fmtInt(q.sent_this_month)}</span>
          <span className="text-sm text-muted-foreground">
            / {unlimited ? "∞" : fmtInt(q.effective_limit)} email inviate questo mese
          </span>
        </div>

        {!unlimited && <Progress value={pct} />}

        <div className="text-xs text-muted-foreground">
          {unlimited ? (
            <>Piano con email transazionali illimitate.</>
          ) : q.over_quota ? (
            q.is_free ? (
              <>Quota esaurita ma il tuo piano copre le email in eccesso senza addebito.</>
            ) : (
              <>
                Quota esaurita. Ogni email ulteriore costa{" "}
                <strong>{fmtEur(q.effective_price_eur)}</strong> e viene scalata dal wallet.
              </>
            )
          ) : (
            <>
              Restano <strong>{fmtInt(q.remaining)}</strong> email incluse nel piano questo mese.
            </>
          )}
        </div>

        {q.over_quota && !q.is_free && (
          <Alert className="py-2 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
            <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
              Hai superato la quota inclusa. Le prossime email verranno addebitate.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
