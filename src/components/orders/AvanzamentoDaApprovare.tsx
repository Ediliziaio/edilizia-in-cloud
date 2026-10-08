// src/components/orders/AvanzamentoDaApprovare.tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { anteprimaAvanzamento, type RigaAnteprima } from "@/lib/orders/anteprimaAvanzamento";
import { sottofaseDaRiga } from "@/lib/orders/sottofasi";

// Le sottofasi non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Nell'approvazione di un rapportino: cosa cambia alle fasi della commessa se si approva. */
export function AvanzamentoDaApprovare({ orderId, reportId }: { orderId: string; reportId: string }) {
  const { data: righe = [] } = useQuery({
    queryKey: ["avanzamento-da-approvare", orderId, reportId],
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RigaAnteprima[]> => {
      // Un'anteprima: se qualcosa non si legge, non si mostra niente (l'approvazione non cambia).
      try {
        const [rapp, fasi, sotto] = await Promise.all([
          db.from("campo_rapportini").select("fasi_lavorate").eq("id", reportId).eq("order_id", orderId).maybeSingle(),
          db.from("order_work_phases").select("id, name, status, percentuale").eq("order_id", orderId),
          db.from("order_work_subphases")
            .select("id, phase_id, name, position, peso, fatta, fatta_il, fase:order_work_phases!inner(order_id)")
            .eq("fase.order_id", orderId)
            .order("position", { ascending: true }),
        ]);
        if (rapp.error || fasi.error || !Array.isArray(rapp.data?.fasi_lavorate)) return [];
        const sottofasi = sotto.error ? [] : ((sotto.data ?? []) as Record<string, unknown>[]).map(sottofaseDaRiga);
        return anteprimaAvanzamento(fasi.data ?? [], sottofasi, rapp.data.fasi_lavorate);
      } catch {
        return [];
      }
    },
  });
  if (righe.length === 0) return null;

  return (
    <section aria-label="Avanzamento che passa in commessa" className="rounded-xl border p-3">
      <p className="text-sm font-semibold">Avanzamento che passa in commessa</p>
      <ul className="mt-2 space-y-1.5">
        {righe.map((r) => (
          <li key={r.phaseId} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{r.nome}</span>
              <span className="shrink-0 tabular-nums">
                <span>{r.prima}% → {r.dopo}%</span>
                {r.chiude && <span className="ml-2 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-700">si chiude</span>}
              </span>
            </div>
            {r.sottofasiNuove.length > 0 && <p className="text-xs text-muted-foreground">Sottofasi fatte: {r.sottofasiNuove.join(", ")}</p>}
            {r.dichiarata !== null && r.dichiarata < r.prima && (
              <p className="text-xs text-muted-foreground">Il rapportino dice {r.dichiarata}%: l'avanzamento non scende.</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Vale se approvi. Dopo si cambia dalle fasi della commessa.</p>
    </section>
  );
}
