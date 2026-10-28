import { useQuery, useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import { leggiRiesameProprioPos } from "@/lib/sicurezza/posRiesameProprio";

export function useRiesameProprioPos(
  company: string,
  ordine: string,
  id: string,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["pos-riesame-proprio", company, ordine, id],
    enabled: !!company && !!ordine && !!id && p.canViewSicurezzaCantiere,
    staleTime: 0,
    refetchInterval: 30000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "pos_riesame_proprio" as never,
        {
          _company: company,
          _ordine: ordine,
          _riesame: id,
        } as never,
      );
      if (error) throw new Error(error.message);
      return leggiRiesameProprioPos(data, company, ordine, id);
    },
  });
}

/** Each selected immutable source is checked independently; a failing source is never an empty list. */
export function useRiesamiPropriPos(
  company: string,
  ordine: string,
  ids: string[],
  enabled: boolean,
) {
  const p = usePermissions();
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["pos-riesame-proprio", company, ordine, id],
      enabled:
        enabled && !!company && !!ordine && !!id && p.canViewSicurezzaCantiere,
      staleTime: 0,
      refetchInterval: 30000,
      retry: false,
      queryFn: async () => {
        const { data, error } = await supabase.rpc(
          "pos_riesame_proprio" as never,
          { _company: company, _ordine: ordine, _riesame: id } as never,
        );
        if (error) throw new Error(error.message);
        return leggiRiesameProprioPos(data, company, ordine, id);
      },
    })),
  });
}

export async function apriOriginaleRiesamePos(
  company: string,
  ordine: string,
  riesame: string,
  persona: string,
  documento: string,
  impronta: string,
) {
  const finestra = window.open("about:blank", "_blank");
  if (!finestra)
    throw new Error("Consenti l’apertura di una nuova scheda e riprova.");
  finestra.opener = null;
  try {
    const { chiamaServerPos } = await import("./usePos");
    const result = await chiamaServerPos<{ url: string }>({
      azione: "apri_originale_addetto",
      company_id: company,
      order_id: ordine,
      riesame_id: riesame,
      persona_id: persona,
      documento_id: documento,
      impronta,
    });
    const url = new URL(result.url);
    if (
      url.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin ||
      !decodeURIComponent(url.pathname).startsWith(
        `/storage/v1/object/sign/hr-documenti/${company}/${persona}/`,
      )
    )
      throw new Error("Indirizzo dell’originale formativo non valido.");
    finestra.location.href = url.href;
  } catch (e) {
    finestra.close();
    throw e;
  }
}
