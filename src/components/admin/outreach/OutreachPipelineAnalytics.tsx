import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Briefcase, TrendingUp, Euro, Timer, Target, Download } from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";

/**
 * Analytics pipeline — win rate, valore aperto, forecast pesato (value*probability),
 * valore vinto, velocità media (giorni a chiusura). Su marketing_opportunities
 * (esistente). Colma il gap analytics segnalato nell'audit pipeline.
 *
 * Linguaggio visivo allineato al cockpit (OutreachAnalytics): card con header a
 * chip, KPI a tile con label uppercase + icona colorata e numero grande tabellare,
 * stile Instantly/Smartlead. Solo presentazione, nessun cambio dati/query.
 */

interface Opp { status: string; value: number | null; probability: number | null; created_at: string; updated_at: string; }

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));

type Tone = "default" | "good" | "accent";

export function OutreachPipelineAnalytics({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["pipeline-analytics", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("status,value,probability,created_at,updated_at")
        .eq("company_id", companyId).is("deleted_at", null).limit(5000);
      if (error) throw error;
      return (data ?? []) as Opp[];
    },
  });

  const opps = q.data ?? [];
  const open = opps.filter((o) => o.status === "open");
  const won = opps.filter((o) => o.status === "won");
  const lost = opps.filter((o) => o.status === "lost" || o.status === "abandoned");
  const closedTotal = won.length + lost.length;

  const winRate = closedTotal > 0 ? Math.round((won.length / closedTotal) * 1000) / 10 : null;
  const openValue = open.reduce((s, o) => s + (o.value ?? 0), 0);
  const forecast = open.reduce((s, o) => s + (o.value ?? 0) * ((o.probability ?? 0) / 100), 0);
  const wonValue = won.reduce((s, o) => s + (o.value ?? 0), 0);
  const avgDays = won.length
    ? Math.round(won.reduce((s, o) => s + (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()) / 86400000, 0) / won.length)
    : null;

  const err = !!q.error;
  const loading = q.isLoading;
  const cards: { icon: typeof Trophy; label: string; value: string; hint: string; tone: Tone }[] = [
    { icon: Trophy, label: "Win rate", value: err ? "—" : winRate == null ? "—" : `${winRate}%`, hint: closedTotal > 0 ? `${won.length}/${closedTotal} chiuse vinte` : "ancora nessuna chiusa", tone: "good" },
    { icon: Briefcase, label: "Opp. aperte", value: err ? "—" : String(open.length), hint: "in pipeline", tone: "default" },
    { icon: Euro, label: "Valore pipeline", value: err ? "—" : eur(openValue), hint: "aperto, lordo", tone: "accent" },
    { icon: TrendingUp, label: "Forecast pesato", value: err ? "—" : eur(forecast), hint: "valore × probabilità", tone: "good" },
    { icon: Target, label: "Valore vinto", value: err ? "—" : eur(wonValue), hint: `${won.length} deal chiusi`, tone: "good" },
    { icon: Timer, label: "Velocità media", value: err ? "—" : avgDays == null ? "—" : `${avgDays}g`, hint: "giorni a chiusura", tone: "default" },
  ];

  // Esporta i KPI mostrati come CSV lato client (nessuna nuova query). exportToCSV
  // gestisce BOM, quoting RFC-4180 e anti formula-injection (src/lib/csvExport).
  const handleExport = () => {
    const rows = cards.map((c) => ({ kpi: c.label, valore: c.value === "—" ? "" : c.value, dettaglio: c.hint }));
    const columns = [
      { key: "kpi", label: "KPI" },
      { key: "valore", label: "Valore" },
      { key: "dettaglio", label: "Dettaglio" },
    ];
    exportToCSV(rows, columns, `pipeline-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const hasData = !err && opps.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </span>
          Analytics pipeline
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 hidden sm:inline-flex"
          onClick={handleExport}
          disabled={!hasData}
          title={hasData ? "Scarica i KPI come file CSV" : "Nessun dato da esportare"}
        >
          <Download className="h-3.5 w-3.5" /> Esporta CSV
        </Button>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            const color = c.tone === "good" ? "text-emerald-600" : c.tone === "accent" ? "text-primary" : "text-foreground";
            const iconWrap = c.tone === "good"
              ? "bg-emerald-50 text-emerald-600"
              : c.tone === "accent"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground";
            return (
              <div key={c.label} className="rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-primary/30">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md ${iconWrap}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {c.label}
                </div>
                <div className={`mt-2 text-2xl font-bold tabular-nums ${loading ? "text-muted-foreground/40" : color}`}>{loading ? "…" : c.value}</div>
                <div className="text-[11px] text-muted-foreground">{c.hint}</div>
              </div>
            );
          })}
        </div>
        {err && (
          <p className="mt-3 text-xs text-muted-foreground">Impossibile caricare i dati della pipeline al momento.</p>
        )}
        {!err && !loading && opps.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Nessuna opportunità ancora in pipeline: i KPI (win rate, forecast, velocità) si popolano appena converti i primi lead in opportunità.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
