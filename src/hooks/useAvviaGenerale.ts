// src/hooks/useAvviaGenerale.ts
// Creare una generale già pronta da riempire: la generale, le unità e il piano con le voci tipiche.
// Sono tre passi: se uno dei due facoltativi non riesce la generale resta e chi chiama lo dice;
// unità e piano si possono sempre fare dalla pagina della generale.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreaGenerale, type NuovaGenerale } from "@/hooks/useCommesseGenerali";
import { annotaStimeDiPartenza, vocePerDb } from "@/hooks/useGeneralePiano";
import type { VoceNuova } from "@/lib/orders/generali/pianoCategorie";
import type { UnitaDaCreare } from "@/lib/orders/generali/unitaSerie";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface AvvioGenerale {
  nuova: NuovaGenerale;
  unita: UnitaDaCreare[];
  /** null = il piano si scrive dopo. */
  voci: VoceNuova[] | null;
  /** Dati della scheda «Dati» chiesti alla creazione (indirizzo, date, sezioni della tipologia). */
  dati?: Record<string, unknown> | null;
}

export function useAvviaGenerale() {
  const crea = useCreaGenerale();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nuova, unita, voci, dati }: AvvioGenerale): Promise<{ id: string; rimasti: ("unita" | "piano" | "dati")[] }> => {
      const id = await crea.mutateAsync(nuova);
      const rimasti: ("unita" | "piano" | "dati")[] = [];
      if (dati && Object.keys(dati).length > 0) {
        const { error } = await db.rpc("commessa_generale_dati_salva", { p_generale_id: id, p_dati: dati });
        if (error) rimasti.push("dati");
      }
      if (unita.length > 0) {
        const { error } = await db.rpc("generale_unita_serie", { p_generale_id: id, p_righe: unita });
        if (error) rimasti.push("unita");
      }
      if (voci) {
        const { data, error } = await db.rpc("generale_piano_nuova_versione", {
          p_generale_id: id,
          p_voci: voci.map((v, i) => vocePerDb(v, (i + 1) * 10)),
        });
        if (error || typeof data !== "string") rimasti.push("piano");
        else {
          try { await annotaStimeDiPartenza(data, voci); }
          catch { rimasti.push("piano"); }
        }
      }
      return { id, rimasti };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["mappa-commesse-generali"] });
      void qc.invalidateQueries({ queryKey: ["commesse-generali-per-modello"] });
    },
  });
}
