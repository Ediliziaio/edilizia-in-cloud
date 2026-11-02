/**
 * La scrittura di una timbratura, una sola per la scheda «Timbra» e per il rapportino che chiude la giornata.
 * Senza campo non si perde: va nella coda del telefono con la sua ora e parte al ritorno della rete.
 * L'id nasce qui: se la risposta si perde dopo un inserimento riuscito, il secondo invio non fa un doppione.
 * Il database accetta timbrature dell'app fino a 48 ore prima (policy ct_insert).
 */
import { supabase } from "@/integrations/supabase/client";
import { syncQueue } from "./sync-queue";

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
    id: crypto.randomUUID(),
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

export function erroreDiRete(e: unknown): boolean {
  const { code, message } = (e ?? {}) as { code?: string; message?: string };
  return !code && /failed to fetch|load failed|network|connessione/i.test(message ?? "");
}

export const senzaRete = () => typeof navigator !== "undefined" && navigator.onLine === false;

export interface EsitoScrittura { inCoda: boolean }

async function inCoda(righe: Array<ReturnType<typeof rigaTimbratura>>): Promise<EsitoScrittura> {
  for (const payload of righe) await syncQueue.enqueue({ type: "timbratura", payload });
  return { inCoda: true };
}

export async function scriviTimbratura(d: DatiTimbratura): Promise<EsitoScrittura> {
  const riga = rigaTimbratura(d);
  if (senzaRete()) return inCoda([riga]);
  const { error } = await supabase.from("campo_timbrature").insert(riga);
  if (!error) return { inCoda: false };
  if (erroreDiRete(error)) return inCoda([riga]);
  throw error;
}

type RpcCambio = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

/**
 * Cambio di posto. Con la rete lo fa campo_timbra_cambio_luogo in un colpo solo;
 * senza, si mettono in coda le stesse due righe che scriverebbe lei: uscita dal posto di prima, entrata nel nuovo.
 */
export async function cambiaLuogoTimbratura(d: {
  companyId: string;
  userId: string;
  da: { orderId: string | null; sedeId: string | null };
  a: { orderId: string | null; sedeId: string | null };
  quando: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  note?: string | null;
}): Promise<EsitoScrittura> {
  const righeInCoda = () => inCoda([
    rigaTimbratura({
      companyId: d.companyId, userId: d.userId, tipo: "uscita", orderId: d.da.orderId, sedeId: d.da.sedeId,
      quando: new Date(Date.parse(d.quando) - 1000).toISOString(), note: "Cambio luogo",
    }),
    rigaTimbratura({
      companyId: d.companyId, userId: d.userId, tipo: "entrata", orderId: d.a.orderId, sedeId: d.a.sedeId,
      quando: d.quando, lat: d.lat, lng: d.lng, accuracy: d.accuracy, note: d.note,
    }),
  ]);
  if (senzaRete()) return righeInCoda();
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcCambio;
  const { error } = await rpc("campo_timbra_cambio_luogo", {
    p_order_id: d.a.orderId,
    p_sede_id: d.a.sedeId,
    p_quando: d.quando,
    p_lat: d.lat ?? null,
    p_lng: d.lng ?? null,
    p_accuracy: d.accuracy ?? null,
    p_note: d.note ?? null,
  });
  if (!error) return { inCoda: false };
  // Una risposta persa qui lascerebbe un doppio cambio: nel dubbio di rete vale solo l'errore chiaro di fetch.
  if (erroreDiRete(error)) return righeInCoda();
  throw error;
}
