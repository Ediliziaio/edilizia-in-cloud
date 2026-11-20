import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import type { CollegamentoCassa } from "../../shared/cassaInCloud";
import type { ConfrontoCassa, PropostaCassa } from "../../shared/cassaInCloud";

export const ARCHIVIO_CASSA = "/azienda/documenti/scontrini";
export const CHIUSURE_CASSA = `${ARCHIVIO_CASSA}?tab=chiusure`;
export const IMPOSTAZIONI_CASSA = "/azienda/impostazioni/fatturazione?tab=cassa";
export const chiaveQueryCassa = (companyId: string) => ["cassa-in-cloud", companyId] as const;

export async function invocaCassa<T>(
  companyId: string,
  action: "stato" | "verifica" | "collega" | "scollega" | "importa" | "importa_chiusure"
    | "sincronizzazione" | "configurazione_webhook" | "imposta_webhook",
  dati: Record<string, string> = {},
  signal?: AbortSignal,
) {
  const { data, error } = await supabase.functions.invoke<T>("cassa-in-cloud", {
    body: { ...dati, action, company_id: companyId },
    signal,
  });
  if (error) throw new Error(await edgeErrorMessage(error, "Cassa in Cloud non disponibile."));
  return data;
}

export async function rpcCassa<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export function gruppoCassa(companyId: string, g: ConfrontoCassa) {
  return { p_company_id: companyId, p_punto: g.punto_vendita_id, p_cassa: g.cassa_id, p_giorno: g.giorno };
}

export function leggiPropostaCassa(companyId: string, g: ConfrontoCassa) {
  return rpcCassa<PropostaCassa>("cassa_in_cloud_proposta", gruppoCassa(companyId, g));
}

export function useCollegamentiCassa(companyId: string) {
  return useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "collegamenti"],
    queryFn: async ({ signal }) =>
      (await invocaCassa<{ collegamenti: CollegamentoCassa[] }>(companyId, "stato", {}, signal)).collegamenti,
    staleTime: 30_000,
  });
}
