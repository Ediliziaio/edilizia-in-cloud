import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { GiornaleRiga } from "@/lib/orders/documentiCantiere";
import type { IntervalloRapportini } from "@/lib/orders/periodoRapportini";

const db = supabase as unknown as SupabaseClient;
const CAMPI =
  "id, order_id, data_lavori, stato, lavorazioni_eseguite, personale_presente, giornale_foto(id), order:orders!giornale_lavori_order_id_fkey(order_code, client_name, description, deleted_at)";

/** Un collegamento dall'elenco può puntare oltre le prime 200 pagine del diario. */
export async function leggiPaginaGiornale(
  companyId: string,
  paginaId: string,
  orderId?: string,
  signal?: AbortSignal,
): Promise<GiornaleRiga | null> {
  let q = db
    .from("giornale_lavori")
    .select("*, giornale_foto(id, url, storage_path)")
    .eq("company_id", companyId)
    .eq("id", paginaId);
  if (orderId) q = q.eq("order_id", orderId);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data as GiornaleRiga | null;
}

export async function leggiGiornaliPeriodo(
  companyId: string,
  periodo: IntervalloRapportini,
  signal?: AbortSignal,
): Promise<GiornaleRiga[]> {
  const righe: GiornaleRiga[] = [];
  for (let da = 0; ; da += 1000) {
    if (signal?.aborted)
      throw new DOMException("Lettura annullata", "AbortError");
    let q = db
      .from("giornale_lavori")
      .select(CAMPI)
      .eq("company_id", companyId);
    if (periodo.da) q = q.gte("data_lavori", periodo.da);
    if (periodo.a) q = q.lte("data_lavori", periodo.a);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q
      .order("data_lavori", { ascending: false })
      .order("id")
      .range(da, da + 999);
    if (error) throw error;
    righe.push(...((data ?? []) as unknown as GiornaleRiga[]));
    if (!data || data.length < 1000) break;
  }
  return righe.filter((r) => r.order && !r.order.deleted_at);
}

export function useGiornaliPeriodo(
  companyId: string | undefined,
  periodo: IntervalloRapportini | null,
  consentito: boolean,
) {
  return useQuery({
    queryKey: ["commesse-giornali", companyId, periodo],
    enabled: !!companyId && periodo !== null && consentito,
    // Tornando dal giornale devono apparire subito le correzioni e le firme.
    staleTime: 0,
    queryFn: ({ signal }) => leggiGiornaliPeriodo(companyId!, periodo!, signal),
  });
}
