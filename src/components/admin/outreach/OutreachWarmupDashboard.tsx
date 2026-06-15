import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, ArrowDown } from "lucide-react";

/**
 * Dashboard riscaldamento caselle — vista a colpo d'occhio del warm-up del pool.
 * Per ogni casella mostra: "heat" (cap effettivo / target) con ETA a regime e
 * quanto è stato inviato oggi rispetto al cap. Solo lettura su outreach_sender_accounts
 * (nessuna migrazione/deploy). Stessa formula del dispatcher: cap = min(target, base + giorno*step).
 */

const BASE = 5;
const STEP = 5;

interface Sender {
  id: string; email: string; status: string;
  daily_cap_target: number; warmup_day: number; daily_sent: number;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  warming: { label: "in riscaldamento", cls: "bg-amber-100 text-amber-700" },
  active: { label: "a regime", cls: "bg-emerald-100 text-emerald-700" },
  paused: { label: "in pausa", cls: "bg-slate-200 text-slate-600" },
  disabled: { label: "disabilitata", cls: "bg-muted text-muted-foreground" },
  error: { label: "errore", cls: "bg-red-100 text-red-700" },
};

export function OutreachWarmupDashboard({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["outreach-warmup-dash", companyId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sender_accounts")
        .select("id,email,status,daily_cap_target,warmup_day,daily_sent")
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
    return { ...s, cap, isFull, remainingDays, heatPct, sentPct };
  });

  const counts = senders.length;
  const warming = rows.filter((r) => !r.isFull && r.status !== "disabled" && r.status !== "paused").length;
  const sendable = rows.filter((r) => r.status === "active" || r.status === "warming");
  const capToday = sendable.reduce((a, r) => a + r.cap, 0);
  const sentToday = sendable.reduce((a, r) => a + r.daily_sent, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="h-5 w-5 text-orange-500" /> Riscaldamento caselle
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />)}
          </div>
        ) : counts === 0 ? (
          <p className="flex items-center gap-1.5 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            <ArrowDown className="h-3.5 w-3.5" /> Nessuna casella nel pool. Aggiungine una qui sotto per avviare il riscaldamento: si parte da {BASE} invii/giorno e si sale di {STEP} al giorno.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Caselle" value={counts} />
              <Stat label="In riscaldamento" value={warming} accent="text-amber-600" />
              <Stat label="Capacità oggi" value={capToday} accent="text-emerald-600" />
              <Stat label="Inviate oggi" value={sentToday} />
            </div>
            <div className="space-y-2.5">
              {rows.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.disabled;
                const dim = r.status === "paused" || r.status === "disabled";
                return (
                  <div key={r.id} className={`rounded-lg border p-2.5 ${dim ? "opacity-60" : ""}`}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{r.email}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${meta.cls}`}>{meta.label}</span>
                    </div>
                    {/* heat: cap effettivo vs target */}
                    <div className="mb-1 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full ${r.isFull ? "bg-emerald-500" : "bg-orange-400"}`} style={{ width: `${r.heatPct}%` }} />
                      </div>
                      <span className="w-28 shrink-0 text-right text-[10px] text-muted-foreground">
                        cap {r.cap}/{r.daily_cap_target} {r.isFull ? "· a regime" : `· -${r.remainingDays}g`}
                      </span>
                    </div>
                    {/* inviate oggi vs cap */}
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-sky-400" style={{ width: `${r.sentPct}%` }} />
                      </div>
                      <span className="w-28 shrink-0 text-right text-[10px] text-muted-foreground">{r.daily_sent}/{r.cap} inviate oggi</span>
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
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2 text-center">
      <p className={`text-lg font-semibold ${accent ?? ""}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
