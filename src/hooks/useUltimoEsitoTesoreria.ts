/**
 * L'ultimo esito degli incassi e giroconti dalla banca (Impostazioni → Automazioni):
 * quanti movimenti «unico e verificato» aspettano, l'ultima conferma o l'ultimo errore.
 * Lo legge chi vede la tesoreria (`tesoreria_stato_automatismo`): agli altri dice «nessun esito».
 */
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { UltimoEsito } from "@/components/settings/automazioni/registroAutomatismi";

export interface StatoTesoreria {
  in_attesa: number;
  ultima_conferma_il: string | null;
  ultima_conferma: "confermato_auto" | "confermato_clic" | null;
  ultimo_errore_il: string | null;
  ultimo_errore: string | null;
}

type Db = {
  public: {
    Tables: {};
    Views: {};
    Functions: { tesoreria_stato_automatismo: { Args: { p_company: string }; Returns: StatoTesoreria | null } };
  };
};
const db = supabase as unknown as SupabaseClient<Db>;

export function testoUltimoEsitoTesoreria(stato: StatoTesoreria | null | undefined): UltimoEsito | null {
  if (!stato) return null;
  if (stato.ultimo_errore_il)
    return { quando: stato.ultimo_errore_il, testo: "L'ultima conferma automatica non è riuscita: apri la tesoreria per vedere il movimento", tono: "errore" };
  if (stato.in_attesa > 0)
    return {
      quando: stato.ultima_conferma_il,
      testo: stato.in_attesa === 1 ? "1 movimento certo aspetta la conferma" : `${stato.in_attesa} movimenti certi aspettano la conferma`,
      tono: "attenzione",
    };
  if (!stato.ultima_conferma_il) return null;
  return {
    quando: stato.ultima_conferma_il,
    testo: stato.ultima_conferma === "confermato_auto" ? "Ultimo movimento collegato da solo" : "Ultimo movimento confermato con un clic",
    tono: "ok",
  };
}

export function useUltimoEsitoTesoreria(companyId: string): UltimoEsito | null | undefined {
  const { data } = useQuery({
    queryKey: ["ultimo-esito-tesoreria", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data: stato, error } = await db.rpc("tesoreria_stato_automatismo", { p_company: companyId });
      if (error) return null;
      return testoUltimoEsitoTesoreria(stato);
    },
  });
  return data;
}
