import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, TrendingUp, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isMobileAppRuntime } from "@/lib/mobile/platform";
import { useIsMobile } from "@/hooks/use-mobile";

interface PlanLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  plan_name: string;
}

interface Props {
  resourceType?: "orders" | "users" | "storage_mb";
  className?: string;
}

export function PlanLimitWarning({ resourceType = "orders", className }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Dal telefono il piano non si cambia: il limite resta come informazione.
  const isMobile = useIsMobile();

  const companyId = (user as { company_id?: string } | null)?.company_id;

  const { data } = useQuery<PlanLimitResult | null>({
    queryKey: ["plan-limit", companyId, resourceType],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase.rpc("check_plan_limit" as never, {
        p_company_id: companyId,
        p_resource_type: resourceType,
        p_increment: 0,
      } as never);
      if (error) {
        console.error("Errore check_plan_limit:", error);
        return null;
      }
      return data as PlanLimitResult;
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  if (!data || data.limit === -1) return null;

  const pct = data.limit > 0 ? Math.min(100, Math.round((data.current / data.limit) * 100)) : 0;
  const isAtLimit = !data.allowed || pct >= 100;
  const isWarning = pct >= 80 && !isAtLimit;

  if (pct < 80) return null;

  const resourceLabel: Record<string, string> = {
    orders: "Ordini",
    users: "Utenti",
    storage_mb: "Storage",
  };
  const label = resourceLabel[resourceType] ?? resourceType;

  const getProgressColor = () => {
    if (isAtLimit) return "bg-destructive";
    if (pct >= 90) return "bg-orange-500";
    return "bg-yellow-500";
  };

  return (
    <Alert
      className={`border ${isAtLimit ? "border-destructive/50 bg-destructive/5" : "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20"} ${className ?? ""}`}
    >
      <div className="flex items-start gap-3 w-full">
        {isAtLimit ? (
          <Lock className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <AlertDescription>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${isAtLimit ? "text-destructive" : "text-yellow-700 dark:text-yellow-400"}`}>
                  {isAtLimit
                    ? `Limite ${label} raggiunto`
                    : `${label} al ${pct}% del limite`}
                </span>
                {isAtLimit && (
                  <Badge variant="destructive" className="text-[10px] h-4">BLOCCATO</Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {data.current}/{data.limit}
              </span>
            </div>
            <Progress
              value={pct}
              className={`h-1.5 mb-2 [&>div]:${getProgressColor()}`}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Piano: <span className="font-medium capitalize">{data.plan_name}</span>
              </span>
              {/* App Store 3.1.1: niente CTA upgrade/acquisto nell'app mobile.
                  Il warning resta informativo (uso/limite del piano). */}
              {!isMobileAppRuntime && !isMobile && (
                <Button
                  size="sm"
                  variant={isAtLimit ? "default" : "outline"}
                  className={`h-7 text-xs gap-1 ${isAtLimit ? "" : "border-yellow-500/50 text-yellow-700 hover:bg-yellow-100 dark:text-yellow-400 dark:hover:bg-yellow-950/40"}`}
                  onClick={() => navigate("/azienda/impostazioni/abbonamento")}
                >
                  <TrendingUp className="h-3 w-3" />
                  Aggiorna piano
                </Button>
              )}
            </div>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
