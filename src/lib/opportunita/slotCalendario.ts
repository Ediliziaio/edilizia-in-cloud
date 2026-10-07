/**
 * Orari liberi di un calendario per la prenotazione interna (scheda «Prenota/aggiorna appuntamento»).
 *
 * Stesse regole della pagina pubblica di prenotazione, così chi prenota da dentro e il cliente che
 * prenota da solo vedono gli stessi orari:
 *  - la disponibilità settimanale, con le giornate speciali che hanno la precedenza (una giornata
 *    speciale tutta spenta è un giorno di chiusura, non un ritorno alla regola settimanale);
 *  - gli appuntamenti già fissati, allargati dai margini prima/dopo del calendario;
 *  - gli impegni del titolare su Google/Outlook/Apple Calendar;
 *  - il preavviso minimo e il tetto di appuntamenti al giorno.
 */

export interface RegolaDisponibilita {
  start_time: string;
  end_time: string;
  is_enabled?: boolean | null;
  specific_date?: string | null;
  day_of_week?: number | null;
}

export interface Fascia {
  /** HH:mm o HH:mm:ss */
  inizio: string | null;
  fine: string | null;
}

export interface Occupato {
  start_at: string;
  end_at: string;
}

const hhmm = (v: string) => v.slice(0, 5);

const minuti = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const [h, m] = hhmm(v).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const dueCifre = (n: number) => String(n).padStart(2, "0");
export const dalleMinuti = (tot: number) => `${dueCifre(Math.floor(tot / 60) % 24)}:${dueCifre(tot % 60)}`;

/** yyyy-MM-dd nel fuso locale. */
export function chiaveGiorno(g: Date): string {
  return `${g.getFullYear()}-${dueCifre(g.getMonth() + 1)}-${dueCifre(g.getDate())}`;
}

/**
 * Le fasce di lavoro di un giorno. Se esiste una regola per quella data precisa, vale solo quella
 * (e se è tutta spenta il giorno è chiuso); altrimenti vale la regola settimanale.
 */
export function fasceDelGiorno(regole: RegolaDisponibilita[], giorno: Date): RegolaDisponibilita[] {
  const chiave = chiaveGiorno(giorno);
  const speciali = regole.filter((r) => r.specific_date === chiave);
  if (speciali.length > 0) return speciali.filter((r) => r.is_enabled !== false);
  return regole.filter((r) => !r.specific_date && r.day_of_week === giorno.getDay() && r.is_enabled !== false);
}

export interface ParametriSlot {
  giorno: Date;
  regole: RegolaDisponibilita[];
  appuntamenti: Fascia[];
  occupatiEsterni: Occupato[];
  durataMin: number;
  bufferPrimaMin?: number;
  bufferDopoMin?: number;
  preavvisoMin?: number;
  maxAlGiorno?: number | null;
  adesso?: number;
}

export interface EsitoSlot {
  slot: string[];
  /** Le fasce di lavoro del giorno, per mostrarle («09:00–13:00, 14:00–18:00»). */
  fasce: Array<{ da: string; a: string }>;
  /** Perché non ci sono orari, se non ce ne sono. */
  motivoVuoto: "chiuso" | "tetto" | "pieno" | null;
}

export function calcolaSlotLiberi(p: ParametriSlot): EsitoSlot {
  const fasceRegola = fasceDelGiorno(p.regole, p.giorno);
  const fasce = fasceRegola
    .map((r) => ({ da: hhmm(r.start_time), a: hhmm(r.end_time) }))
    .sort((x, y) => x.da.localeCompare(y.da));
  if (fasce.length === 0 || p.durataMin <= 0) return { slot: [], fasce, motivoVuoto: "chiuso" };
  if (p.maxAlGiorno && p.appuntamenti.length >= p.maxAlGiorno) return { slot: [], fasce, motivoVuoto: "tetto" };

  const prima = p.bufferPrimaMin ?? 0;
  const dopo = p.bufferDopoMin ?? 0;
  const adesso = p.adesso ?? Date.now();
  const preavviso = (p.preavvisoMin ?? 0) * 60000;
  const mezzanotte = new Date(p.giorno.getFullYear(), p.giorno.getMonth(), p.giorno.getDate()).getTime();

  const fasceAppuntamenti = p.appuntamenti
    .map((a) => {
      const i = minuti(a.inizio);
      if (i == null) return null;
      const f = minuti(a.fine) ?? i + p.durataMin;
      return { i, f };
    })
    .filter((x): x is { i: number; f: number } => x !== null);

  const slot = new Set<string>();
  for (const { da, a } of fasce) {
    const fineFascia = minuti(a)!;
    for (let cursore = minuti(da)!; cursore + p.durataMin <= fineFascia; cursore += p.durataMin) {
      const fine = cursore + p.durataMin;
      const occupatoDaAppuntamento = fasceAppuntamenti.some((x) => cursore - prima < x.f + dopo && fine + dopo > x.i - prima);
      if (occupatoDaAppuntamento) continue;
      const inizioMs = mezzanotte + cursore * 60000;
      const fineMs = mezzanotte + fine * 60000;
      if (inizioMs < adesso + preavviso) continue;
      const occupatoEsterno = p.occupatiEsterni.some((b) => inizioMs < new Date(b.end_at).getTime() && fineMs > new Date(b.start_at).getTime());
      if (occupatoEsterno) continue;
      slot.add(dalleMinuti(cursore));
    }
  }
  const ordinati = [...slot].sort();
  return { slot: ordinati, fasce, motivoVuoto: ordinati.length === 0 ? "pieno" : null };
}

/** Gli impegni esterni che toccano un orario scelto a mano (per l'avviso). */
export function impegniEsterniInFascia(giorno: Date, inizio: string, fine: string, occupati: Occupato[]): Occupato[] {
  const i = minuti(inizio);
  const f = minuti(fine);
  if (i == null || f == null || f <= i) return [];
  const mezzanotte = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate()).getTime();
  const a = mezzanotte + i * 60000;
  const b = mezzanotte + f * 60000;
  return occupati.filter((o) => a < new Date(o.end_at).getTime() && b > new Date(o.start_at).getTime());
}
