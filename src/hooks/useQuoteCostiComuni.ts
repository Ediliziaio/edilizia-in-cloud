// src/hooks/useQuoteCostiComuni.ts
// La quota dei costi comuni di ogni commessa dentro una generale: i costi registrati sulla
// generale (terreno, oneri, costi generali di cantiere) divisi con la stessa regola del piano
// economico e del modulo Unità, col criterio scelto per la generale. Calcolata in lettura.
import { useMemo } from "react";
import { useCostiSullaGenerale, useCriterioRipartizione } from "@/hooks/useCommesseGenerali";
import { useUnitaGenerale } from "@/hooks/useGeneralePiano";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { nomeCriterio, ripartisciCostiComuni, type CriterioRipartizione } from "@/lib/orders/generali/pianoConti";

export interface QuoteCostiComuni {
  /** I costi registrati sulla generale. */
  totale: number;
  criterio: CriterioRipartizione;
  /** «Ripartiti per millesimi.» e simili, da mostrare a chi legge. */
  motivo: string;
  /** Per commessa: la quota in euro e la parte (0-1). */
  perFiglia: Map<string, { importo: number; parte: number; base: number }>;
}

/** null = chi guarda non vede i costi, o la lettura non è riuscita. */
export function useQuoteCostiComuni(r: RiepilogoGenerale | null | undefined): QuoteCostiComuni | null {
  const attivo = !!r && r.permessi.costi;
  const generaleId = r?.generale.id;
  const costi = useCostiSullaGenerale(generaleId, attivo);
  const criterio = useCriterioRipartizione(generaleId);
  const figlieIds = useMemo(() => (r?.figlie ?? []).filter((f) => !f.divisa).map((f) => f.id), [r]);
  const unita = useUnitaGenerale(generaleId, figlieIds, attivo);

  return useMemo(() => {
    if (!r || !attivo || costi.data === null || costi.data === undefined) return null;
    const vive = r.figlie.filter((f) => !f.divisa);
    const rip = ripartisciCostiComuni(
      vive.map((f) => ({ id: f.id, nome: f.codice ?? f.nome, importo: f.importo })),
      unita.data ?? null,
      costi.data,
      criterio.data?.criterio ?? "auto",
    );
    return {
      totale: costi.data,
      criterio: rip.criterio,
      motivo: rip.motivo,
      perFiglia: new Map(rip.quote.map((q) => [q.figliaId, { importo: q.importo, parte: q.quota, base: q.base }])),
    };
  }, [r, attivo, costi.data, unita.data, criterio.data]);
}

export { nomeCriterio };
