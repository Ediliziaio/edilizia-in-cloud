import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlarmClock, ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * Follow-up scaduti — opportunità aperte con next_action_date nel passato.
 * Disciplina di vendita: ogni mattina lavora prima questi. Su
 * marketing_opportunities (esistente), nessuna migrazione.
 *
 * Linguaggio visivo Instantly/Smartlead: card pulita con header a chip, righe
 * "opportunità" con dot priorità (severità = giorni di ritardo), valore € e
 * accent warning (ambra → rosso). Solo presentazione, query invariata.
 */

interface Overdue { id: string; name: string; next_action: string | null; next_action_date: string; value: number | null; }

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Math.round(n));

export function OutreachOverdueFollowups({ companyId }: { companyId: string }) {
  const [todayMs] = useState(() => Date.now());
  const today = new Date(todayMs).toISOString().slice(0, 10);

  const LIST_CAP = 50;
  const q = useQuery({
    queryKey: ["overdue-followups", companyId, today],
    staleTime: 60_000,
    queryFn: async () => {
      // `count: exact` col limit: `data` sono le prime 50 righe da mostrare, ma
      // `count` è il TOTALE reale delle scadute → il badge non si ferma a 50.
      const { data, error, count } = await supabase
        .from("marketing_opportunities")
        .select("id,name,next_action,next_action_date,value", { count: "exact" })
        .eq("company_id", companyId).eq("status", "open").is("deleted_at", null)
        .not("next_action_date", "is", null).lt("next_action_date", today)
        .order("next_action_date", { ascending: true }).limit(LIST_CAP);
      if (error) throw error;
      return { rows: (data ?? []) as Overdue[], total: count ?? (data?.length ?? 0) };
    },
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? rows.length;
  const capped = total > rows.length; // ci sono più scadute di quelle mostrate
  const has = rows.length > 0;
  const daysOverdue = (d: string) => Math.max(0, Math.floor((todayMs - new Date(d).getTime()) / 86400000));

  // Severità per ritardo: ≥7g rosso (urgente), 3-6g ambra, <3g neutro. Guida il dot
  // priorità e il colore del badge — l'accent warning richiesto dal target CRM.
  const sev = (days: number) => (days >= 7 ? "high" : days >= 3 ? "mid" : "low");
  const totalValue = rows.reduce((s, o) => s + (o.value ?? 0), 0);

  return (
    <Card className={has ? "border-amber-200" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={`flex h-7 w-7 items-center justify-center rounded-md ${has ? "bg-amber-50" : "bg-primary/10"}`}>
            <AlarmClock className={`h-4 w-4 ${has ? "text-amber-600" : "text-primary"}`} />
          </span>
          Follow-up scaduti
          {has && <Badge className="border-transparent bg-amber-500 text-white hover:bg-amber-500">{total}</Badge>}
        </CardTitle>
        {has && totalValue > 0 && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {capped ? "≥ " : ""}{eur(totalValue)} a rischio{capped ? ` · primi ${rows.length}` : ""}
          </span>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        {!has ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </span>
            <p className="text-sm font-medium text-foreground">Nessun follow-up scaduto</p>
            <p className="text-xs text-muted-foreground">Sei in pari con la pipeline. Ottimo lavoro.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((o) => {
              const days = daysOverdue(o.next_action_date);
              const s = sev(days);
              const dot = s === "high" ? "bg-red-500" : s === "mid" ? "bg-amber-500" : "bg-muted-foreground/40";
              const badge = s === "high"
                ? "border-transparent bg-red-500 text-white"
                : s === "mid"
                  ? "border-transparent bg-amber-500 text-white"
                  : "border-border bg-muted text-muted-foreground";
              return (
                <Link
                  key={o.id}
                  to="/admin/marketing/opportunita"
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-muted/40"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{o.name}</div>
                    {o.next_action
                      ? <div className="truncate text-xs text-muted-foreground">{o.next_action}</div>
                      : <div className="truncate text-xs text-muted-foreground/70">Nessuna azione descritta</div>}
                  </div>
                  {o.value != null && o.value > 0 && (
                    <span className="hidden shrink-0 text-xs font-semibold tabular-nums text-foreground sm:block">{eur(o.value)}</span>
                  )}
                  <Badge variant="outline" className={`shrink-0 text-[10px] tabular-nums ${badge}`}>{days}g fa</Badge>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
