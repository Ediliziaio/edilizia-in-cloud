/**
 * Il riepilogo di ieri dell'outreach cold (18/09/2026).
 *
 * «Ogni giorno mandami una mail di riepilogo: email mandate, risposte
 * ricevute, follow-up, tasso di invio, tasso di apertura se c'è.» Finché si
 * guardava solo la campanella, una giornata storta (caselle in pausa, coda
 * ferma, zero risposte) si notava dopo giorni.
 *
 * Qui dentro solo conti e testo: nessuna query, nessun invio. Chi chiama
 * (outreach-riepilogo) raccoglie le righe dal database e passa i numeri.
 */

export interface RigaAvviso { etichetta: string; valore: string }

/**
 * L'obiettivo del titolare (24/09/2026): risposte positive dal 3% delle
 * persone contattate. Si misura sulle persone, non sulle email: una persona
 * ne riceve 7-9, e contando per email il flusso più lungo sembra il peggiore.
 */
export const OBIETTIVO_POSITIVE_PCT = 3;

/** I numeri di un brand nella giornata. */
export interface ContiBrand {
  brand: string;
  inviate: number;
  primoContatto: number;
  fallite: number;
  risposte: number;
  interessati: number;
  negative: number;
  optout: number;
  rimbalzi: number;
  aperte: number;
  /** Il tracciamento aperture è attivo su almeno un flusso del brand? */
  tracciaAperture: boolean;
  /** Email pronte a partire oggi e totale ancora in coda. */
  inPartenza: number;
  inCoda: number;
  /** Persone contattate via email negli ultimi 30 giorni, e quante hanno risposto interessate o con una domanda. */
  persone30?: number;
  positive30?: number;
}

export interface DatiRiepilogo {
  /** «mercoledì 17 settembre» */
  giorno: string;
  brand: ContiBrand[];
  /** Chi ha risposto, già in chiaro: «Rossi Serramenti — interessato». */
  chiHaRisposto: string[];
  /** Caselle che non spediscono: in pausa o con la connessione rotta. */
  caselleFerme: string[];
  caselleAttive: number;
}

const nf = (n: number) => Math.round(n).toLocaleString("it-IT");

/** «1,2%» — e «—» quando non c'è niente su cui calcolarla. */
export function percentuale(parte: number, totale: number): string {
  if (!totale || totale <= 0) return "—";
  const v = (parte / totale) * 100;
  const cifre = v > 0 && v < 1 ? 1 : v >= 10 ? 0 : 1;
  return `${v.toFixed(cifre).replace(".", ",")}%`;
}

/** «1 risposta» / «3 risposte» / «nessuna risposta». */
function plurale(n: number, uno: string, molti: string, zero?: string): string {
  if (n === 0 && zero) return zero;
  return `${nf(n)} ${n === 1 ? uno : molti}`;
}

/** La riga di un brand: tutto su una riga, leggibile dal telefono. */
export function rigaBrand(c: ContiBrand): RigaAvviso {
  const pezzi: string[] = [];
  const followUp = Math.max(0, c.inviate - c.primoContatto);
  pezzi.push(`${plurale(c.inviate, "email", "email", "nessuna email")}${
    c.inviate > 0 ? ` (${nf(c.primoContatto)} primo contatto, ${nf(followUp)} follow-up)` : ""
  }`);
  if (c.fallite > 0) pezzi.push(`${nf(c.fallite)} non partite`);
  pezzi.push(`${plurale(c.risposte, "risposta", "risposte", "nessuna risposta")}${
    c.risposte > 0 ? ` (${percentuale(c.risposte, c.inviate)})` : ""
  }`);
  const dettaglio: string[] = [];
  if (c.interessati > 0) dettaglio.push(`${nf(c.interessati)} interessati`);
  if (c.negative > 0) dettaglio.push(`${nf(c.negative)} no`);
  if (c.optout > 0) dettaglio.push(`${nf(c.optout)} cancellatemi`);
  if (dettaglio.length) pezzi.push(dettaglio.join(", "));
  if (c.rimbalzi > 0) pezzi.push(`${plurale(c.rimbalzi, "indirizzo inesistente", "indirizzi inesistenti")}`);
  pezzi.push(c.tracciaAperture ? `aperture ${percentuale(c.aperte, c.inviate)}` : "aperture non tracciate");
  if (c.persone30) {
    const pos = c.positive30 ?? 0;
    pezzi.push(`30 giorni: ${plurale(pos, "positiva", "positive", "nessuna positiva")} su ${nf(c.persone30)} persone (${percentuale(pos, c.persone30)})`);
  }
  pezzi.push(`oggi ${nf(c.inPartenza)} in partenza, ${nf(c.inCoda)} in coda`);
  return { etichetta: c.brand, valore: pezzi.join(" · ") };
}

/** Titolo, righe e corpo dell'email di riepilogo. */
export function componiRiepilogo(d: DatiRiepilogo): { titolo: string; righe: RigaAvviso[]; testo: string } {
  const tot = d.brand.reduce((a, c) => ({
    inviate: a.inviate + c.inviate,
    primoContatto: a.primoContatto + c.primoContatto,
    fallite: a.fallite + c.fallite,
    risposte: a.risposte + c.risposte,
    rimbalzi: a.rimbalzi + c.rimbalzi,
    optout: a.optout + c.optout,
    inPartenza: a.inPartenza + c.inPartenza,
    inCoda: a.inCoda + c.inCoda,
  }), { inviate: 0, primoContatto: 0, fallite: 0, risposte: 0, rimbalzi: 0, optout: 0, inPartenza: 0, inCoda: 0 });

  const righe: RigaAvviso[] = [];
  righe.push({
    etichetta: "Ieri in tutto",
    valore: `${nf(tot.inviate)} email inviate · ${plurale(tot.risposte, "risposta", "risposte", "nessuna risposta")}` +
      `${tot.inviate ? ` (${percentuale(tot.risposte, tot.inviate)})` : ""}` +
      `${tot.fallite ? ` · ${nf(tot.fallite)} non partite (invio ${percentuale(tot.inviate, tot.inviate + tot.fallite)})` : ""}` +
      `${tot.rimbalzi ? ` · ${nf(tot.rimbalzi)} indirizzi inesistenti` : ""}` +
      `${tot.optout ? ` · ${nf(tot.optout)} cancellazioni` : ""}`,
  });
  const persone30 = d.brand.reduce((a, c) => a + (c.persone30 ?? 0), 0);
  const positive30 = d.brand.reduce((a, c) => a + (c.positive30 ?? 0), 0);
  if (persone30 > 0) {
    righe.push({
      etichetta: "Ultimi 30 giorni",
      valore: `${plurale(positive30, "risposta positiva", "risposte positive", "nessuna risposta positiva")} su ${nf(persone30)} persone contattate` +
        ` (${percentuale(positive30, persone30)}) · obiettivo ${OBIETTIVO_POSITIVE_PCT}%`,
    });
  }
  for (const c of d.brand) righe.push(rigaBrand(c));
  righe.push({
    etichetta: "Oggi",
    valore: `${nf(tot.inPartenza)} email in partenza · ${nf(tot.inCoda)} ancora in coda`,
  });
  righe.push({
    etichetta: "Caselle",
    valore: d.caselleFerme.length
      ? `${nf(d.caselleAttive)} spediscono · ferme: ${d.caselleFerme.join(", ")}`
      : `${nf(d.caselleAttive)} spediscono, nessuna ferma`,
  });

  const testo = d.chiHaRisposto.length
    ? `Hanno risposto:\n${d.chiHaRisposto.map((x) => `• ${x}`).join("\n")}`
    : "Nessuna risposta ieri.";

  const titolo = `Outreach ${d.giorno}: ${nf(tot.inviate)} email, ${plurale(tot.risposte, "risposta", "risposte", "nessuna risposta")}`;
  return { titolo, righe, testo };
}

/**
 * La giornata di ieri con le ore di Roma, non di Greenwich: il riepilogo delle
 * 07:30 deve raccontare il giorno appena finito, non le 24 ore precedenti.
 * Torna gli estremi in ISO (UTC) e l'etichetta da mettere nell'oggetto.
 * Le due mezzanotti si calcolano separatamente, così il giorno del cambio
 * d'ora dura 23 o 25 ore come deve.
 */
export function finestraGiorno(adesso: Date, giorniIndietro = 1): { da: string; a: string; etichetta: string } {
  const fuso = "Europe/Rome";
  const soloData = new Intl.DateTimeFormat("sv-SE", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" });
  const giorno = soloData.format(new Date(adesso.getTime() - giorniIndietro * 86_400_000));
  const giornoDopo = soloData.format(new Date(adesso.getTime() - (giorniIndietro - 1) * 86_400_000));
  const da = new Date(mezzanotteRoma(giorno));
  const a = new Date(mezzanotteRoma(giornoDopo));
  const etichetta = new Intl.DateTimeFormat("it-IT", { timeZone: fuso, weekday: "long", day: "numeric", month: "long" })
    .format(da);
  return { da: da.toISOString(), a: a.toISOString(), etichetta };
}

/** L'istante UTC della mezzanotte di Roma del giorno «AAAA-MM-GG». */
function mezzanotteRoma(data: string): number {
  const comeFosseUtc = Date.parse(`${data}T00:00:00Z`);
  // Roma è avanti di 1 o 2 ore: si toglie lo scarto, e si ricontrolla una
  // volta perché il salto dell'ora legale può cambiarlo.
  const primo = comeFosseUtc - scartoRoma(new Date(comeFosseUtc));
  return comeFosseUtc - scartoRoma(new Date(primo));
}

/** Di quanto Roma è avanti rispetto a UTC in quell'istante, in millisecondi. */
function scartoRoma(d: Date): number {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d)) {
    if (x.type !== "literal") p[x.type] = x.value;
  }
  const oreRoma = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return oreRoma - (d.getTime() - d.getMilliseconds());
}
