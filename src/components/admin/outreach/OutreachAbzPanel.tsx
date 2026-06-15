import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Trophy, FlaskConical } from "lucide-react";
import { pickWinner } from "../../../../supabase/functions/_shared/outreach-abz";

/**
 * Risultati A/Z di una sequenza: per ogni variante spedita (variant_index sulla
 * coda) quante email inviate, quante risposte e il tasso; evidenzia la vincente
 * (miglior reply rate). Attribuzione a livello iscrizione (variante del 1° invio).
 * Compare solo se sono state usate ≥2 varianti. Errore tabella → silenzioso.
 */

const LETTER = (i: number) => String.fromCharCode(65 + i); // 0→A, 1→B…
const CAP = 2000;

export function OutreachAbzPanel({ sequenceId }: { sequenceId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const q = useQuery({
    queryKey: ["outreach-abz", sequenceId],
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: enrs, error } = await db.from("outreach_enrollments")
        .select("id,status").eq("sequence_id", sequenceId).limit(CAP);
      if (error) throw error;
      const ids = (enrs ?? []).map((e: { id: string }) => e.id);
      if (ids.length === 0) return { variants: [], winner: null };
      const statusById = new Map<string, string>((enrs ?? []).map((e: { id: string; status: string }) => [e.id, e.status]));

      const { data: items } = await db.from("outreach_send_queue")
        .select("enrollment_id,variant_index,sent_at").in("enrollment_id", ids)
        .eq("status", "sent").order("sent_at", { ascending: true }).limit(20000);

      // variante "primaria" per iscrizione = variant_index del primo invio
      const primary = new Map<string, number>();
      for (const it of items ?? []) {
        const k = it.enrollment_id as string;
        if (k && !primary.has(k)) primary.set(k, (it.variant_index ?? 0) as number);
      }
      const sent = new Map<number, number>();
      const replied = new Map<number, number>();
      for (const [enrId, vIdx] of primary) {
        sent.set(vIdx, (sent.get(vIdx) ?? 0) + 1);
        if (statusById.get(enrId) === "replied") replied.set(vIdx, (replied.get(vIdx) ?? 0) + 1);
      }
      const variants = [...sent.keys()].sort((a, b) => a - b)
        .map((index) => ({ index, sent: sent.get(index) ?? 0, replied: replied.get(index) ?? 0 }));
      const winner = pickWinner(variants, 1); // minVolume basso: mostra il leader anche con pochi dati
      return { variants, winner };
    },
  });

  const d = q.data;
  if (q.error || !d || d.variants.length < 2) return null; // niente A/Z in corso

  return (
    <div className="space-y-1.5 rounded-lg border bg-card p-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5" /> RISULTATI A/Z
      </div>
      <div className="space-y-1">
        {d.variants.map((v) => {
          const rate = v.sent > 0 ? Math.round((v.replied / v.sent) * 100) : 0;
          const isWinner = d.winner?.index === v.index && v.replied > 0;
          return (
            <div key={v.index} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${isWinner ? "border-green-300 bg-green-50" : ""}`}>
              <span className="w-16 shrink-0 font-semibold">Variante {LETTER(v.index)}</span>
              <span className="flex-1 text-muted-foreground">{v.sent} inviate · {v.replied} risposte</span>
              <span className="shrink-0 tabular-nums font-medium">{rate}%</span>
              {isWinner && <Badge className="shrink-0 gap-1 bg-green-600 text-[10px]"><Trophy className="h-3 w-3" /> vince</Badge>}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">Vincente per tasso di risposta. Con pochi invii il dato è indicativo (serve volume per essere statisticamente solido).</p>
    </div>
  );
}
