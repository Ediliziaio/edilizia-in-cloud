import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Send, MailOpen, MousePointerClick, AlertTriangle, MessageSquareReply, Download } from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";

/**
 * Analytics campagne email cold — funnel + tassi su email_delivery_log
 * (stream 'marketing'). Dati reali, nessuna migrazione richiesta. Le risposte
 * vengono da outreach_replies (gated): se assenti restano a "—".
 */

async function safeCount(builder: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try { const { count, error } = await builder; return error ? null : count ?? 0; } catch { return null; }
}

function pct(n: number | null, d: number | null): string {
  if (n == null || d == null || d === 0) return "—";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

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

  const s = sent.data, o = opened.data, c = clicked.data, b = bounced.data, r = replies.data;
  const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("it-IT"));

  const steps = [
    { icon: Send, label: "Inviate", value: fmt(s), raw: s, rate: null as string | null, tone: "default" as const },
    { icon: MailOpen, label: "Aperte", value: fmt(o), raw: o, rate: pct(o, s), tone: "good" as const },
    { icon: MousePointerClick, label: "Cliccate", value: fmt(c), raw: c, rate: pct(c, s), tone: "good" as const },
    { icon: MessageSquareReply, label: "Risposte", value: fmt(r), raw: r, rate: pct(r, s), tone: "good" as const },
    { icon: AlertTriangle, label: "Bounce", value: fmt(b), raw: b, rate: pct(b, s), tone: "warn" as const },
  ];

  // Esporta il funnel mostrato come CSV lato client (nessuna nuova query): una riga
  // per metrica con valore grezzo e percentuale sulle inviate. exportToCSV gestisce
  // BOM, quoting RFC-4180 e anti formula-injection (src/lib/csvExport).
  const handleExport = () => {
    const rows = steps.map((st) => ({
      metrica: st.label,
      valore: st.raw == null ? "" : String(st.raw),
      percentuale: st.rate && st.rate !== "—" ? st.rate : "",
    }));
    const columns = [
      { key: "metrica", label: "Metrica" },
      { key: "valore", label: "Valore" },
      { key: "percentuale", label: "% sulle inviate" },
    ];
    exportToCSV(rows, columns, `outreach-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Niente da esportare finché non c'è almeno un invio registrato.
  const hasData = s != null && s > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5 text-orange-500" /> Analytics campagne (email)
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={handleExport}
          disabled={!hasData}
          title={hasData ? "Scarica il funnel come file CSV" : "Nessun dato da esportare"}
        >
          <Download className="h-3.5 w-3.5" /> Esporta CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {steps.map((st) => {
            const Icon = st.icon;
            const color = st.tone === "good" ? "text-emerald-600" : st.tone === "warn" ? "text-amber-600" : "text-foreground";
            return (
              <div key={st.label} className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{st.label}</div>
                <div className={`mt-1 text-xl font-bold ${color}`}>{st.value}</div>
                {st.rate && <div className="text-[11px] text-muted-foreground">{st.rate} delle inviate</div>}
              </div>
            );
          })}
        </div>
        {(s === 0 || s == null) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Nessun invio marketing ancora registrato: i tassi (apertura, click, risposta, bounce) si popolano appena partono le campagne.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
