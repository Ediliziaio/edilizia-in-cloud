/**
 * CrmSourcesDonutCard — donut animato e COLORATO dei lead per fonte.
 *
 * Usa il donut primitive (Framer Motion) con dati reali da marketing_contacts.source.
 * Layout curato: anello grande a sinistra (centro dinamico con totale/segmento + %),
 * legenda interattiva a destra (hover sincronizzato col grafico). Empty-state onesto.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { DonutChart, type DonutChartSegment } from "@/components/ui/donut-chart";
import { cn } from "@/lib/utils";
import { PieChart, Loader2 } from "lucide-react";

// Palette vivace (non solo --chart-*) per far "respirare" i colori.
const PALETTE = [
  "hsl(217 91% 60%)", // blu
  "hsl(160 84% 39%)", // emerald
  "hsl(43 96% 56%)", // ambra
  "hsl(330 81% 60%)", // rosa
  "hsl(262 83% 58%)", // viola
  "hsl(199 89% 48%)", // azzurro
  "hsl(25 95% 53%)", // arancio
];

const prettify = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

interface Seg extends DonutChartSegment {
  value: number;
  color: string;
  label: string;
}

export function CrmSourcesDonutCard({ companyId }: { companyId: string }) {
  const [active, setActive] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["crm-dash", "sources-donut", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("source,attr_source")
        .eq("company_id", companyId)
        .limit(5000);
      if (error) return [] as { source: string | null; attr_source: string | null }[];
      return (data ?? []) as { source: string | null; attr_source: string | null }[];
    },
  });

  const segments = useMemo<Seg[]>(() => {
    const counts = new Map<string, number>();
    for (const r of q.data ?? []) {
      const key = (r.source || r.attr_source || "Diretto").trim() || "Diretto";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([label, value], i) => ({ label: prettify(label), value, color: PALETTE[i % PALETTE.length] }));
  }, [q.data]);

  const total = segments.reduce((s, x) => s + x.value, 0);
  const activeSeg = segments.find((s) => s.label === active) ?? null;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <PieChart className="h-4 w-4" aria-hidden="true" /> Lead per fonte
          {total > 0 && <span className="ml-auto text-xs font-normal text-muted-foreground">{total} lead totali</span>}
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : segments.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nessun lead con fonte ancora.</p>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
            {/* Donut */}
            <div className="shrink-0" onMouseLeave={() => setActive(null)}>
              <DonutChart
                data={segments}
                size={196}
                strokeWidth={26}
                animationDuration={1.1}
                activeLabel={active}
                onSegmentHover={(s) => setActive(s?.label ?? null)}
                centerContent={
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeSeg?.label ?? "tot"}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.18 }}
                      className="flex flex-col items-center text-center"
                    >
                      <span className="text-3xl font-bold leading-none text-foreground">
                        {activeSeg ? activeSeg.value : total}
                      </span>
                      <span className="mt-1 max-w-[120px] truncate text-[11px] font-medium text-muted-foreground">
                        {activeSeg ? activeSeg.label : "Lead totali"}
                      </span>
                      {activeSeg && (
                        <span className="text-[11px] font-semibold" style={{ color: activeSeg.color }}>
                          {pct(activeSeg.value)}%
                        </span>
                      )}
                    </motion.div>
                  </AnimatePresence>
                }
              />
            </div>

            {/* Legenda interattiva */}
            <div className="flex w-full flex-col gap-1">
              {segments.map((s, i) => (
                <motion.button
                  key={s.label}
                  type="button"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.06, duration: 0.35 }}
                  onMouseEnter={() => setActive(s.label)}
                  onMouseLeave={() => setActive(null)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-all",
                    active === s.label ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full transition-transform"
                      style={{ background: s.color, transform: active === s.label ? "scale(1.25)" : "scale(1)" }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm font-medium">{s.label}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1.5">
                    <span className="text-sm font-semibold tabular-nums">{s.value}</span>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct(s.value)}%</span>
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
