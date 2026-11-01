/**
 * «Effetto sul prezzo»: mentre si modifica una pianta, di quanto cambiano i computi che ne
 * hanno preso le misure («Prendi dalla pianta»). Si confronta la quantità salvata in ogni riga
 * con quella che la pianta darebbe adesso, e la differenza si moltiplica per il prezzo della voce.
 *
 * Non scrive niente: le righe si aggiornano dal computo dopo il salvataggio, come sempre
 * («La pianta è cambiata» → «Aggiorna le quantità», o perizia di variante se è contrattuale).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MappaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { arrotondaDecimale, ePercentuale } from "@/lib/computo/editorNativo";
import { valoreChiavi } from "./computo";

export interface RigaCollegata {
  id: string;
  descrizione: string | null;
  quantita: number | null;
  chiavi: string[];
  voce: {
    id: string;
    descrizione: string | null;
    unita: string | null;
    prezzo: number | null;
    detrazione: boolean;
  };
  computo: { id: string; titolo: string; stato: string; orderId: string | null };
}

export interface VariazioneRiga {
  riga: RigaCollegata;
  vecchia: number;
  nuova: number;
  differenza: number;
  /** Euro in più (o in meno) per questa riga; null se la voce non ha prezzo. */
  importo: number | null;
  mancanti: string[];
}

export interface EffettoComputo {
  computo: RigaCollegata["computo"];
  righe: VariazioneRiga[];
  totale: number;
  /** Righe cambiate su voci senza prezzo: il totale non le conta. */
  senzaPrezzo: number;
}

export function effettoSulPrezzo(righe: readonly RigaCollegata[], mappa: MappaQuantita): EffettoComputo[] {
  const perComputo = new Map<string, EffettoComputo>();
  for (const r of righe) {
    const { valore, mancanti } = valoreChiavi(mappa, r.chiavi, r.voce.detrazione);
    const vecchia = Number(r.quantita ?? 0);
    const differenza = arrotondaDecimale(valore - vecchia);
    if (differenza === 0 && !mancanti.length) continue;
    const importo = r.voce.prezzo == null ? null : arrotondaDecimale((differenza * r.voce.prezzo) / (ePercentuale(r.voce.unita ?? "") ? 100 : 1));
    const e = perComputo.get(r.computo.id) ?? { computo: r.computo, righe: [], totale: 0, senzaPrezzo: 0 };
    e.righe.push({ riga: r, vecchia, nuova: valore, differenza, importo, mancanti });
    if (importo == null) e.senzaPrezzo++;
    else e.totale = arrotondaDecimale(e.totale + importo);
    perComputo.set(r.computo.id, e);
  }
  return [...perComputo.values()].sort((a, b) => Math.abs(b.totale) - Math.abs(a.totale));
}

/** Le righe di computo legate a questa pianta (qualunque versione), con voce e computo. */
export function useRigheCollegate(planimetriaId: string | null | undefined) {
  return useQuery({
    queryKey: ["planimetrie", "righe-collegate", planimetriaId],
    enabled: !!planimetriaId,
    staleTime: 60_000,
    queryFn: async (): Promise<RigaCollegata[]> => {
      const { data, error } = await supabase
        .from("computo_voci_misure")
        .select("id, descrizione, quantita, planimetria_chiavi, voce:computo_voci_estratte!inner(id, descrizione_breve, unita_misura, prezzo_unitario_computo, prezzo_unitario_impresa, is_detrazione, computo:computo_uploads!inner(id, titolo, file_name, stato, order_id))" as never)
        .eq("planimetria_id" as never, planimetriaId as never)
        .limit(2000);
      if (error) throw new Error("Computi collegati non disponibili.");
      type Grezza = {
        id: string; descrizione: string | null; quantita: number | null; planimetria_chiavi: string[] | null;
        voce: { id: string; descrizione_breve: string | null; unita_misura: string | null; prezzo_unitario_computo: number | null; prezzo_unitario_impresa: number | null; is_detrazione: boolean | null;
          computo: { id: string; titolo: string | null; file_name: string | null; stato: string; order_id: string | null } };
      };
      return ((data ?? []) as unknown as Grezza[])
        .filter((r) => r.planimetria_chiavi?.length)
        .map((r) => ({
          id: r.id,
          descrizione: r.descrizione,
          quantita: r.quantita,
          chiavi: r.planimetria_chiavi!,
          voce: {
            id: r.voce.id,
            descrizione: r.voce.descrizione_breve,
            unita: r.voce.unita_misura,
            prezzo: r.voce.prezzo_unitario_impresa ?? r.voce.prezzo_unitario_computo,
            detrazione: !!r.voce.is_detrazione,
          },
          computo: { id: r.voce.computo.id, titolo: r.voce.computo.titolo || r.voce.computo.file_name || "Computo", stato: r.voce.computo.stato, orderId: r.voce.computo.order_id },
        }));
    },
  });
}
