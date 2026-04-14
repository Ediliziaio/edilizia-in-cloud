import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ServerHealthScore } from "@/hooks/useHealthScores";

interface Props {
  companyId: string;
  healthScore: ServerHealthScore | null | undefined;
  className?: string;
}

interface HistoryRow {
  score: number;
  calculated_at: string;
}

function getScoreConfig(score: number | null | undefined) {
  if (score == null) return { color: "text-muted-foreground", bg: "bg-muted/50", stroke: "stroke-muted-foreground/30", label: "N/D" };
  if (score >= 80) return { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", stroke: "stroke-emerald-500", label: "Sano" };
  if (score >= 50) return { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", stroke: "stroke-amber-500", label: "A Rischio" };
  return { color: "text-destructive", bg: "bg-destructive/10", stroke: "stroke-destructive", label: "Critico" };
}

export function HealthScoreBadge({ companyId, healthScore, className }: Props) {
  // Fetch 30-day-old score for trend
  const { data: history } = useQuery<HistoryRow[]>({
    queryKey: ["health-score-history", companyId],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
      const { data } = await supabase
        .from("health_score_history" as never)
        .select("score, calculated_at")
        .eq("company_id", companyId)
        .lte("calculated_at", thirtyDaysAgo)
        .order("calculated_at", { ascending: false })
        .limit(1);
      return (data || []) as HistoryRow[];
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
  });

  const score = healthScore?.score ?? null;
  const cfg = getScoreConfig(score);
  const oldScore = history?.[0]?.score ?? null;
  const delta = score != null && oldScore != null ? score - oldScore : null;

  const TrendIcon = delta === null ? null : delta > 2 ? TrendingUp : delta < -2 ? TrendingDown : Minus;
  const trendColor = delta === null ? "" : delta > 2 ? "text-emerald-500" : delta < -2 ? "text-destructive" : "text-muted-foreground";

  const circumference = 2 * Math.PI * 24;
  const dashOffset = score != null ? circumference * (1 - score / 100) : circumference;

  const breakdown = healthScore
    ? [
        { label: "Login", value: healthScore.login_score, max: 30 },
        { label: "Ordini", value: healthScore.orders_score, max: 25 },
        { label: "Features", value: healthScore.features_score, max: 25 },
        { label: "Team", value: healthScore.team_score, max: 10 },
        { label: "Engagement", value: healthScore.engagement_score, max: 10 },
      ]
    : [];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-2 cursor-help", className)}>
            {/* Score ring */}
            <div className="relative h-12 w-12 shrink-0">
              <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
                <circle cx="24" cy="24" r="24" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                {score != null && (
                  <circle
                    cx="24" cy="24" r="24"
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className={cn("transition-all duration-500", cfg.stroke)}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {score != null ? (
                  <span className={cn("text-sm font-bold tabular-nums", cfg.color)}>{score}</span>
                ) : (
                  <Heart className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Status + trend */}
            <div className="min-w-0">
              <Badge
                variant="outline"
                className={cn("text-xs h-5 border-current", cfg.color, cfg.bg)}
              >
                {cfg.label}
              </Badge>
              {TrendIcon && (
                <div className={cn("flex items-center gap-0.5 text-xs mt-0.5", trendColor)}>
                  <TrendIcon className="h-3 w-3" />
                  {delta !== null && Math.abs(delta) > 2 && (
                    <span>{delta > 0 ? "+" : ""}{delta} vs 30gg fa</span>
                  )}
                  {delta !== null && Math.abs(delta) <= 2 && (
                    <span>Stabile</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="w-52 p-3">
          <p className="text-xs font-semibold mb-2">Health Score Breakdown</p>
          {breakdown.length > 0 ? (
            <div className="space-y-1.5">
              {breakdown.map((b) => (
                <div key={b.label} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-muted-foreground">{b.label}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${b.max > 0 ? Math.round((b.value / b.max) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground tabular-nums">{b.value}/{b.max}</span>
                </div>
              ))}
              {healthScore?.churn_risk != null && (
                <div className="border-t pt-1.5 mt-1.5">
                  <span className="text-xs text-muted-foreground">
                    Churn risk: <span className={healthScore.churn_risk > 60 ? "text-destructive font-semibold" : ""}>{healthScore.churn_risk}%</span>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Dati non disponibili</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
