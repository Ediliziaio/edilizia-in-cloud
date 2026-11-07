// src/components/orders/AvanzamentoDaApprovare.tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { anteprimaAvanzamento, avanzateInAnteprima, fasiAperte, type AvanzataInAnteprima, type RigaAnteprima } from "@/lib/orders/anteprimaAvanzamento";
import { SOTTOFASI_NELLA_FASE, sottofasiDalleFasi } from "@/lib/orders/sottofasi";

// Le sottofasi non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Anteprima { righe: RigaAnteprima[]; aperte: string[]; avanzate?: AvanzataInAnteprima[] }
const NIENTE: Anteprima = { righe: [], aperte: [] };

/** Nell'approvazione di un rapportino: cosa cambia alle fasi della commessa se si approva. */
export function AvanzamentoDaApprovare({ orderId, reportId }: { orderId: string; reportId: string }) {
  const { data: { righe, aperte, avanzate = [] } = NIENTE } = useQuery({
    queryKey: ["avanzamento-da-approvare", orderId, reportId],
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Anteprima> => {
      // Un'anteprima: se qualcosa non si legge, non si mostra niente (l'approvazione non cambia).
      try {
        // Le fasi della commessa con le loro sottofasi, in una lettura sola.
        const [rapp, fasi] = await Promise.all([
          db.from("campo_rapportini").select("fasi_lavorate, lavoro_completato, firma_cliente_url").eq("id", reportId).eq("order_id", orderId).maybeSingle(),
          db.from("order_work_phases").select(`id, name, status, percentuale, ${SOTTOFASI_NELLA_FASE}`).eq("order_id", orderId),
        ]);
        if (rapp.error || fasi.error) return NIENTE;
        // Un rapporto di fine lavori non muove l'avanzamento (trigger): si dice solo cosa resta aperto.
        if (rapp.data?.lavoro_completato || rapp.data?.firma_cliente_url) return { righe: [], aperte: fasiAperte(fasi.data ?? []) };
        if (!Array.isArray(rapp.data?.fasi_lavorate)) return NIENTE;
        const sottofasi = sottofasiDalleFasi(fasi.data);
        // Le quantità senza i costi; se non si leggono, si mostrano solo le percentuali.
        let righeQuantita: Array<{ subphase_id: string; quantita: number; unita: string | null }> = [];
        try {
          const quantita = await db.rpc("campo_quantita_sottofasi", { p_order_id: orderId });
          if (!quantita.error) righeQuantita = quantita.data ?? [];
        } catch { /* senza quantità restano le percentuali */ }
        const quantitaDi = new Map(righeQuantita.map((r) => [r.subphase_id, { quantita: Number(r.quantita), unita: r.unita }]));
        return {
          righe: anteprimaAvanzamento(fasi.data ?? [], sottofasi, rapp.data.fasi_lavorate),
          aperte: [],
          avanzate: avanzateInAnteprima(sottofasi, rapp.data.fasi_lavorate, quantitaDi),
        };
      } catch {
        return NIENTE;
      }
    },
  });
  if (aperte.length > 0) {
    return (
      <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Fine lavori: restano aperte {aperte.join(", ")}. Questo rapportino non le chiude: si chiudono dalle fasi della commessa.
      </p>
    );
  }
  if (righe.length === 0 && avanzate.length === 0) return null;

  return (
    <section aria-label="Avanzamento che passa in commessa" className="rounded-xl border p-3">
      <p className="text-sm font-semibold">Avanzamento che passa in commessa</p>
      <ul className="mt-2 space-y-1.5">
        {righe.map((r) => (
          <li key={r.phaseId} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{r.nome}</span>
              <span className="shrink-0 tabular-nums">
                {r.inizia ? <span>Inizia</span> : <span>{r.prima}% → {r.dopo}%</span>}
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
      {avanzate.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <p className="text-xs font-semibold">Fatto oggi</p>
          <ul className="mt-1 space-y-0.5">
            {avanzate.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">{a.nome}</span>
                <span className={a.oltre ? "shrink-0 font-semibold text-amber-800" : "shrink-0 tabular-nums"}>{a.testo}{a.oltre ? " · oltre il previsto, la chiude" : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Vale se approvi. Dopo si cambia dalle fasi della commessa.</p>
    </section>
  );
}
