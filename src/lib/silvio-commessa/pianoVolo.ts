/**
 * Il piano di volo sulla commessa (1/11/2026, fase 5, lotto 5.3): le proposte che la funzione
 * `silvio-piano-volo` scrive in `silvio_piano_volo`, e la conferma o lo scarto della persona
 * (`silvio_volo_conferma`, `silvio_volo_scarta`, migrazione 20281106141000).
 *
 * Senza la migrazione la tabella non c'è: l'elenco è vuoto e sulla commessa non compare niente.
 */
import type { AzioneVolo, ProblemaVolo } from "../../../shared/silvio-commessa/pianoVolo.ts";
import { supabase } from "@/integrations/supabase/client";

interface Risposta { data: unknown; error: { message: string; code?: string } | null }
interface Query extends PromiseLike<Risposta> {
  select: (c: string) => Query;
  eq: (c: string, v: unknown) => Query;
  order: (c: string, o?: { ascending?: boolean }) => Query;
  limit: (n: number) => Query;
}
export type ClientVolo = {
  from: (t: string) => Query;
  rpc: (nome: string, argomenti: Record<string, unknown>) => PromiseLike<Risposta>;
};

const dbVero = supabase as unknown as ClientVolo;

export interface PropostaVolo {
  id: string;
  tipo: "controllo" | "sal";
  giorno: string;
  riassunto: string;
  problemi: ProblemaVolo[];
  azioni: AzioneVolo[];
  fase: string | null;
}

export async function proposteDelVolo(orderId: string, db: ClientVolo = dbVero): Promise<PropostaVolo[]> {
  const { data, error } = await db.from("silvio_piano_volo")
    .select("id, tipo, giorno, riassunto, problemi, azioni, fase:order_work_phases(name)")
    .eq("order_id", orderId).eq("stato", "aperta").order("giorno", { ascending: true }).limit(20);
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => {
    const fase = Array.isArray(r.fase) ? r.fase[0] : r.fase;
    return {
      id: r.id as string, tipo: r.tipo === "sal" ? "sal" : "controllo", giorno: String(r.giorno ?? ""), riassunto: String(r.riassunto ?? ""),
      problemi: Array.isArray(r.problemi) ? (r.problemi as ProblemaVolo[]) : [],
      azioni: Array.isArray(r.azioni) ? (r.azioni as AzioneVolo[]) : [],
      fase: (fase as { name?: string } | null)?.name ?? null,
    };
  });
}

export interface EsitoConferma {
  fatte: { indice: number; tipo: string }[];
  saltate: { indice: number; tipo: string; motivo: string }[];
}

export async function confermaVolo(id: string, indici: number[] | null, db: ClientVolo = dbVero): Promise<EsitoConferma> {
  const { data, error } = await db.rpc("silvio_volo_conferma", { p_id: id, p_indici: indici });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<EsitoConferma>;
  return { fatte: d.fatte ?? [], saltate: d.saltate ?? [] };
}

export async function scartaVolo(id: string, db: ClientVolo = dbVero): Promise<void> {
  const { error } = await db.rpc("silvio_volo_scarta", { p_id: id });
  if (error) throw new Error(error.message);
}

/** Come si legge un'azione pronta, in una riga. */
export function azioneInParole(a: AzioneVolo): string {
  switch (a.tipo) {
    case "assegna_persona": return `Assegna ${a.nome}: ${a.motivo}`;
    case "prenota_mezzo": return `Prenota ${a.nome}: ${a.motivo}`;
    case "attivita": return a.titolo;
    case "sal_bozza": return `SAL n. ${a.numero} in bozza, ${a.importo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`;
  }
}
