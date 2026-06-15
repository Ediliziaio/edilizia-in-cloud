import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Flame, ArrowDown, ShieldCheck, ShieldAlert, ShieldX, CornerDownLeft, AlertTriangle } from "lucide-react";
import { FieldLabel, HeatBar, HealthPill, StatusDot, senderTone, type Health } from "./deliverabilityUi";

/**
 * Dashboard riscaldamento caselle — vista a colpo d'occhio del warm-up del pool.
 * Per ogni casella mostra: "heat" (cap effettivo / target) con ETA a regime,
 * quanto è stato inviato oggi rispetto al cap e la salute reputazione (bounce/lamentele).
 * Stile Instantly/Smartlead: card pulite, dot di stato, heat-bar eleganti, summary pool.
 * Solo lettura su outreach_sender_accounts (nessuna migrazione/deploy). Stessa formula del
 * dispatcher: cap = min(target, base + giorno*step). Le soglie salute rispecchiano shouldAutoPause.
 */

const BASE = 5;
const STEP = 5;

// Soglie reputazione allineate a shouldAutoPause (_shared/outreach-dispatch-logic.ts):
// auto-pausa a bounce>=10 || lamentele>=2. "attenzione" a metà strada.
const MAX_BOUNCES = 10;
const MAX_COMPLAINTS = 2;
const WARN_BOUNCES = 5;
const WARN_COMPLAINTS = 1;

/** Livello di salute della casella dalle soglie reputazione (= soglia auto-pausa). */
function healthLevel(bounceCount: number, complaintCount: number): Health {
  if (bounceCount >= MAX_BOUNCES || complaintCount >= MAX_COMPLAINTS) return "a rischio";
  if (bounceCount >= WARN_BOUNCES || complaintCount >= WARN_COMPLAINTS) return "attenzione";
  return "ok";
}

interface Sender {
  id: string; email: string; status: string;
  daily_cap_target: number; warmup_day: number; daily_sent: number;
  bounce_count: number; complaint_count: number;
}

export function OutreachWarmupDashboard({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["outreach-warmup-dash", companyId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sender_accounts")
        .select("id,email,status,daily_cap_target,warmup_day,daily_sent,bounce_count,complaint_count")
        .eq("company_id", companyId).order("created_at");
      if (error) throw error;
      return (data ?? []) as Sender[];
    },
  });

  const senders = q.data ?? [];
  const rows = senders.map((s) => {
    const cap = Math.min(s.daily_cap_target, BASE + s.warmup_day * STEP);
    const isFull = cap >= s.daily_cap_target;
    const daysToFull = Math.max(0, Math.ceil((s.daily_cap_target - BASE) / STEP));
    const remainingDays = Math.max(0, daysToFull - s.warmup_day);
    const heatPct = s.daily_cap_target > 0 ? Math.min(100, Math.round((cap / s.daily_cap_target) * 100)) : 0;
    const sentPct = cap > 0 ? Math.min(100, Math.round((s.daily_sent / cap) * 100)) : 0;
    const health = healthLevel(s.bounce_count, s.complaint_count);
    return { ...s, cap, isFull, remainingDays, heatPct, sentPct, health };
  });

  const counts = senders.length;
  const warming = rows.filter((r) => !r.isFull && r.status !== "disabled" && r.status !== "paused").length;
  const sendable = rows.filter((r) => r.status === "active" || r.status === "warming");
  const capToday = sendable.reduce((a, r) => a + r.cap, 0);
  const sentToday = sendable.reduce((a, r) => a + r.daily_sent, 0);
  const healthOk = rows.filter((r) => r.health === "ok").length;
  const healthWarn = rows.filter((r) => r.health === "attenzione").length;
  const healthRisk = rows.filter((r) => r.health === "a rischio").length;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 shadow-sm sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Flame className="h-4 w-4 text-orange-500" /> Riscaldamento caselle
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Cap crescente per casella, con ETA a regime e salute reputazione.</p>
        </div>
        {counts > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <FieldLabel className="mr-0.5">Salute pool</FieldLabel>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"><ShieldCheck className="h-3 w-3" /> {healthOk} ok</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20"><ShieldAlert className="h-3 w-3" /> {healthWarn} attenzione</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20"><ShieldX className="h-3 w-3" /> {healthRisk} a rischio</span>
          </div>
        )}
      </header>

      {q.isLoading ? (
        <div className="space-y-2.5">
          {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/70" />)}
        </div>
      ) : counts === 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-card p-4 text-xs text-muted-foreground">
          <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>Nessuna casella nel pool. Aggiungine una nella sezione <strong className="font-medium text-foreground">Caselle mittenti</strong> per avviare il riscaldamento: si parte da {BASE} invii/giorno e si sale di {STEP} al giorno.</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Caselle" value={counts} />
            <Stat label="In riscaldamento" value={warming} accent="text-amber-600" />
            <Stat label="Capacità oggi" value={capToday} accent="text-emerald-600" />
            <Stat label="Inviate oggi" value={sentToday} />
          </div>

          <div className="space-y-2.5">
            {rows.map((r) => {
              const tone = senderTone(r.status);
              const dim = r.status === "paused" || r.status === "disabled";
              return (
                <div key={r.id} className={`rounded-xl border border-border bg-card p-3.5 shadow-sm ${dim ? "opacity-60" : ""}`}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <span className="block truncate font-mono text-sm font-medium text-foreground">{r.email}</span>
                      <StatusDot tone={tone} />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><CornerDownLeft className="h-3 w-3" /> {r.bounce_count}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><AlertTriangle className="h-3 w-3" /> {r.complaint_count}</span>
                      <HealthPill health={r.health} />
                    </div>
                  </div>

                  {r.health === "a rischio" && (
                    <p className="mb-2.5 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-[10px] text-red-700">
                      <ShieldX className="h-3 w-3 shrink-0" /> Reputazione critica: vicina all'auto-pausa.
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* heat: cap effettivo vs target */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <FieldLabel>Warm-up · g.{r.warmup_day}</FieldLabel>
                        <span className="text-[10px] font-medium text-muted-foreground">cap {r.cap}/{r.daily_cap_target} {r.isFull ? "· a regime" : `· ETA ${r.remainingDays}g`}</span>
                      </div>
                      <HeatBar pct={r.heatPct} height="h-2" indicatorClassName={r.isFull ? "bg-emerald-500" : "bg-orange-400"} />
                    </div>
                    {/* inviate oggi vs cap */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <FieldLabel>Inviate oggi</FieldLabel>
                        <span className="text-[10px] font-medium text-muted-foreground">{r.daily_sent}/{r.cap}</span>
                      </div>
                      <HeatBar pct={r.sentPct} height="h-2" indicatorClassName="bg-sky-500" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Il cap cresce da {BASE} a target salendo di {STEP}/giorno. Servono ≥2 caselle per il warm-up reciproco vero.
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <FieldLabel>{label}</FieldLabel>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ?? "text-foreground"}`}>{value.toLocaleString("it-IT")}</p>
    </div>
  );
}
