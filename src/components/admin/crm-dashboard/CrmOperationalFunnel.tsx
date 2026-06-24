/**
 * CrmOperationalFunnel — l'HERO operativo della dashboard: il flusso end-to-end
 * Contatti → Email inviate → Aperte → Risposte → Opportunità → Vinti, con la
 * conversione tra ogni step, barre animate (cascata) e contatori che salgono.
 *
 * Dati REALI via count diretti scoped a companyId; le tabelle outreach
 * (outreach_send_queue / outreach_replies) non sono nei tipi generati e possono
 * non essere ancora su prod → query cast + fail-open a 0 (step onesto, non finto).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Send, Eye, MessageSquare, Target, Trophy, Loader2, Wallet, AlertTriangle } from "lucide-react";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n || 0));

const PHASE = {
  reach: "hsl(217 91% 60%)",
  engage: "hsl(43 96% 56%)",
  convert: "hsl(160 84% 39%)",
} as const;

interface FunnelData {
  contatti: number;
  inviate: number;
  aperte: number;
  risposte: number;
  opportunita: number;
  vinti: number;
  vintiValue: number;
}

function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const dur = 900;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format ? format(n) : Math.round(n).toLocaleString("it-IT")}</>;
}

export function CrmOperationalFunnel({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "operational-funnel", companyId],
    staleTime: 60_000,
    queryFn: async (): Promise<FunnelData> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const cnt = (r: { count: number | null; error: unknown }) => (r.error ? 0 : r.count ?? 0);
      const [contatti, inviate, aperte, risposte, oppOpen, won] = await Promise.all([
        supabase.from("marketing_contacts").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        sb.from("outreach_send_queue").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "sent"),
        sb.from("outreach_send_queue").select("id", { count: "exact", head: true }).eq("company_id", companyId).not("opened_at", "is", null),
        sb.from("outreach_replies").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("marketing_opportunities").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "won"),
        supabase.from("marketing_opportunities").select("value").eq("company_id", companyId).eq("status", "won").limit(5000),
      ]);
      const wonRows = (won.data ?? []) as { value: number | null }[];
      return {
        contatti: cnt(contatti),
        inviate: cnt(inviate),
        aperte: cnt(aperte),
        risposte: cnt(risposte),
        opportunita: cnt(oppOpen),
        vinti: won.error ? 0 : wonRows.length,
        vintiValue: wonRows.reduce((s, r) => s + (r.value ?? 0), 0),
      };
    },
  });

  const d = q.data;
  const stages = d
    ? [
        { key: "contatti", label: "Contatti", icon: Users, phase: PHASE.reach, n: d.contatti },
        { key: "inviate", label: "Email inviate", icon: Send, phase: PHASE.reach, n: d.inviate },
        { key: "aperte", label: "Aperte", icon: Eye, phase: PHASE.reach, n: d.aperte },
        { key: "risposte", label: "Risposte", icon: MessageSquare, phase: PHASE.engage, n: d.risposte },
        { key: "opportunita", label: "Opportunità", icon: Target, phase: PHASE.convert, n: d.opportunita },
        { key: "vinti", label: "Vinti", icon: Trophy, phase: PHASE.convert, n: d.vinti },
      ]
    : [];
  const base = Math.max(1, stages[0]?.n ?? 1);
  const overallConv = d && d.contatti > 0 ? (d.vinti / d.contatti) * 100 : 0;
  const constraint = (() => {
    let worst: { r: number; from: string; to: string } | null = null;
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1].n;
      if (prev <= 0) continue;
      const r = stages[i].n / prev;
      if (worst == null || r < worst.r) worst = { r, from: stages[i - 1].label, to: stages[i].label };
    }
    return worst;
  })();

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          Funnel operativo · outreach → cliente
          <span className="ml-auto hidden items-center gap-3 text-[11px] font-normal text-muted-foreground sm:flex">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PHASE.reach }} /> Raggiungere</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PHASE.engage }} /> Coinvolgere</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PHASE.convert }} /> Convertire</span>
          </span>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-2">
              {stages.map((s, i) => {
                const prev = i > 0 ? stages[i - 1].n : null;
                const conv = prev && prev > 0 ? Math.round((s.n / prev) * 100) : null;
                const w = Math.max(s.n > 0 ? 6 : 0, Math.sqrt(s.n / base) * 100);
                const Icon = s.icon;
                return (
                  <div key={s.key} className="flex items-center gap-2.5">
                    <span className="w-9 shrink-0 text-right text-[11px] text-muted-foreground">
                      {conv != null ? `${conv}%` : ""}
                    </span>
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
                      style={{ color: s.phase }}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="w-24 shrink-0 text-[13px] sm:w-28">{s.label}</span>
                    <span className="h-5 flex-1 overflow-hidden rounded-md bg-muted/60">
                      <motion.span
                        className="block h-5 rounded-md"
                        style={{ background: s.phase }}
                        initial={{ width: 0 }}
                        animate={{ width: `${w}%` }}
                        transition={{ duration: 0.9, delay: i * 0.09, ease: [0.2, 0.7, 0.2, 1] }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                      <CountUp value={s.n} />
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "hsl(160 84% 39% / 0.12)", color: PHASE.convert }}>
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <div className="text-[11px] text-muted-foreground">Valore vinto</div>
                  <div className="text-lg font-bold leading-tight" style={{ color: PHASE.convert }}>
                    <CountUp value={d?.vintiValue ?? 0} format={(n) => eur(n)} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Target className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <div className="text-[11px] text-muted-foreground">Conversione contatti → vinti</div>
                  <div className="text-lg font-bold leading-tight">
                    <CountUp value={overallConv} format={(n) => `${n.toFixed(1)}%`} />
                  </div>
                </div>
              </div>
            </div>

            {constraint && constraint.r < 1 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-[12px]" style={{ borderColor: "hsl(0 84% 60% / 0.35)" }}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                <span>
                  <strong>Collo di bottiglia:</strong> {constraint.from} → {constraint.to} — passa solo il {Math.round(constraint.r * 100)}%. È qui che perdi di più: agisci su questo step prima di alzare il volume.
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
