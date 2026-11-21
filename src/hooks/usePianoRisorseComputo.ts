import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { leggiPianoRisorse, proponiRisorseComputo, unisciProposteRisorse } from "@/lib/distinta/proposteRisorseComputo";
import { salvaPianoRisorse, type ArchivioRisorse } from "@/lib/distinta/salvaPianoRisorse";
import { generaDistinta, type Scomposizione } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { capitoloVoce, propostaFasi } from "@/lib/distinta/fasiMateriali";
import { eNonLavoro } from "@/lib/computo/vociNonLavori";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import { leggiPaginePiano } from "@/lib/distinta/leggiPaginePiano";

export function archivioRisorseComputo(companyId: string, orderId: string, computoId: string): ArchivioRisorse {
  const ambito = () => supabase.from("computo_uploads").select("raw_extracted_json, updated_at")
    .eq("id", computoId).eq("order_id", orderId).eq("company_id", companyId);
  return {
    leggi: async () => {
      const { data, error } = await ambito().single();
      if (error) throw error;
      return { raw: data.raw_extracted_json, updated_at: data.updated_at };
    },
    scrivi: async (raw, updatedAt) => {
      let q = supabase.from("computo_uploads").update({ raw_extracted_json: raw as Json })
        .eq("id", computoId).eq("order_id", orderId).eq("company_id", companyId);
      q = updatedAt ? q.eq("updated_at", updatedAt) : q.is("updated_at", null);
      const { data, error } = await q.select("id");
      if (error) throw error;
      return !!data?.length;
    },
  };
}
export { salvaPianoRisorse };

export function usePianoRisorseComputo(companyId: string, orderId: string, computoId: string | undefined, voci: VoceComputo[] | undefined) {
  return useQuery({
    queryKey: ["piano-risorse-computo", companyId, orderId, computoId],
    enabled: !!companyId && !!orderId && !!computoId && !!voci,
    staleTime: 30_000,
    queryFn: async () => {
      const [archivio, fasi, sottofasi, ricette] = await Promise.all([
        archivioRisorseComputo(companyId, orderId, computoId!).leggi(),
        leggiPaginePiano<{ id: string; name: string }>((da, a) => supabase.from("order_work_phases")
          .select("id,name").eq("order_id", orderId).eq("company_id", companyId).order("id").range(da, a)),
        leggiPaginePiano<{ subphase_id: string | null; origine_id: string | null; phase_id: string }>((da, a) => supabase.from("order_work_phase_voci")
          .select("subphase_id,origine_id,phase_id").eq("order_id", orderId).eq("company_id", companyId).order("id").range(da, a)),
        leggiPaginePiano<Scomposizione>((da, a) => supabase.from("scomposizioni_voce")
          .select("id,nome,codice_prezzario,codice_standard,parole_chiave,unita_misura,categoria,attiva,componenti:scomposizioni_voce_componenti(descrizione,specifiche,unita_misura,quantita_per_unita,sfrido_percentuale,categoria,article_template_id,supplier_id)")
          .eq("company_id", companyId).eq("attiva", true).order("id").range(da, a)),
      ]);
      const lavori = (voci ?? []).filter(v => !eNonLavoro([v.super_categoria, v.categoria, v.sotto_categoria], v.descrizione_breve));
      const mappa = propostaFasi(lavori, fasi);
      const faseDi = (v: Parameters<typeof capitoloVoce>[0]) => sottofasi.find(s => s.origine_id === v.id)?.phase_id ?? mappa.get(capitoloVoce(v)) ?? null;
      const distinta = generaDistinta({ voci: lavori, scomposizioni: ricette, riserva: catalogoComeScomposizioni(), faseVoce: faseDi });
      const generate = proponiRisorseComputo(lavori, { faseDi,
        sottofasi: sottofasi.flatMap(s => s.subphase_id ? [{ id: s.subphase_id, computo_voce_id: s.origine_id }] : []),
        senzaRicetta: distinta.senzaScomposizione });
      const salvato = leggiPianoRisorse(archivio.raw, { companyId, orderId, computoId: computoId! });
      return { proposte: unisciProposteRisorse(generate, salvato?.proposte ?? []), salvato, fasi };
    },
  });
}
