import { leggiCostiRapportini } from "@/lib/campo/colonneRapportino";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { giorniDelMese, type RapportinoRiga } from "@/lib/orders/rapportiniMese";
import type { IntervalloRapportini } from "@/lib/orders/periodoRapportini";

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
  "order:orders!campo_rapportini_order_id_fkey(order_code, client_name, client_email, client_address, description, work_address, deleted_at)",
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
  order?: (RapportinoRiga["order"] & { client_email?: string | null; client_address?: string | null; work_address?: string | null; deleted_at?: string | null }) | null;
}

/**
 * I rapportini di un mese. PostgREST restituisce al massimo mille righe: si legge
 * a pagine. Il costo si chiede solo a chi può vederlo. Le commesse nel cestino non
 * sono cantieri al lavoro, e una commessa che l'utente non può vedere non si elenca.
 */
export async function leggiRapportiniMese(companyId: string, periodo: string | IntervalloRapportini, conCosti: boolean, signal?: AbortSignal): Promise<RapportinoCompleto[]> {
  const giorni = typeof periodo === "string" ? giorniDelMese(periodo) : null;
  const intervallo = giorni ? { da: giorni[0], a: giorni[giorni.length - 1] } : periodo as IntervalloRapportini;
  const righe: RapportinoCompleto[] = [];
  for (let da = 0; ; da += PAGINA) {
    if (signal?.aborted) throw new DOMException("Lettura annullata", "AbortError");
    let query = db
      .from("campo_rapportini")
      .select(CAMPI)
      .eq("company_id", companyId)
      .is("annullato_at", null);
    if (intervallo.da) query = query.gte("data_lavoro", intervallo.da);
    if (intervallo.a) query = query.lte("data_lavoro", intervallo.a);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query
      .order("data_lavoro", { ascending: false })
      .order("id")
      .range(da, da + PAGINA - 1);
    if (error) throw error;
    righe.push(...((data ?? []) as RapportinoCompleto[]));
    if (!data || data.length < PAGINA) break;
  }
  if (conCosti) {
    const costi = new Map((await leggiCostiRapportini(intervallo)).map((c) => [c.id, c.costo_manodopera]));
    for (const r of righe) r.costo_manodopera = costi.get(r.id) ?? null;
  }
  return righe.filter((r) => r.order && !r.order.deleted_at);
}

export function useRapportiniMese(companyId: string | null | undefined, periodo: string | IntervalloRapportini | null, conCosti: boolean) {
  return useQuery({
    queryKey: ["commesse-rapportini", companyId, periodo, conCosti],
    enabled: !!companyId && periodo !== null,
    staleTime: 30_000,
    queryFn: ({ signal }) => leggiRapportiniMese(companyId!, periodo!, conCosti, signal),
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
