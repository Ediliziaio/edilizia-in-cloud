/**
 * OutreachPilotPulse — capacità di invio + avanzamento delle sequenze in corsa.
 *
 * Completa il cockpit "Oggi": QueueStatus dice quanti messaggi sono in coda,
 * qui si vede QUANTO può spingere il motore oggi (warm-up per casella:
 * cap = min(target, base + giorno×step), stessa formula del dispatcher, con
 * varianza "umana" solo verso il basso) e A CHE PUNTO è ogni sequenza attiva
 * (contatti per step, risposte, completati, usciti). Refresh 30s.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Flame, Loader2, MailWarning, MessageSquareReply, Route } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface SenderRow {
  id: string;
  email: string;
  status: string;
  daily_cap_target: number;
  warmup_base: number;
  warmup_step: number;
  warmup_day: number;
  daily_sent: number;
  daily_sent_date: string | null;
  bounce_count: number;
  complaint_count: number;
}

interface SeqPulse {
  id: string;
  name: string;
  stepTotal: number;
  activeByStep: number[]; // index 0 = step 1
  active: number;
  replied: number;
  completed: number;
  usciti: number; // stopped + bounced + opted_out
}

/** Stessa formula del dispatcher (outreach-dispatch-logic.effectiveDailyCap). */
const capOggi = (s: SenderRow) =>
  Math.max(0, Math.min(s.daily_cap_target, s.warmup_base + s.warmup_day * s.warmup_step));

const todayLocal = () => new Date().toLocaleDateString("en-CA");

async function count(builder: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count: c, error } = await builder;
    return error ? 0 : c ?? 0;
  } catch {
    return 0;
  }
}

export function OutreachPilotPulse({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["outreach-pilot-pulse", companyId],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [{ data: senders }, { data: seqs }] = await Promise.all([
        db
          .from("outreach_sender_accounts")
          .select("id,email,status,daily_cap_target,warmup_base,warmup_step,warmup_day,daily_sent,daily_sent_date,bounce_count,complaint_count")
          .in("status", ["active", "warming"]),
        db.from("outreach_sequences").select("id,name").eq("status", "active"),
      ]);

      const sequences: SeqPulse[] = [];
      for (const s of (seqs ?? []) as { id: string; name: string }[]) {
        const { data: steps } = await db
          .from("outreach_sequence_steps")
          .select("step_order")
          .eq("sequence_id", s.id)
          .order("step_order", { ascending: true });
        const stepOrders: number[] = ((steps ?? []) as { step_order: number }[]).map((x) => x.step_order);
        const stepTotal = stepOrders.length;

        const enr = () =>
          db.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("sequence_id", s.id);
        const [active, replied, completed, usciti, ...byStep] = await Promise.all([
          count(enr().eq("status", "active")),
          count(enr().eq("status", "replied")),
          count(enr().eq("status", "completed")),
          count(enr().in("status", ["stopped", "bounced", "opted_out"])),
          ...stepOrders.map((ord: number) => count(enr().eq("status", "active").eq("current_step", ord))),
        ]);
        sequences.push({ id: s.id, name: s.name, stepTotal, activeByStep: byStep, active, replied, completed, usciti });
      }

      return { senders: (senders ?? []) as SenderRow[], sequences };
    },
  });

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  const d = q.data;
  if (!d || (d.senders.length === 0 && d.sequences.length === 0)) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="h-5 w-5 text-orange-500" aria-hidden="true" /> Pilota in corsa — capacità &amp; avanzamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Capacità caselle (warm-up) ── */}
        {d.senders.map((s) => {
          const cap = capOggi(s);
          const sentToday = s.daily_sent_date === todayLocal() ? s.daily_sent : 0;
          const residuo = Math.max(0, cap - sentToday);
          const repIssues = (s.bounce_count ?? 0) + (s.complaint_count ?? 0);
          return (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{s.email}</span>
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                  warm-up giorno {s.warmup_day}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  oggi <strong className="tabular-nums text-foreground">{sentToday}/{cap}</strong> · restano {residuo}
                </span>
              </div>
              <Progress value={cap > 0 ? Math.min(100, (sentToday / cap) * 100) : 0} className="mt-2 h-1.5" />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>
                  il tetto sale di {s.warmup_step}/giorno di warm-up fino a {s.daily_cap_target} (−15% max di varianza "umana")
                </span>
                <span className={`flex items-center gap-1 ${repIssues > 0 ? "font-medium text-amber-600" : ""}`}>
                  <MailWarning className="h-3 w-3" aria-hidden="true" /> bounce {s.bounce_count ?? 0} · reclami {s.complaint_count ?? 0}
                </span>
              </div>
            </div>
          );
        })}

        {/* ── Sequenze attive: avanzamento ── */}
        {d.sequences.map((s) => {
          const total = s.active + s.replied + s.completed + s.usciti;
          return (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Flame className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {total.toLocaleString("it-IT")} arruolati · <strong className="text-foreground">{s.active}</strong> in cadenza
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {s.activeByStep.map((n, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground"
                  >
                    Step {i + 1}: <span className="font-bold text-foreground">{n}</span>
                  </span>
                ))}
                <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400">
                  <MessageSquareReply className="h-3 w-3" aria-hidden="true" /> Risposte: {s.replied}
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
                  Completati: {s.completed}
                </span>
                {s.usciti > 0 && (
                  <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] tabular-nums text-amber-700 dark:bg-amber-900/25 dark:text-amber-400">
                    Usciti: {s.usciti}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
