/**
 * Torte di segmentazione per la Dashboard commerciale:
 *  - CrmTemperatureCard: distribuzione lead per temperatura (ai_score_tier).
 *  - CrmWinLossCard: motivi di perdita delle opportunità (lost_reason_category).
 *
 * Componenti indipendenti company-scoped (stesso pattern di OutreachAnalytics):
 * ognuno fa la propria query React Query con cap, e renderizza una donut
 * Recharts che usa la palette --chart-* dell'app. Empty-state onesto.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { DonutChart, type DonutChartSegment } from "@/components/ui/donut-chart";
import { cn } from "@/lib/utils";
import { Thermometer, CircleX, Loader2 } from "lucide-react";

interface Slice {
  label: string;
  value: number;
  color: string;
  hint?: string;
}

function DonutCard({
  title,
  icon: Icon,
  slices,
  isLoading,
  emptyText,
}: {
  title: string;
  icon: typeof Thermometer;
  slices: Slice[];
  isLoading: boolean;
  emptyText: string;
}) {
  const data = slices.filter((s) => s.value > 0);
  const [active, setActive] = useState<string | null>(null);
  const total = data.reduce((sum, s) => sum + s.value, 0);
  const activeSlice = data.find((s) => s.label === active) ?? null;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4" aria-hidden="true" /> {title}
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <DonutChart
              data={data as DonutChartSegment[]}
              size={168}
              strokeWidth={22}
              animationDuration={1}
              activeLabel={active}
              onSegmentHover={(s) => setActive(s?.label ?? null)}
              centerContent={
                <div className="text-center">
                  <div className="text-2xl font-bold leading-none text-foreground">{activeSlice ? activeSlice.value : total}</div>
                  <div className="mt-1 max-w-[110px] truncate text-[11px] font-medium text-muted-foreground">
                    {activeSlice ? activeSlice.label : "Totale"}
                  </div>
                  {activeSlice && <div className="text-[11px] text-muted-foreground">{pct(activeSlice.value)}%</div>}
                </div>
              }
            />
            <div className="flex w-full flex-col gap-0.5 text-xs">
              {slices.map((s, i) => (
                <motion.button
                  key={s.label}
                  type="button"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.05, duration: 0.3 }}
                  onMouseEnter={() => setActive(s.label)}
                  onMouseLeave={() => setActive(null)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors",
                    active === s.label && "bg-muted",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                    <span className="truncate">
                      {s.label}
                      {s.hint ? ` · ${s.hint}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-muted-foreground">{s.value}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const eurCompact = (n: number) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `€${v}`;
};

// ─── Temperatura ──────────────────────────────────────────────────────────
type Bucket = "hot" | "warm" | "cold" | "none";
const bucketTier = (t: string | null): Bucket => {
  const v = (t || "").toLowerCase();
  if (!v) return "none";
  if (/hot|cald|high|alto|^a$/.test(v)) return "hot";
  if (/cold|fred|low|basso|^c$/.test(v)) return "cold";
  return "warm";
};

export function CrmTemperatureCard({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "temperature", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("ai_score_tier,ai_predicted_value_eur")
        .eq("company_id", companyId)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as { ai_score_tier: string | null; ai_predicted_value_eur: number | null }[];
    },
  });

  const slices = useMemo<Slice[]>(() => {
    const agg: Record<Bucket, { count: number; value: number }> = {
      hot: { count: 0, value: 0 },
      warm: { count: 0, value: 0 },
      cold: { count: 0, value: 0 },
      none: { count: 0, value: 0 },
    };
    for (const r of q.data ?? []) {
      const b = bucketTier(r.ai_score_tier);
      agg[b].count += 1;
      agg[b].value += r.ai_predicted_value_eur ?? 0;
    }
    const mk = (b: Bucket, label: string, color: string): Slice => ({
      label,
      value: agg[b].count,
      color,
      hint: agg[b].value > 0 ? eurCompact(agg[b].value) : undefined,
    });
    return [
      mk("hot", "Caldi", "hsl(var(--chart-5))"),
      mk("warm", "Tiepidi", "hsl(var(--chart-3))"),
      mk("cold", "Freddi", "hsl(var(--chart-1))"),
      mk("none", "Non valutati", "hsl(var(--muted-foreground))"),
    ].filter((s) => s.value > 0);
  }, [q.data]);

  return (
    <DonutCard
      title="Temperatura lead"
      icon={Thermometer}
      slices={slices}
      isLoading={q.isLoading}
      emptyText="Nessun lead con punteggio AI ancora."
    />
  );
}

// ─── Win / Loss ───────────────────────────────────────────────────────────
const LOSS_COLORS = [
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--muted-foreground))",
];

export function CrmWinLossCard({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "winloss", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("status,lost_reason_category,loss_reason")
        .eq("company_id", companyId)
        .eq("status", "lost")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as { lost_reason_category: string | null; loss_reason: string | null }[];
    },
  });

  const slices = useMemo<Slice[]>(() => {
    const counts = new Map<string, number>();
    for (const r of q.data ?? []) {
      const key = (r.lost_reason_category || r.loss_reason || "Non specificato").trim() || "Non specificato";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({ label, value, color: LOSS_COLORS[i % LOSS_COLORS.length] }));
  }, [q.data]);

  return (
    <DonutCard
      title="Perché perdiamo"
      icon={CircleX}
      slices={slices}
      isLoading={q.isLoading}
      emptyText="Nessuna trattativa persa nel CRM."
    />
  );
}
