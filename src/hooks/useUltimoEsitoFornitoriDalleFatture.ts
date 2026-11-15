/**
 * L'ultimo esito dei fornitori creati dalle fatture, per la riga in Impostazioni → Automazioni:
 * i cedenti che aspettano in Fornitori → «Rivedi e crea», oppure l'ultimo fornitore creato da solo.
 * Conteggi da `acquisti_fornitori_automatici_stato` (migrazione 20290404309500).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { UltimoEsito } from "@/components/settings/automazioni/registroAutomatismi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface StatoFornitoriDalleFatture {
  ultimo_creato: string | null;
  creati_30_giorni: number;
  cedenti_mancanti: number;
}

export function testoUltimoEsitoFornitori(s: StatoFornitoriDalleFatture): UltimoEsito | null {
  if (s.cedenti_mancanti > 0)
    return {
      quando: s.ultimo_creato,
      testo:
        s.cedenti_mancanti === 1
          ? "1 cedente delle fatture non è in rubrica: rivedilo in Fornitori → «Rivedi e crea»"
          : `${s.cedenti_mancanti} cedenti delle fatture non sono in rubrica: rivedili in Fornitori → «Rivedi e crea»`,
      tono: "attenzione",
    };
  if (!s.ultimo_creato) return null;
  return {
    quando: s.ultimo_creato,
    testo: s.creati_30_giorni === 1 ? "1 fornitore creato da una fattura negli ultimi 30 giorni" : `${s.creati_30_giorni} fornitori creati dalle fatture negli ultimi 30 giorni`,
    tono: "ok",
  };
}

export function useUltimoEsitoFornitoriDalleFatture(companyId: string): UltimoEsito | null | undefined {
  const { data } = useQuery({
    queryKey: ["ultimo-esito-fornitori-dalle-fatture", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.rpc("acquisti_fornitori_automatici_stato", { p_company: companyId });
      if (error) return null;
      return testoUltimoEsitoFornitori(data as StatoFornitoriDalleFatture);
    },
  });
  return data;
}
