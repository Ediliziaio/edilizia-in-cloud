// Le colonne di campo_rapportini leggibili da tutti: tutte tranne i soldi.
// costo_manodopera e presenze_registrate si leggono solo con rapportini_costi (leggiCostiRapportini),
// che li dà a chi ha il permesso. Una colonna nuova va aggiunta qui e al GRANT per colonna del database.
// Il cast tiene i tipi di «*»: il parser dei tipi non segue una stringa costruita.
import { supabase } from "@/integrations/supabase/client";

const COLONNE = "id, company_id, order_id, user_id, role_type, data_lavoro, ore_lavorate, descrizione_lavori, materiali_usati, foto_urls, lavoro_completato, percentuale_avanzamento, gps_lat, gps_lng, gps_accuracy, meteo, note, firma_cliente_url, firma_cliente_nome, firma_cliente_at, ticket_aperto_id, approvato, approvato_da, approvato_at, created_at, updated_at, stato, pdf_url, firma_operaio_url, ore_straordinario, motivo_rifiuto, source, fasi_lavorate, costo_registrato_at, presenze, ufficio_employee_id, ufficio_created_by, mezzi_usati, campi_extra, annullato_at, annullato_da";

export const COLONNE_RAPPORTINO = COLONNE as string as "*";
export const COLONNE_RAPPORTINO_CON_AUTORE = `${COLONNE}, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)` as string as "*, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)";

export interface CostoRapportino {
  id: string;
  order_id: string;
  data_lavoro: string;
  stato: string | null;
  costo_manodopera: number | null;
  presenze_registrate: unknown;
}

const PAGINA = 1000;

/** I costi dei rapportini nel periodo. Senza permesso costi: importi vuoti, ore sì. */
export async function leggiCostiRapportini(filtro: { da?: string; a?: string; orderId?: string; employeeId?: string }): Promise<CostoRapportino[]> {
  // La funzione non è ancora nei tipi generati.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const righe: CostoRapportino[] = [];
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await db.rpc("rapportini_costi", {
      p_da: filtro.da ?? null, p_a: filtro.a ?? null, p_order_id: filtro.orderId ?? null, p_employee_id: filtro.employeeId ?? null,
    }).order("id").range(da, da + PAGINA - 1);
    if (error) throw error;
    righe.push(...((data ?? []) as CostoRapportino[]));
    if (!data || data.length < PAGINA) break;
  }
  return righe;
}
