import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Stato live di una sequenza ("vedere il flusso"): quanti contatti sono iscritti,
 * attivi, completati, hanno risposto, e dove sono nella cadenza (distribuzione
 * per step degli attivi). Su outreach_enrollments. Mostrato quando la sequenza
 * è espansa. Errore tabella mancante → silenzioso (gate gestito dal genitore).
 */

/**
 * @param compact variante inline per l'header CHIUSO della sequenza: solo i
 * chip essenziali (iscritti/attivi/risposte/reply rate), niente card né barre
 * per-step — i numeri si vedono senza dover espandere (pattern Instantly:
 * le stats della campagna vivono sulla riga della lista).
 */
export function OutreachSequenceStats({ sequenceId, compact = false }: { sequenceId: string; compact?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const q = useQuery({
    queryKey: ["outreach-seq-stats", sequenceId, compact ? "compact" : "full"],
    retry: false,
    staleTime: 15_000,
    // Conteggi ESATTI lato database: scaricare le righe e contarle si fermava
    // al tetto di 1000 righe per risposta, e una sequenza da 1.676 iscritti
    // risultava "1000 iscritti · 1000 attivi".
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conta = async (filtro?: (qb: any) => any) => {
        let qb = db.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("sequence_id", sequenceId);
        if (filtro) qb = filtro(qb);
        const { count, error } = await qb;
        if (error) throw error;
        return (count ?? 0) as number;
      };
      const [total, active, completed, replied] = await Promise.all([
        conta(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conta((qb: any) => qb.eq("status", "active")),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conta((qb: any) => qb.eq("status", "completed")),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conta((qb: any) => qb.eq("status", "replied")),
      ]);
      const c = { total, active, completed, replied, stopped: Math.max(0, total - active - completed - replied) };
      if (compact) return { c, steps: [] as Array<[number, number]> };
      // Attivi per step: gli step sono pochi, un conteggio ciascuno. L'etichetta
      // è la POSIZIONE nella cadenza (step_order può partire da 0 o da 1).
      const { data: st } = await db.from("outreach_sequence_steps").select("step_order").eq("sequence_id", sequenceId);
      const ordini = [...new Set(((st ?? []) as Array<{ step_order: number }>).map((r) => r.step_order))].sort((a, b) => a - b);
      const perStep = await Promise.all(ordini.map(async (o, i) => [i, await conta(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (qb: any) => qb.eq("status", "active").eq("current_step", o),
      )] as [number, number]));
      return { c, steps: perStep.filter(([, n]) => n > 0) };
    },
  });

  if (q.isLoading) return compact ? null : <div className="py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (q.error) return null;
  const d = q.data;
  if (!d || d.c.total === 0) {
    if (compact) {
      return (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Nessun contatto nel flusso — premi <strong>Arruola</strong> per partire.
        </p>
      );
    }
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-2.5 text-xs text-muted-foreground">
        Nessun contatto nel flusso. Premi <strong>Arruola</strong> per far entrare una lista e avviare la cadenza.
      </div>
    );
  }
  const replyRate = d.c.total ? Math.round((d.c.replied / d.c.total) * 100) : 0;
  if (compact) {
    return (
      <div className="mt-1 flex flex-wrap gap-1.5">
        <StatChip label="iscritti" value={d.c.total.toLocaleString("it-IT")} />
        <StatChip label="attivi" value={d.c.active.toLocaleString("it-IT")} tone="active" />
        <StatChip label="risposte" value={d.c.replied} tone="good" />
        <StatChip label="reply rate" value={`${replyRate}%`} tone="good" />
      </div>
    );
  }
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
