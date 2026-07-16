import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, CheckCircle2, AlertTriangle, Loader2, ChevronRight } from "lucide-react";
import { useVerificaDeliverability } from "@/lib/email-ai/hooks";

/**
 * Cockpit deliverability — un solo punteggio 0-100 che aggrega i segnali sparsi
 * nelle card sotto (autenticazione DNS, mittenti sani, warm-up), così a colpo
 * d'occhio sai "quanto bene arrivano le mie email" e cosa fare per alzarlo.
 *
 * Componenti del punteggio (totale 100):
 *   - Autenticazione DNS 45  → SPF 15 · DKIM 20 · DMARC 10
 *   - Mittenti sani 35       → almeno un mittente 10 · salute reputazione 25
 *   - Warm-up pronto 20      → quota di caselle già a regime (cap pieno)
 * Solo lettura: nessuna migrazione/deploy.
 */

interface Sender {
  id: string; status: string; daily_cap_target: number; warmup_day: number;
  bounce_count: number; complaint_count: number;
}
const BASE = 20, STEP = 20; // stessa formula del warm-up dashboard
const MAX_BOUNCES = 10, MAX_COMPLAINTS = 2, WARN_BOUNCES = 5, WARN_COMPLAINTS = 1;

export function OutreachDeliverabilityScore({ companyId, onGoto }: { companyId: string; onGoto?: () => void }) {
  const dns = useVerificaDeliverability();
  // verifica DNS automatica all'apertura della tab (dominio auto)
  useEffect(() => {
    if (!dns.data && !dns.isPending) dns.mutate({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendersQ = useQuery({
    queryKey: ["outreach-deliv-score-senders", companyId],
    staleTime: 30_000,
    queryFn: async (): Promise<Sender[]> => {
      const { data, error } = await supabase
        .from("outreach_sender_accounts")
        .select("id,status,daily_cap_target,warmup_day,bounce_count,complaint_count")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as Sender[];
    },
  });

  const model = useMemo(() => {
    const r = dns.data;
    const senders = sendersQ.data ?? [];
    const actions: { label: string; hint: string; sev: "high" | "med" }[] = [];

    // ── Autenticazione DNS (45) ──
    let dnsScore = 0;
    if (r) {
      if (r.spf_ok) dnsScore += 15; else actions.push({ label: "Configura SPF", hint: "Dice a Gmail/Outlook chi può spedire per te — senza, quasi tutto va in spam.", sev: "high" });
      if (r.dkim_ok) dnsScore += 20; else actions.push({ label: "Configura DKIM", hint: "Firma le email così non si falsificano. È il segnale #1 per l'inbox.", sev: "high" });
      if (r.dmarc_ok) dnsScore += 10; else actions.push({ label: "Aggiungi DMARC", hint: "Completa l'autenticazione e migliora la reputazione del dominio.", sev: "med" });
    }

    // ── Mittenti sani (35) ──
    let senderScore = 0;
    if (senders.length > 0) {
      senderScore += 10;
      const health = (s: Sender) => {
        if (s.bounce_count >= MAX_BOUNCES || s.complaint_count >= MAX_COMPLAINTS) return 0;
        if (s.bounce_count >= WARN_BOUNCES || s.complaint_count >= WARN_COMPLAINTS) return 0.5;
        return 1;
      };
      const avg = senders.reduce((a, s) => a + health(s), 0) / senders.length;
      senderScore += Math.round(25 * avg);
      const risky = senders.filter((s) => health(s) === 0).length;
      if (risky > 0) actions.push({ label: `${risky} casella/e a rischio`, hint: "Bounce o lamentele alti: metti in pausa e verifica la lista.", sev: "high" });
    } else {
      actions.push({ label: "Collega una casella d'invio", hint: "Serve almeno un mittente nel pool per spedire cold email.", sev: "high" });
    }

    // ── Warm-up pronto (20) ──
    let warmScore = 0;
    if (senders.length > 0) {
      const ready = senders.filter((s) => Math.min(s.daily_cap_target, BASE + s.warmup_day * STEP) >= s.daily_cap_target).length;
      const ratio = ready / senders.length;
      warmScore = Math.round(20 * ratio);
      if (ratio < 1) actions.push({ label: "Warm-up in corso", hint: "Le caselle stanno scaldando: il volume massimo cresce ogni giorno.", sev: "med" });
    }

    const total = Math.round(dnsScore + senderScore + warmScore);
    return { total, dnsScore, senderScore, warmScore, actions: actions.slice(0, 3), hasDns: !!r };
  }, [dns.data, sendersQ.data]);

  const loading = (dns.isPending && !dns.data) || sendersQ.isLoading;
  const score = model.total;
  const theme = score >= 75
    ? { ring: "text-emerald-500", bg: "from-emerald-500/10", text: "text-emerald-700", label: "Deliverability ottima" }
    : score >= 45
      ? { ring: "text-amber-500", bg: "from-amber-500/10", text: "text-amber-700", label: "Deliverability da migliorare" }
      : { ring: "text-rose-500", bg: "from-rose-500/10", text: "text-rose-700", label: "Deliverability a rischio" };

  const R = 26, C = 2 * Math.PI * R;

  return (
    <section className={`rounded-xl border border-border bg-gradient-to-br ${theme.bg} to-transparent shadow-sm`}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        {/* Gauge */}
        <div className="flex items-center gap-3 sm:w-64 sm:shrink-0">
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
              <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
              {!loading && (
                <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
                  className={`${theme.ring} transition-all`} strokeDasharray={C}
                  strokeDashoffset={C - (C * score) / 100} />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                : <span className="text-lg font-bold tabular-nums">{score}</span>}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className={`h-4 w-4 shrink-0 ${theme.text}`} />
              <span className={`text-sm font-semibold leading-tight ${theme.text}`}>{theme.label}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Salute d'invio su 100 — più è alto, più email arrivano in inbox.</p>
          </div>
        </div>

        {/* Breakdown + azioni */}
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "Autenticazione", v: model.dnsScore, max: 45 },
              { k: "Mittenti sani", v: model.senderScore, max: 35 },
              { k: "Warm-up", v: model.warmScore, max: 20 },
            ].map((c) => (
              <div key={c.k} className="rounded-lg border border-border bg-card/60 px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.k}</div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-sm font-semibold tabular-nums">{loading ? "—" : c.v}</span>
                  <span className="text-[10px] text-muted-foreground">/ {c.max}</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/50" style={{ width: loading ? "0%" : `${(c.v / c.max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          {!loading && (
            model.actions.length > 0 ? (
              <ul className="space-y-1">
                {model.actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px]">
                    <AlertTriangle className={`mt-0.5 h-3 w-3 shrink-0 ${a.sev === "high" ? "text-rose-500" : "text-amber-500"}`} />
                    <span><b className="text-foreground">{a.label}</b> <span className="text-muted-foreground">— {a.hint}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Tutto a posto: dominio autenticato, mittenti sani e pronti.
              </p>
            )
          )}
          {onGoto && (
            <button onClick={onGoto} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
              Vai alle impostazioni d'invio <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
