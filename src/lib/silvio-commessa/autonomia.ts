/**
 * Le impostazioni di Silvio per le commesse (1/11/2026, fase 5): cosa fa da solo e il calendario
 * di cantiere. Lettura e scrittura passano dalle RPC `silvio_autonomia_leggi` e
 * `silvio_autonomia_salva` (migrazione 20281112140000): le tabelle non si toccano dal browser.
 *
 * Senza la migrazione (o senza il permesso) la lettura restituisce il predefinito: tutto
 * «chiede» e le sole feste nazionali. Il popup funziona come nelle fasi 1–4.
 */
import {
  autonomiaDaRighe, type Autonomia, type LivelloAutonomia, type SceltaAutonomia,
} from "../../../shared/silvio-commessa/autonomia.ts";
import type { ImpostazioniCalendario } from "../../../shared/silvio-commessa/calendario.ts";
import { supabase } from "@/integrations/supabase/client";

interface Risposta { data: unknown; error: { message: string; code?: string } | null }
export type ClientAutonomia = { rpc: (nome: string, argomenti: Record<string, unknown>) => PromiseLike<Risposta> };

const dbVero = supabase as unknown as ClientAutonomia;

export interface ImpostazioniSilvio {
  autonomia: Autonomia;
  /** Le righe come le dà il database, con il massimo di ogni azione. */
  azioni: (SceltaAutonomia & { massimo: "chiede" | "da_sola" })[];
  calendario: ImpostazioniCalendario;
  /** False se le impostazioni non si sono lette: si usa il predefinito. */
  lette: boolean;
}

export const IMPOSTAZIONI_PREDEFINITE: ImpostazioniSilvio = {
  autonomia: {}, azioni: [], calendario: { calendario: null, festivita: [] }, lette: false,
};

export async function leggiImpostazioniSilvio(companyId: string, db: ClientAutonomia = dbVero): Promise<ImpostazioniSilvio> {
  try {
    const { data, error } = await db.rpc("silvio_autonomia_leggi", { p_company_id: companyId });
    if (error || !data || typeof data !== "object") return IMPOSTAZIONI_PREDEFINITE;
    const d = data as { azioni?: unknown; calendario?: unknown; festivita?: unknown };
    const azioni = (Array.isArray(d.azioni) ? d.azioni : []) as ImpostazioniSilvio["azioni"];
    return {
      autonomia: autonomiaDaRighe(azioni),
      azioni,
      calendario: {
        calendario: (d.calendario ?? null) as ImpostazioniCalendario["calendario"],
        festivita: (Array.isArray(d.festivita) ? d.festivita : []) as ImpostazioniCalendario["festivita"],
      },
      lette: true,
    };
  } catch {
    return IMPOSTAZIONI_PREDEFINITE;
  }
}

export interface CalendarioDaSalvare {
  chiusura_dal: string | null;
  chiusura_al: string | null;
  patrono: string | null;
  patrono_nome: string | null;
  sabato_lavorativo: boolean;
}

export async function salvaImpostazioniSilvio(
  companyId: string,
  azioni: { azione: string; livello: LivelloAutonomia; soglia_eur: number | null }[],
  calendario: CalendarioDaSalvare | null,
  db: ClientAutonomia = dbVero,
): Promise<void> {
  const { error } = await db.rpc("silvio_autonomia_salva", { p_company_id: companyId, p_azioni: azioni, p_calendario: calendario });
  if (error) throw new Error(error.code === "42501" || /permess/i.test(error.message) ? error.message : `Non sono riuscito a salvare: ${error.message}`);
}

const MESE_GIORNO = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** «08-10» ↔ «10/08», come lo scrive chi legge. Null se non è una data valida. */
export function giornoDaTesto(testo: string): string | null {
  const m = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*$/.exec(testo);
  if (!m) return null;
  const mg = `${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return MESE_GIORNO.test(mg) ? mg : null;
}

export function giornoInTesto(mg: string | null | undefined): string {
  return mg && MESE_GIORNO.test(mg) ? `${mg.slice(3, 5)}/${mg.slice(0, 2)}` : "";
}
