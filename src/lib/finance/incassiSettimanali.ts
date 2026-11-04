/**
 * Quanto si deve incassare, settimana per settimana (04/11/2026). Parte dai movimenti della previsione
 * di cassa, che uniscono già fatture, scadenze e rate delle commesse senza contarle due volte: così i
 * numeri di questa vista e del Previsionale sono gli stessi.
 *
 * Le settimane vanno da lunedì a domenica. Quello che è scaduto sta a parte, perché sommato alla
 * settimana in corso farebbe credere a un incasso che non ha una data; quello che non ha ancora una
 * data (un evento non accaduto, una parte di commessa senza rata) sta a parte e non finisce in una settimana.
 */
import type { ForecastMovement } from "@/lib/finance/forecastLedger";

export interface GruppoIncassi {
  cents: number;
  /** La parte già fatturata o scritta nello scadenzario, comprese le rate con la loro fattura. */
  fattureCents: number;
  /** La parte di rate delle commesse senza ancora una fattura. */
  rateCents: number;
  righe: ForecastMovement[];
}

export interface SettimanaIncassi extends GruppoIncassi {
  /** Lunedì, YYYY-MM-DD. */
  inizio: string;
  /** Domenica, YYYY-MM-DD. */
  fine: string;
}

export interface IncassiPerSettimana {
  scaduto: GruppoIncassi;
  settimane: SettimanaIncassi[];
  /** Oltre le settimane mostrate. */
  piuAvanti: GruppoIncassi;
  /** Rate legate a un evento non ancora accaduto, rate senza data e parti di commessa senza rata. */
  senzaData: GruppoIncassi;
  /** Possibili doppioni: restano fuori dai totali finché non si collegano alla rata. */
  daControllare: GruppoIncassi;
}

const gruppoVuoto = (): GruppoIncassi => ({ cents: 0, fattureCents: 0, rateCents: 0, righe: [] });

const metti = (g: GruppoIncassi, m: ForecastMovement) => {
  g.cents += m.cents;
  if (m.id.startsWith("rata:") && !m.rataFatturata) g.rateCents += m.cents;
  else g.fattureCents += m.cents;
  g.righe.push(m);
};

const aGiorno = (d: Date) => d.toISOString().slice(0, 10);
const giorno = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function lunediDi(iso: string): string {
  const d = giorno(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return aGiorno(d);
}

export function domenicaDi(iso: string): string {
  const d = giorno(lunediDi(iso));
  d.setUTCDate(d.getUTCDate() + 6);
  return aGiorno(d);
}

const piuGiorni = (iso: string, n: number) => {
  const d = giorno(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aGiorno(d);
};

const perData = (a: ForecastMovement, b: ForecastMovement) =>
  (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.description.localeCompare(b.description);

export function incassiPerSettimana(
  movimenti: ReadonlyArray<ForecastMovement>,
  oggi: string,
  quanteSettimane = 8,
): IncassiPerSettimana {
  const primoLunedi = lunediDi(oggi);
  const settimane: SettimanaIncassi[] = Array.from({ length: quanteSettimane }, (_, i) => {
    const inizio = piuGiorni(primoLunedi, i * 7);
    return { ...gruppoVuoto(), inizio, fine: piuGiorni(inizio, 6) };
  });
  const esito: IncassiPerSettimana = {
    scaduto: gruppoVuoto(),
    settimane,
    piuAvanti: gruppoVuoto(),
    senzaData: gruppoVuoto(),
    daControllare: gruppoVuoto(),
  };
  const ultimo = settimane[settimane.length - 1]?.fine ?? oggi;

  for (const m of movimenti) {
    if (m.direction !== "in" || m.cents <= 0) continue;
    if (m.possibleDuplicate) metti(esito.daControllare, m);
    else if (!m.date) metti(esito.senzaData, m);
    else if (m.date < oggi) metti(esito.scaduto, m);
    else if (m.date > ultimo) metti(esito.piuAvanti, m);
    else metti(settimane[Math.floor((giorno(m.date).getTime() - giorno(primoLunedi).getTime()) / (7 * 86_400_000))], m);
  }
  for (const g of [esito.scaduto, esito.piuAvanti, esito.senzaData, esito.daControllare, ...settimane]) g.righe.sort(perData);
  return esito;
}
