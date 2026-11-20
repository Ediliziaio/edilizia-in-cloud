import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import type { CollegamentoCassa } from "../../shared/cassaInCloud";

export const ARCHIVIO_CASSA = "/azienda/documenti/scontrini";
export const IMPOSTAZIONI_CASSA = "/azienda/impostazioni/fatturazione?tab=cassa";
export const chiaveQueryCassa = (companyId: string) => ["cassa-in-cloud", companyId] as const;

export async function invocaCassa<T>(
  companyId: string,
  action: "stato" | "verifica" | "collega" | "scollega" | "importa",
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

export function useCollegamentiCassa(companyId: string) {
  return useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "collegamenti"],
    queryFn: async ({ signal }) =>
      (await invocaCassa<{ collegamenti: CollegamentoCassa[] }>(companyId, "stato", {}, signal)).collegamenti,
    staleTime: 30_000,
  });
}
