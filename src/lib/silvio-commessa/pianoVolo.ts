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
export type ClientVolo = {
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

/**
 * Le proposte aperte della commessa, dalla RPC `silvio_volo_della_commessa` (revisione 1/11,
 * S5): la tabella non si legge più direttamente, perché chi non ha «Importi di vendita» non
 * deve vedere l'importo del SAL (torna null).
 */
export async function proposteDelVolo(orderId: string, db: ClientVolo = dbVero): Promise<PropostaVolo[]> {
  const { data, error } = await db.rpc("silvio_volo_della_commessa", { p_order_id: orderId });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, tipo: r.tipo === "sal" ? "sal" : "controllo", giorno: String(r.giorno ?? ""), riassunto: String(r.riassunto ?? ""),
    problemi: Array.isArray(r.problemi) ? (r.problemi as ProblemaVolo[]) : [],
    azioni: Array.isArray(r.azioni) ? (r.azioni as AzioneVolo[]) : [],
    fase: typeof r.fase === "string" ? r.fase : null,
  }));
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
    case "sal_bozza": {
      const importo = a.importo as number | null;
      return typeof importo === "number"
        ? `SAL n. ${a.numero} in bozza, ${importo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`
        : `SAL n. ${a.numero} in bozza (l'importo lo vede chi ha «Importi di vendita»)`;
    }
  }
}
