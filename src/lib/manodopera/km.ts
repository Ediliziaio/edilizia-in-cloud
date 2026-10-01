/**
 * Km dei mezzi sui cantieri (26/09/2026, richiesta di Florin): «se ho un
 * cantiere con la via mi calcola dalla sede i km fatti dal mezzo, andata e
 * ritorno». La strada sede→cantiere la dà il servizio percorsi già usato per i
 * clienti; qui si conta: giorni lavorativi sul cantiere × andata e ritorno.
 * È una stima: il contachilometri vero resta quello scritto nel mezzo.
 */
import { giornoItaliano } from "@/types/mezzi";

/** I mezzi che vanno e tornano dal cantiere guidando. */
export const TIPI_CHE_VIAGGIANO = new Set(["furgone", "autocarro", "autovettura"]);

function dataUtc(iso: string): Date {
  const [y, m, g] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, g));
}

/**
 * I giorni dal lunedì al venerdì in cui il periodo [dal, al] tocca l'intervallo
 * [da, a]. dal/al sono istanti (come nello storico dei mezzi) e si leggono in
 * ora italiana; un periodo aperto arriva fino ad «a».
 */
export function giorniLavorativiSovrapposti(dal: string, al: string | null, da: string, a: string): number {
  const inizio = giornoItaliano(dal);
  const fine = al ? giornoItaliano(al) : a;
  const s = inizio > da ? inizio : da;
  const e = fine < a ? fine : a;
  if (s > e) return 0;
  let n = 0;
  for (let d = dataUtc(s); d <= dataUtc(e); d.setUTCDate(d.getUTCDate() + 1)) {
    const g = d.getUTCDay();
    if (g !== 0 && g !== 6) n++;
  }
  return n;
}

/** Km stimati: ogni giorno andata e ritorno. */
export function kmStimati(giorni: number, kmAndata: number | null | undefined): number | null {
  if (kmAndata == null || !Number.isFinite(kmAndata) || giorni <= 0) return null;
  return Math.round(giorni * 2 * kmAndata);
}

export function formatKm(km: number | null | undefined): string {
  if (km == null) return "—";
  // useGrouping "always": «1.352 km» anche a quattro cifre (come formatCount).
  const opzioni = { maximumFractionDigits: km < 10 ? 1 : 0, useGrouping: "always" } as unknown as Intl.NumberFormatOptions;
  return `${new Intl.NumberFormat("it-IT", opzioni).format(km)} km`;
}
