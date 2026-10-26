/**
 * «E se…»: confronto di scenari sul preventivo, solo aritmetica sui numeri che il computo già ha.
 *
 *  - Prezzo: con il prezzo ritoccato (sconto o aumento) cosa resta di margine, a parità di costi.
 *  - Squadra: con un operaio in più o in meno, quanti giorni e che scadenza; con il costo del lavoro invariato
 *    (le ore-persona sono le stesse: cambia il calendario, non il costo, salvo straordinari che qui non si ipotizzano).
 *
 * Costi incompleti = niente margini inventati: lo scenario di prezzo lo dice, come `calcObiettivoMargine`.
 */
import type { BaseEconomica, RigaCosto } from './obiettivoMargine';
import { stimaTempiDaComputo, type AssunzioniTempi } from './stimaTempi';

export interface ScenarioPrezzo {
  /** Variazione del prezzo netto rispetto a oggi, in %: −10 = sconto del 10% in più. */
  variazionePct: number;
  prezzoNetto: number;
  prezzoIvato: number;
  /** null se i costi sono incompleti. */
  margineEur: number | null;
  marginePct: number | null;
}

const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
const r1 = (v: number): number => Math.round(v * 10) / 10;

export function scenariPrezzo(base: BaseEconomica, variazioniPct: number[] = [-10, -5, 0, 5]): ScenarioPrezzo[] {
  if (!(base.imponibile > 0)) return [];
  const fattoreIva = base.totale >= base.imponibile ? base.totale / base.imponibile : 1;
  const costiNoti = base.righeSenzaCosto === 0;
  return [...new Set(variazioniPct.filter(v => Number.isFinite(v) && v > -100 && v <= 200))].sort((a, b) => a - b).map(v => {
    const prezzoNetto = r2(base.imponibile * (1 + v / 100));
    const margineEur = costiNoti ? r2(prezzoNetto - base.costoTot) : null;
    return { variazionePct: v, prezzoNetto, prezzoIvato: r2(prezzoNetto * fattoreIva), margineEur, marginePct: margineEur != null ? r1((margineEur / prezzoNetto) * 100) : null };
  });
}

export interface ScenarioSquadra { operai: number; giorniLavorativi: number; settimane: number; giorniRispettoAOggi: number }

export function scenariSquadra(righe: RigaCosto[], a: AssunzioniTempi, operaiScenari?: number[]): ScenarioSquadra[] {
  const oggi = stimaTempiDaComputo(righe, a);
  if (oggi.stato !== 'ok') return [];
  const lista = operaiScenari ?? [a.operai - 1, a.operai, a.operai + 1, a.operai + 2];
  return [...new Set(lista.filter(o => Number.isInteger(o) && o >= 1 && o <= 100))].sort((x, y) => x - y).map(operai => {
    const t = stimaTempiDaComputo(righe, { ...a, operai });
    if (t.stato !== 'ok') throw new Error('scenario incoerente');
    return { operai, giorniLavorativi: t.giorniLavorativi, settimane: t.settimane, giorniRispettoAOggi: t.giorniLavorativi - oggi.giorniLavorativi };
  });
}

/** Data di fine (ISO) contando solo i giorni lavorativi dal giorno di inizio (compreso se è lavorativo). Ferie e festivi non sono noti qui. */
export function dataFine(inizioIso: string, giorniLavorativi: number, giorniSettimana = 5): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inizioIso) || !(giorniLavorativi >= 1) || giorniSettimana < 1 || giorniSettimana > 7) return null;
  const d = new Date(`${inizioIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let contati = 0;
  for (let guardia = 0; guardia < 4000; guardia++) {
    const dow = (d.getUTCDay() + 6) % 7; // 0 = lunedì
    if (dow < giorniSettimana) { contati++; if (contati === Math.round(giorniLavorativi)) return d.toISOString().slice(0, 10); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

/** Data (ISO) di `giorniLavorativi` giorni lavorativi PRIMA dell'inizio: per «ordina i materiali entro». */
export function dataPrima(inizioIso: string, giorniLavorativi: number, giorniSettimana = 5): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inizioIso) || !(giorniLavorativi >= 0) || giorniSettimana < 1 || giorniSettimana > 7) return null;
  const d = new Date(`${inizioIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let rimasti = Math.round(giorniLavorativi);
  for (let guardia = 0; guardia < 4000 && rimasti > 0; guardia++) {
    d.setUTCDate(d.getUTCDate() - 1);
    if ((d.getUTCDay() + 6) % 7 < giorniSettimana) rimasti--;
  }
  return d.toISOString().slice(0, 10);
}
