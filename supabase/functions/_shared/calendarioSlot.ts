/**
 * Gli orari liberi di un calendario in un giorno (25/09/2026).
 *
 * Fino a oggi li calcolava solo la pagina pubblica /prenota, nel browser
 * (src/pages/public/PublicBooking.tsx): lato server nessuno sapeva dire «il
 * calendario di Katia venerdì alle 15 è libero», e gli agenti AI prenotavano
 * su slot fissi dalle 8 alle 18 guardando tutti gli appuntamenti dell'azienda.
 * Qui le stesse regole della pagina (fasce, durata, margini, preavviso, tetto
 * giornaliero), con una differenza: gli impegni esterni (Google, Apple,
 * Outlook) arrivano in UTC e si confrontano con l'orario dello slot portato
 * in UTC col fuso di Roma. public-booking-crea li confrontava con
 * `new Date("…T15:00:00")`, che in Deno è UTC: un'ora o due di scarto.
 *
 * Nessun import URL: lo leggono sia le edge function sia i test.
 */

import { minutiDa, orarioDa, romaVersoUtc } from "./appuntamentiPubblici.ts";

export interface RegolaDisponibilita {
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
}

/** Un appuntamento già preso sul calendario, in ora di Roma ("HH:MM"). */
export interface AppuntamentoOccupato {
  inizio: string;
  fine: string | null;
}

/** Un impegno del titolare su un calendario esterno, in UTC. */
export interface ImpegnoEsterno {
  start_at: string;
  end_at: string;
}

export interface InputSlot {
  /** Il giorno, "yyyy-MM-dd". */
  dataIso: string;
  regole: RegolaDisponibilita[];
  durataMin: number;
  bufferPrimaMin: number;
  bufferDopoMin: number;
  preavvisoMin: number;
  maxAlGiorno: number | null;
  appuntamenti: AppuntamentoOccupato[];
  impegni: ImpegnoEsterno[];
  adesso: Date;
}

/** Il giorno della settimana di una data (0 = domenica), senza fusi. */
function giornoDellaSettimana(dataIso: string): number {
  return new Date(`${dataIso}T12:00:00Z`).getUTCDay();
}

/** Le fasce che valgono quel giorno: quelle della data precisa vincono. */
export function fasceDelGiorno(dataIso: string, regole: RegolaDisponibilita[]): RegolaDisponibilita[] {
  const perData = regole.filter((r) => r.specific_date === dataIso);
  if (perData.length) return perData;
  const giorno = giornoDellaSettimana(dataIso);
  return regole.filter((r) => r.specific_date === null && r.day_of_week === giorno);
}

export function slotLiberi(input: InputSlot): string[] {
  const durata = Math.max(5, Math.floor(input.durataMin || 30));
  const bufPrima = Math.max(0, Math.floor(input.bufferPrimaMin || 0));
  const bufDopo = Math.max(0, Math.floor(input.bufferDopoMin || 0));

  if (input.maxAlGiorno && input.appuntamenti.length >= input.maxAlGiorno) return [];

  const fasce = fasceDelGiorno(input.dataIso, input.regole);
  if (!fasce.length) return [];

  const occupati = input.appuntamenti.map((a) => {
    const s = minutiDa(String(a.inizio).slice(0, 5));
    const e = a.fine ? minutiDa(String(a.fine).slice(0, 5)) : s + durata;
    return { s, e };
  });
  const impegni = input.impegni
    .map((b) => ({ s: new Date(b.start_at).getTime(), e: new Date(b.end_at).getTime() }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e));
  const limite = input.adesso.getTime() + Math.max(0, input.preavvisoMin || 0) * 60_000;

  const liberi = new Set<string>();
  for (const fascia of fasce) {
    const apertura = minutiDa(String(fascia.start_time).slice(0, 5));
    const chiusura = minutiDa(String(fascia.end_time).slice(0, 5));
    for (let inizio = apertura; inizio + durata <= chiusura; inizio += durata) {
      const fine = inizio + durata;
      // Stessa regola di public-booking-crea: i margini valgono da entrambe le parti.
      const sovrapposto = occupati.some(
        (o) => (inizio - bufPrima) < (o.e + bufDopo) && (fine + bufDopo) > (o.s - bufPrima),
      );
      if (sovrapposto) continue;

      const orario = orarioDa(inizio);
      const inizioUtc = romaVersoUtc(input.dataIso, orario).getTime();
      if (inizioUtc < limite) continue;

      const fineUtc = inizioUtc + durata * 60_000;
      if (impegni.some((b) => inizioUtc < b.e && fineUtc > b.s)) continue;

      liberi.add(orario);
    }
  }
  return [...liberi].sort();
}

export type Fascia = "mattina" | "pomeriggio" | "sera";

/** Mattina fino alle 12:59, pomeriggio fino alle 17:59, poi sera. */
export function fasciaDi(hhmm: string): Fascia {
  const m = minutiDa(hhmm);
  if (m < 13 * 60) return "mattina";
  if (m < 18 * 60) return "pomeriggio";
  return "sera";
}
