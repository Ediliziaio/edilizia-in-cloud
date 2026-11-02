/** La scrittura di una timbratura, una sola per la scheda «Timbra» e per il rapportino che chiude la giornata. */
import { supabase } from "@/integrations/supabase/client";

export type TipoTimbratura = "entrata" | "uscita" | "pausa_inizio" | "pausa_fine";

export interface DatiTimbratura {
  companyId: string;
  userId: string;
  tipo: TipoTimbratura;
  orderId: string | null;
  sedeId?: string | null;
  quando: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  note?: string | null;
}

export function rigaTimbratura(d: DatiTimbratura) {
  return {
    company_id: d.companyId,
    user_id: d.userId,
    order_id: d.orderId,
    sede_id: d.sedeId ?? null,
    in_sede: !!d.sedeId,
    tipo: d.tipo,
    timestamp_evento: d.quando,
    gps_lat: d.lat ?? null,
    gps_lng: d.lng ?? null,
    gps_accuracy: d.accuracy ?? null,
    note: d.note ?? null,
    fonte: "app",
  };
}

export async function scriviTimbratura(d: DatiTimbratura): Promise<void> {
  const { error } = await supabase.from("campo_timbrature").insert(rigaTimbratura(d));
  if (error) throw error;
}
