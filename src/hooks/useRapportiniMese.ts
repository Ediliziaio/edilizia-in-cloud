import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { giorniDelMese, type RapportinoRiga } from "@/lib/orders/rapportiniMese";

// campo_rapportini si legge col client senza tipi, come gli altri lettori dei rapportini.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const PAGINA = 1000;

const CAMPI = [
  "id, order_id, data_lavoro, stato, approvato, ore_lavorate, ore_straordinario, presenze, descrizione_lavori, note, meteo",
  "foto_urls, fasi_lavorate, materiali_usati, mezzi_usati, campi_extra, motivo_rifiuto, lavoro_completato",
  "firma_cliente_url, firma_cliente_nome, source, created_at, ufficio_created_by, pdf_url",
  // Per approvare e rifiutare dal popup: chi l'ha scritto e la versione letta.
  "user_id, updated_at",
  // Più relazioni verso profiles: la chiave va detta.
  "order:orders!campo_rapportini_order_id_fkey(order_code, client_name, description, work_address, deleted_at)",
  "operaio:profiles!campo_rapportini_user_id_fkey(first_name, last_name)",
  "dipendente:employees!campo_rapportini_ufficio_employee_id_fkey(first_name, last_name)",
].join(", ");

export interface RapportinoCompleto extends RapportinoRiga {
  user_id?: string | null;
  updated_at?: string | null;
  note?: string | null;
  meteo?: string | null;
  fasi_lavorate?: unknown;
  materiali_usati?: unknown;
  mezzi_usati?: unknown;
  campi_extra?: unknown;
  motivo_rifiuto?: string | null;
  lavoro_completato?: boolean | null;
  firma_cliente_url?: string | null;
  firma_cliente_nome?: string | null;
  source?: string | null;
  created_at?: string | null;
  ufficio_created_by?: string | null;
  pdf_url?: string | null;
  order?: (RapportinoRiga["order"] & { work_address?: string | null; deleted_at?: string | null }) | null;
}

/**
 * I rapportini di un mese. PostgREST restituisce al massimo mille righe: si legge
 * a pagine. Il costo si chiede solo a chi può vederlo. Le commesse nel cestino non
 * sono cantieri al lavoro, e una commessa che l'utente non può vedere non si elenca.
 */
export async function leggiRapportiniMese(companyId: string, mese: string, conCosti: boolean): Promise<RapportinoCompleto[]> {
  const giorni = giorniDelMese(mese);
  const campi = conCosti ? `${CAMPI}, costo_manodopera` : CAMPI;
  const righe: RapportinoCompleto[] = [];
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await db
      .from("campo_rapportini")
      .select(campi)
      .eq("company_id", companyId)
      .gte("data_lavoro", giorni[0])
      .lte("data_lavoro", giorni[giorni.length - 1])
      .order("data_lavoro", { ascending: false })
      .order("id")
      .range(da, da + PAGINA - 1);
    if (error) throw error;
    righe.push(...((data ?? []) as RapportinoCompleto[]));
    if (!data || data.length < PAGINA) break;
  }
  return righe.filter((r) => r.order && !r.order.deleted_at);
}

export function useRapportiniMese(companyId: string | null | undefined, mese: string, conCosti: boolean) {
  return useQuery({
    queryKey: ["commesse-rapportini", companyId, mese, conCosti],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: () => leggiRapportiniMese(companyId!, mese, conCosti),
  });
}

/** phase_id → nome, per i rapportini vecchi che hanno solo l'id della fase. */
export function useNomiFasiCommessa(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ["commesse-rapportini-fasi", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async (): Promise<ReadonlyMap<string, string>> => {
      const { data, error } = await db.from("order_work_phases").select("id, name").eq("order_id", orderId);
      if (error) throw error;
      return new Map(((data ?? []) as { id: string; name: string | null }[]).map((f) => [f.id, f.name ?? ""] as const));
    },
  });
}
