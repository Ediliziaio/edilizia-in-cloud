/**
 * Versamenti fiscali e contributivi dell'anno: per ogni scadenza F24 quello che spetta (cedolini,
 * IVA, imposte stimate, F24 registrati) e quello che è uscito dalla banca.
 * RPC cg_get_versamenti_fiscali (migrazioni 20290401210000-20290401230000).
 */
import { useQuery } from "@tanstack/react-query";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

export type StatoVersamento = "pagato" | "parziale" | "non_trovato" | "da_venire" | "non_verificabile";

export interface VoceVersamento {
  voce: string;
  importo: number;
  fonte: "cedolini" | "F24 registrato" | "registri IVA" | "stima" | string;
}

export interface ScadenzaVersamento {
  scadenza: string;
  voci: VoceVersamento[];
  atteso: number;
  pagato_banca: number;
  pagato_f24: number;
  stato: StatoVersamento;
}

export interface VersamentiFiscali {
  anno: number;
  conti_bancari: boolean;
  f24_non_classificati: number;
  imposte_anno_prima: number;
  acconti_anno_prima_in_banca: number;
  scadenze: ScadenzaVersamento[];
}

export function useVersamentiFiscali(anno: number) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "versamenti-fiscali", anno, companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<VersamentiFiscali> => {
      const { data, error } = await cgRpc<VersamentiFiscali>("cg_get_versamenti_fiscali", { p_anno: anno });
      if (error) throw error;
      return data as VersamentiFiscali;
    },
    staleTime: 5 * 60_000,
  });
}

/** Scadenze passate senza pagamento trovato, e quanto manca in tutto. */
export function riepilogoVersamenti(scadenze: ScadenzaVersamento[]) {
  const scadute = scadenze.filter((s) => s.stato !== "da_venire");
  const mancante = scadute.reduce(
    (t, s) => t + Math.max(s.atteso - Math.max(s.pagato_banca, s.pagato_f24), 0), 0);
  return {
    scadute: scadute.length,
    pagate: scadute.filter((s) => s.stato === "pagato").length,
    nonTrovate: scadute.filter((s) => s.stato === "non_trovato").length,
    parziali: scadute.filter((s) => s.stato === "parziale").length,
    mancante: Math.round(mancante * 100) / 100,
  };
}
