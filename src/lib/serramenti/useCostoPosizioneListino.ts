/**
 * Il costo d'acquisto di una posizione del preventivo, dal listino: serve alla
 * vista impresa (costi e margine). Stesse regole e stessi dati dello step
 * Economia — cella della griglia, prodotto con le sue varianti, costo delle
 * tariffe di posa, `calcolaCostoPosizione` — e stessa chiave di cache per le
 * celle: una sola richiesta per due schermate.
 *
 * NB: lo step Economia ha ancora la sua copia inline di questo pezzo
 * (`costoDalListino`); quando la sessione che lo sta toccando ha finito va
 * sostituita con questo hook.
 */
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFamilies } from "@/hooks/useFamilies";
import { costoTariffa } from "@/lib/listino/costoTariffa";
import { calcolaCostoPosizione } from "@/lib/serramenti/pricing";
import { useTariffeManodopera } from "@/lib/serramenti/queries";
import type { RigaCostoListino } from "@/lib/serramenti/margine";
import type { SrProgettoDetail } from "@/types/serramenti";

type CellaCosto = { id: string; prezzo_acquisto: number | null; supplier_product_line_id: string | null };

export function useCostoPosizioneListino(
  progettoId: string | undefined,
  detail: Pick<SrProgettoDetail, "serramenti" | "accessori"> | undefined,
  abilitato: boolean,
): { costoPosizione: (riga: RigaCostoListino) => number | null; inCaricamento: boolean } {
  const costGridIds = useMemo(
    () => Array.from(new Set([
      ...(detail?.serramenti ?? []).map((s) => s.listino_voce_id).filter((v): v is string => !!v),
      ...(detail?.accessori ?? []).map((a) => a.listino_voce_id).filter((v): v is string => !!v),
    ])),
    [detail?.serramenti, detail?.accessori],
  );

  // Stessa chiave e stessa forma dei dati dello step Economia: la cache è una.
  const { data: costGridRows = [], isFetching } = useQuery({
    queryKey: ["sr-margin-grid-costs", progettoId, costGridIds],
    enabled: abilitato && costGridIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<CellaCosto[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("listino_griglia")
        .select("id, prezzo_acquisto, supplier_product_line_id")
        .in("id", costGridIds);
      if (error) {
        console.warn("[useCostoPosizioneListino] listino_griglia cost fetch failed:", error.message);
        return [];
      }
      return (data ?? []).map((row: CellaCosto) => ({
        id: row.id,
        prezzo_acquisto: row.prezzo_acquisto == null ? null : Number(row.prezzo_acquisto),
        supplier_product_line_id: row.supplier_product_line_id ?? null,
      }));
    },
  });
  const cellaById = useMemo(() => new Map(costGridRows.map((r) => [r.id, r])), [costGridRows]);

  const { families, isLoading: famiglieInCaricamento } = useFamilies();
  const famigliaById = useMemo(() => new Map(families.map((f) => [f.id, f])), [families]);

  const { data: tariffe = [] } = useTariffeManodopera();
  const tariffeCosti = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => {
      // Il costo dalle tre colonne con la regola unica (lib/listino/costoTariffa).
      const costo = costoTariffa(t);
      if (costo != null) m.set(t.id, costo);
    });
    return m;
  }, [tariffe]);

  const costoPosizione = useCallback(
    (riga: RigaCostoListino): number | null => {
      const quantita = Math.max(1, Number(riga.quantita ?? 1) || 1);
      const famiglia = riga.family_id ? famigliaById.get(riga.family_id) : undefined;
      const cella = riga.listino_voce_id ? cellaById.get(riga.listino_voce_id) ?? null : null;
      if (!famiglia) {
        // Prodotto non più nel listino attivo: resta il costo della cella, se c'è.
        const acquisto = Number(cella?.prezzo_acquisto ?? 0);
        return acquisto > 0 ? acquisto * quantita : null;
      }
      const costo = calcolaCostoPosizione({
        family: famiglia,
        larghezza: riga.larghezza_mm ?? null,
        altezza: riga.altezza_mm ?? null,
        quantita,
        cella,
        selections: (riga.valori_assi ?? null) as Record<string, string> | null,
        axes: famiglia.axes,
        posaEsclusa: riga.posa_esclusa,
        tariffeCosti,
      });
      return costo.prodotto != null ? costo.prodotto + costo.posa : null;
    },
    [famigliaById, cellaById, tariffeCosti],
  );

  return { costoPosizione, inCaricamento: isFetching || famiglieInCaricamento };
}
