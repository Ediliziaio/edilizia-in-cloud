import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Send, MailOpen, MousePointerClick, AlertTriangle, MessageSquareReply, Download, TrendingUp } from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import { OutreachTrend, type TrendPoint } from "./outreachCharts";

/**
 * Analytics campagne email cold — funnel VISUALE (barre a imbuto) + trend invii
 * 7 giorni, su email_delivery_log (stream 'marketing'). Dati reali, nessuna
 * migrazione. Le risposte vengono da outreach_replies (gated): se assenti "—".
 */

async function safeCount(builder: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try { const { count, error } = await builder; return error ? null : count ?? 0; } catch { return null; }
}

function pct(n: number | null, d: number | null): number | null {
  if (n == null || d == null || d === 0) return null;
  return Math.round((n / d) * 1000) / 10;
}
const pctLabel = (v: number | null) => (v == null ? "—" : `${v}%`);

export function OutreachAnalytics({ companyId }: { companyId: string }) {
  const base = () => supabase.from("email_delivery_log").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("stream", "marketing");

  const sent = useQuery({ queryKey: ["oa", "sent", companyId], staleTime: 60_000, queryFn: () => safeCount(base()) });
  const opened = useQuery({ queryKey: ["oa", "opened", companyId], staleTime: 60_000, queryFn: () => safeCount(base().not("opened_at", "is", null)) });
  const clicked = useQuery({ queryKey: ["oa", "clicked", companyId], staleTime: 60_000, queryFn: () => safeCount(base().not("clicked_at", "is", null)) });
  const bounced = useQuery({ queryKey: ["oa", "bounced", companyId], staleTime: 60_000, queryFn: () => safeCount(base().not("bounced_at", "is", null)) });
  const replies = useQuery({
    queryKey: ["oa", "replies", companyId], staleTime: 60_000, retry: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => safeCount((supabase as any).from("outreach_replies").select("*", { count: "exact", head: true }).eq("company_id", companyId)),
  });

  // Trend invii ultimi 7 giorni: righe grezze (created_at) raggruppate per
  // giorno LOCALE lato client (no drift UTC). Volume cold = piccolo, cap 5000.
  const trend = useQuery({
    queryKey: ["oa", "trend", companyId], staleTime: 60_000, retry: false,
    queryFn: async (): Promise<TrendPoint[]> => {
      const since = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("email_delivery_log")
        .select("sent_at")
        .eq("company_id", companyId).eq("stream", "marketing")
        .gte("sent_at", since.toISOString())
        .limit(5000);
      if (error) return [];
      const buckets = new Map<string, number>();
      const days: { key: string; label: string }[] = [];
      const WD = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString("en-CA");
        days.push({ key, label: `${WD[d.getDay()]} ${d.getDate()}` });
        buckets.set(key, 0);
      }
      for (const row of (data ?? []) as { sent_at: string }[]) {
        const key = new Date(row.sent_at).toLocaleDateString("en-CA");
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      return days.map((d) => ({ label: d.label, value: buckets.get(d.key) ?? 0 }));
    },
  });

  const s = sent.data, o = opened.data, c = clicked.data, b = bounced.data, r = replies.data;
  const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("it-IT"));

  // Funnel a imbuto: ogni stadio è una barra la cui larghezza = % sulle inviate.
  const funnel = [
    { icon: Send, label: "Inviate", raw: s, rate: 100 as number | null, width: 100, tone: "blue" as const },
    { icon: MailOpen, label: "Aperte", raw: o, rate: pct(o, s), width: pct(o, s) ?? 0, tone: "emerald" as const },
    { icon: MousePointerClick, label: "Cliccate", raw: c, rate: pct(c, s), width: pct(c, s) ?? 0, tone: "violet" as const },
    { icon: MessageSquareReply, label: "Risposte", raw: r, rate: pct(r, s), width: pct(r, s) ?? 0, tone: "orange" as const },
  ];

  const toneBar: Record<string, string> = {
    blue: "bg-gradient-to-r from-blue-500 to-indigo-500",
    emerald: "bg-gradient-to-r from-emerald-500 to-teal-400",
    violet: "bg-gradient-to-r from-violet-500 to-fuchsia-400",
    orange: "bg-gradient-to-r from-orange-500 to-amber-400",
  };
  const toneIcon: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/25 dark:text-blue-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-900/25 dark:text-violet-300",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-900/25 dark:text-orange-300",
  };

  const handleExport = () => {
    const rows = [
      ...funnel.map((st) => ({ metrica: st.label, valore: st.raw == null ? "" : String(st.raw), percentuale: st.rate == null ? "" : `${st.rate}%` })),
      { metrica: "Bounce", valore: b == null ? "" : String(b), percentuale: pct(b, s) == null ? "" : `${pct(b, s)}%` },
    ];
    const columns = [
      { key: "metrica", label: "Metrica" },
      { key: "valore", label: "Valore" },
      { key: "percentuale", label: "% sulle inviate" },
    ];
    exportToCSV(rows, columns, `outreach-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const hasData = s != null && s > 0;
  const trendData = trend.data ?? [];
  const trendTotal = trendData.reduce((acc, p) => acc + p.value, 0);
  const bounceRate = pct(b, s);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <BarChart3 className="h-4 w-4 text-primary" />
          </span>
          Analytics campagne (email)
        </CardTitle>
        <Button
          size="sm" variant="outline" className="h-8 gap-1.5 hidden sm:inline-flex"
          onClick={handleExport} disabled={!hasData}
          title={hasData ? "Scarica il funnel come file CSV" : "Nessun dato da esportare"}
        >
          <Download className="h-3.5 w-3.5" /> Esporta CSV
        </Button>
      </CardHeader>

      <CardContent className="pt-5">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          {/* ── Funnel a imbuto ── */}
          <div className="space-y-2.5">
            {funnel.map((st) => {
              const Icon = st.icon;
              const w = hasData ? Math.max(st.width, st.raw && st.raw > 0 ? 4 : 0) : (st.label === "Inviate" ? 0 : 0);
              return (
                <div key={st.label} className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneIcon[st.tone]}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{st.label}</span>
                      <span className="text-sm font-bold tabular-nums">
                        {fmt(st.raw)}
                        {st.label !== "Inviate" && st.rate != null && (
                          <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">{pctLabel(st.rate)}</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${toneBar[st.tone]} transition-[width] duration-500`} style={{ width: `${w}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Bounce come riga-rischio separata (non è parte dell'imbuto) */}
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50/50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/10">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="text-xs text-muted-foreground">Bounce</span>
              <span className="ml-auto text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {fmt(b)}
                {bounceRate != null && <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">{pctLabel(bounceRate)}</span>}
              </span>
            </div>
          </div>

          {/* ── Trend invii 7 giorni ── */}
          <div className="flex flex-col rounded-xl border border-border bg-muted/20 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-orange-500" /> Invii · 7 giorni
              </span>
              <span className="text-sm font-bold tabular-nums">{trendTotal.toLocaleString("it-IT")}</span>
            </div>
            {trendTotal > 0 ? (
              <OutreachTrend data={trendData} height={92} ariaLabel="Andamento invii ultimi 7 giorni" />
            ) : (
              <div className="flex flex-1 items-center justify-center py-6 text-center text-[11px] text-muted-foreground">
                Il grafico si popola appena partono gli invii.
              </div>
            )}
          </div>
        </div>

        {(s === 0 || s == null) && (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Nessun invio marketing ancora registrato: i tassi (apertura, click, risposta, bounce) si popolano appena partono le campagne.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
