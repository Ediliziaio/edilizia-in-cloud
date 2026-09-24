import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { leggiStatoPubblicazione, type StatoPubblicazioneSocial } from "@/lib/social/statoPubblicazione";

/**
 * Stato vero delle pagine social: chi può pubblicare adesso e perché no.
 *
 * Chi ha collegato Meta prima che il collegamento salvasse i permessi ha le
 * pagine «da verificare»: allora si chiedono a Meta una volta (meta-api-proxy
 * «get-permissions», che li salva) e si rilegge lo stato. Una volta per
 * integrazione e per sessione: non a ogni apertura della pagina.
 */

const verificheFatte = new Set<string>();

function giaVerificata(integrazioneId: string): boolean {
  if (verificheFatte.has(integrazioneId)) return true;
  try {
    return sessionStorage.getItem(`social-permessi-verificati:${integrazioneId}`) === "1";
  } catch {
    return false;
  }
}

function segnaVerificata(integrazioneId: string) {
  verificheFatte.add(integrazioneId);
  try {
    sessionStorage.setItem(`social-permessi-verificati:${integrazioneId}`, "1");
  } catch {
    /* sessionStorage non disponibile: basta il Set in memoria */
  }
}

export const chiaveStatoPubblicazione = (companyId: string | undefined) =>
  ["social-manager", "stato-pubblicazione", companyId] as const;

export function useStatoPubblicazioneSocial(companyId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveStatoPubblicazione(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<StatoPubblicazioneSocial> => {
      const { data, error } = await supabase.rpc(
        "stato_pubblicazione_social" as never,
        { p_company_id: companyId } as never,
      );
      if (error) throw error;
      return leggiStatoPubblicazione(data);
    },
  });

  // «In verifica» finché lo stato non è riletto: niente lampo di «non riuscita» nel mezzo.
  const verifica = useMutation({
    mutationFn: async (integrazioneId: string) => {
      try {
        await supabase.functions.invoke("meta-api-proxy", {
          body: { action: "get-permissions", company_id: companyId, integration_id: integrazioneId },
        });
      } catch {
        /* l'esito si legge dallo stato: se resta «da verificare», la verifica non è riuscita */
      }
      await qc.invalidateQueries({ queryKey: chiaveStatoPubblicazione(companyId) });
    },
  });
  const { mutate: avviaVerifica, isPending: staVerificando } = verifica;

  const integrazioneId = query.data?.integrazione?.id ?? null;
  const daVerificare = Boolean(
    integrazioneId
      && query.data?.integrazione?.permessiNoti === false
      && query.data?.pagine.some((p) => p.motivo === "permessi_da_verificare"),
  );

  useEffect(() => {
    if (!companyId || !integrazioneId || !daVerificare || giaVerificata(integrazioneId)) return;
    segnaVerificata(integrazioneId);
    avviaVerifica(integrazioneId);
  }, [avviaVerifica, companyId, daVerificare, integrazioneId]);

  return {
    stato: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    riprova: query.refetch,
    staVerificando,
    // Chiesto a Meta in questa sessione e ancora sconosciuto: token non valido o Meta muto.
    verificaNonRiuscita: daVerificare && !staVerificando && integrazioneId != null && giaVerificata(integrazioneId),
  };
}
