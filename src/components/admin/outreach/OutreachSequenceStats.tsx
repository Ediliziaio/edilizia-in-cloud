import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Stato live di una sequenza ("vedere il flusso"): quanti contatti sono iscritti,
 * attivi, completati, hanno risposto, e dove sono nella cadenza (distribuzione
 * per step degli attivi). Su outreach_enrollments. Mostrato quando la sequenza
 * è espansa. Errore tabella mancante → silenzioso (gate gestito dal genitore).
 */

interface Row { status: string; current_step: number }

export function OutreachSequenceStats({ sequenceId }: { sequenceId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const q = useQuery({
    queryKey: ["outreach-seq-stats", sequenceId],
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await db.from("outreach_enrollments")
        .select("status,current_step").eq("sequence_id", sequenceId).limit(5000);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const c = { total: rows.length, active: 0, completed: 0, replied: 0, stopped: 0 };
      const steps = new Map<number, number>();
      for (const r of rows) {
        if (r.status === "active") { c.active++; steps.set(r.current_step, (steps.get(r.current_step) ?? 0) + 1); }
        else if (r.status === "completed") c.completed++;
        else if (r.status === "replied") c.replied++;
        else c.stopped++; // paused/stopped/bounced/opted_out
      }
      return { c, steps: [...steps.entries()].sort((a, b) => a[0] - b[0]) };
    },
  });

  if (q.isLoading) return <div className="py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (q.error) return null;
  const d = q.data;
  if (!d || d.c.total === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-2.5 text-xs text-muted-foreground">
        Nessun contatto nel flusso. Premi <strong>Arruola</strong> per far entrare una lista e avviare la cadenza.
      </div>
    );
  }
  const replyRate = d.c.total ? Math.round((d.c.replied / d.c.total) * 100) : 0;
  return (
    <div className="space-y-2 rounded-lg border bg-card p-2.5">
      <div className="flex flex-wrap gap-1.5">
        <StatChip label="iscritti" value={d.c.total} />
        <StatChip label="attivi" value={d.c.active} tone="active" />
        <StatChip label="completati" value={d.c.completed} />
        <StatChip label="risposte" value={d.c.replied} tone="good" />
        {d.c.stopped > 0 && <StatChip label="fermati" value={d.c.stopped} tone="muted" />}
        <StatChip label="reply rate" value={`${replyRate}%`} tone="good" />
      </div>
      {d.steps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">Attivi per step</p>
          {d.steps.map(([step, n]) => (
            <div key={step} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Step {step + 1}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.round((n / d.c.active) * 100)}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums">{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "active" | "good" | "muted" }) {
  const cls = tone === "good" ? "border-green-200 bg-green-50 text-green-700"
    : tone === "active" ? "border-orange-200 bg-orange-50 text-orange-700"
    : tone === "muted" ? "bg-muted text-muted-foreground"
    : "bg-card";
  return (
    <span className={`rounded-md border px-2 py-1 text-[11px] ${cls}`}>
      <span className="font-semibold">{value}</span> <span className="opacity-70">{label}</span>
    </span>
  );
}
