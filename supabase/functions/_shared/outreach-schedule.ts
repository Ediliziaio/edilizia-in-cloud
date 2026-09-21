/**
 * outreach-schedule — finestra di invio PURA (niente Deno/Supabase, solo Intl).
 * Il cold parte solo in orari "umani" (default Lun-Ven 8-19 Europe/Rome):
 * niente invii di notte o nel weekend → meno spam, più risposte. Testato in vitest.
 */

export interface SendWindow {
  days: number[];     // 0=Dom, 1=Lun, … 6=Sab
  startHour: number;  // incluso
  endHour: number;    // escluso
  timeZone: string;
  /**
   * Chiusura anticipata di alcuni giorni (0=Dom … 6=Sab → ora di fine, esclusa),
   * es. `{ 6: 13 }` = il sabato si spedisce solo fino alle 13. Il titolare,
   * 21/09/2026: «le email di Marketing Edile e Edilizia in Cloud non devono
   * partire il sabato pomeriggio e la domenica». Un giorno senza voce chiude
   * a `endHour`; la voce può solo anticipare la chiusura, non allungarla.
   */
  endHourByDay?: Partial<Record<number, number>>;
}

/** L'ora (esclusa) a cui chiude un giorno della settimana: la sua, se anticipa, sennò `endHour`. */
export function fineDelGiorno(w: SendWindow, weekday: number): number {
  const f = w.endHourByDay?.[weekday];
  return typeof f === "number" && f > w.startHour && f < w.endHour ? f : w.endHour;
}

export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 19,
  timeZone: "Europe/Rome",
};

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Ora (0-23) e giorno settimana (0-6) di un istante in un fuso, via Intl (gestisce la DST). */
export function localParts(date: Date, timeZone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(date);
  let hour = 0, weekday = 0;
  for (const p of parts) {
    if (p.type === "hour") hour = parseInt(p.value, 10) % 24;
    else if (p.type === "weekday") weekday = WEEKDAY[p.value] ?? 0;
  }
  return { hour, weekday };
}

/** Minuti dalla mezzanotte locale (0-1439) di un istante in un fuso, via Intl (gestisce la DST). */
export function minutoDelGiorno(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  let h = 0, m = 0;
  for (const p of parts) {
    if (p.type === "hour") h = parseInt(p.value, 10) % 24;
    else if (p.type === "minute") m = parseInt(p.value, 10);
  }
  return h * 60 + m;
}

/**
 * La finestra in cui spedisce un brand. La decide il brand: il motore gira
 * tutti i giorni a tutte le ore, e ogni brand sceglie i giorni e gli orari
 * suoi. Un brand che non ha scelto niente spedisce lun–ven 8–19, così il
 * cold di notte o di domenica non parte mai per dimenticanza.
 *
 * Prima c'era anche una finestra di piattaforma, e il motore si fermava lì
 * prima ancora di guardare il brand: ThermoDMR era impostato lun–sab e il
 * sabato non partiva niente, senza che nessuna pagina lo dicesse.
 */
export function finestraDelBrand(raw: unknown): SendWindow {
  if (raw == null) return DEFAULT_SEND_WINDOW;
  return parseSendWindow(raw);
}

/**
 * Porta un orario nel primo giorno che la finestra del brand ammette, alla
 * stessa ora. I follow-up saltavano SEMPRE sabato e domenica
 * (`spostaFuoriWeekend`, del 02/09/2026, quando la finestra era lun–ven per
 * tutti). Poi la finestra è passata al brand: Marketing Edile ed Edilizia in
 * Cloud spediscono tutti i giorni, ThermoDMR lun–sab. I primi contatti
 * partivano anche nel weekend, i richiami no, e il lunedì se li trovava tutti
 * insieme: il 21/09/2026 tre giorni di richiami nello stesso giorno, e ogni
 * passo della sequenza allungato di uno o due giorni.
 * Un brand senza finestra propria resta lun–ven, come prima.
 */
export function spostaNeiGiorniDellaFinestra(d: Date, w: SendWindow = DEFAULT_SEND_WINDOW): Date {
  if (!w.days.length) return d;
  let esito = d;
  // Un giorno che chiude prima (il sabato fino alle 13): dopo la chiusura la
  // riga va al primo giorno buono alla stessa ora, invece di aspettare lì e
  // partire il lunedì alle 7 insieme a tutte le altre. Negli altri giorni un
  // orario fuori dalla finestra resta com'è, come prima: decide il controllo
  // all'invio.
  for (let i = 0; i < 8; i++) {
    const { weekday } = localParts(esito, w.timeZone);
    const giornoNo = !w.days.includes(weekday);
    const chiudePrima = fineDelGiorno(w, weekday) < w.endHour;
    const dopoLaChiusura = chiudePrima && minutoDelGiorno(esito, w.timeZone) >= fineDelGiorno(w, weekday) * 60;
    if (!giornoNo && !dopoLaChiusura) break;
    esito = new Date(esito.getTime() + 86_400_000);
  }
  return esito;
}

/** True se l'istante cade nella finestra (giorno consentito e ora tra start e end). */
export function isWithinSendWindow(date: Date, w: SendWindow = DEFAULT_SEND_WINDOW): boolean {
  const { hour, weekday } = localParts(date, w.timeZone);
  if (!w.days.includes(weekday)) return false;
  return hour >= w.startHour && hour < fineDelGiorno(w, weekday);
}

/**
 * Costruisce una SendWindow da config salvata (outreach_brands.send_window),
 * validando ogni campo e ripiegando sui default.
 * Robusta a input malformati: non lancia mai.
 */
export function parseSendWindow(raw: unknown): SendWindow {
  let o: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return DEFAULT_SEND_WINDOW; }
  } else if (raw && typeof raw === "object") {
    o = raw as Record<string, unknown>;
  }
  if (!o) return DEFAULT_SEND_WINDOW;

  const rawDays = Array.isArray(o.days) ? o.days : null;
  const days = rawDays
    ? [...new Set(rawDays.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))]
    : DEFAULT_SEND_WINDOW.days;

  const sh = typeof o.startHour === "number" && Number.isInteger(o.startHour) && o.startHour >= 0 && o.startHour <= 23
    ? o.startHour : DEFAULT_SEND_WINDOW.startHour;
  const eh = typeof o.endHour === "number" && Number.isInteger(o.endHour) && o.endHour >= 1 && o.endHour <= 24
    ? o.endHour : DEFAULT_SEND_WINDOW.endHour;
  const tz = typeof o.timeZone === "string" && o.timeZone.trim() ? o.timeZone : DEFAULT_SEND_WINDOW.timeZone;

  const valid = sh < eh;
  const inizio = valid ? sh : DEFAULT_SEND_WINDOW.startHour;
  const fine = valid ? eh : DEFAULT_SEND_WINDOW.endHour;
  // Chiusure anticipate: chiavi 0-6 (nel JSON sono stringhe), ore intere che
  // cadono DENTRO la giornata. Le altre si scartano: meglio il giorno intero
  // che un giorno chiuso per un valore scritto male.
  const perGiorno: Partial<Record<number, number>> = {};
  if (o.endHourByDay && typeof o.endHourByDay === "object" && !Array.isArray(o.endHourByDay)) {
    for (const [k, v] of Object.entries(o.endHourByDay as Record<string, unknown>)) {
      const g = Number(k);
      if (Number.isInteger(g) && g >= 0 && g <= 6 && typeof v === "number" && Number.isInteger(v) && v > inizio && v < fine) {
        perGiorno[g] = v;
      }
    }
  }
  return {
    days: days.length ? days : DEFAULT_SEND_WINDOW.days,
    startHour: inizio,
    endHour: fine,
    timeZone: tz,
    ...(Object.keys(perGiorno).length ? { endHourByDay: perGiorno } : {}),
  };
}

/**
 * Distanza minima, in minuti, tra l'orario di un follow-up e quello dell'email
 * precedente allo stesso contatto. Il titolare (15/09/2026): un follow-up non
 * deve mai arrivare alla stessa ora dell'email prima. Tre giorni dopo ma sempre
 * alle 9:10 si capisce che è un invio automatico; su 13 follow-up partiti
 * l'11-15/09, 5 erano arrivati entro un'ora e mezza dallo stesso orario.
 */
export const DISTANZA_MINIMA_FOLLOWUP_MIN = 180;

/** Minuti tra due orari del giorno (0-1439), sul giro delle 24 ore: 23:30 e 00:30 distano 60. */
export function distanzaTraOrari(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

/** True se `ora`, come orario del giorno nel fuso dato, cade a meno di `minimo` minuti dall'orario di `precedente`. */
export function orarioTroppoVicino(
  ora: Date,
  precedente: Date,
  timeZone: string,
  minimo: number = DISTANZA_MINIMA_FOLLOWUP_MIN,
): boolean {
  return distanzaTraOrari(minutoDelGiorno(ora, timeZone), minutoDelGiorno(precedente, timeZone)) < minimo;
}

/**
 * Orario di un follow-up nel giorno di `giorno` (fuso della finestra): nell'altra
 * metà della giornata rispetto all'email precedente, ad almeno `minimo` minuti dal
 * suo orario e dentro la finestra d'invio. `caso` in [0,1) (di norma Math.random()).
 *
 * Se nella finestra non c'è posto (più stretta del doppio di `minimo`) restituisce
 * `giorno` com'è: a quel punto vale il controllo al momento dell'invio
 * (orarioTroppoVicino), che fa aspettare la riga.
 */
export function orarioFollowUp(
  giorno: Date,
  precedente: Date,
  finestra: SendWindow,
  caso: number,
  minimo: number = DISTANZA_MINIMA_FOLLOWUP_MIN,
): Date {
  const tz = finestra.timeZone;
  const inizio = finestra.startHour * 60;
  // L'ultimo quarto d'ora resta fuori: un invio programmato alle 18:58 rischia di
  // non trovare più un giro utile e di scivolare al mattino dopo. La chiusura è
  // quella del giorno del follow-up (il sabato può chiudere alle 13).
  const fine = fineDelGiorno(finestra, localParts(giorno, tz).weekday) * 60 - 15;
  const prev = minutoDelGiorno(precedente, tz);
  const prima: [number, number] = [inizio, Math.min(fine, prev - minimo)];
  const dopo: [number, number] = [Math.max(inizio, prev + minimo), fine];
  const haPosto = (r: [number, number]) => r[1] > r[0];
  // Si alterna: dopo un'email del mattino il follow-up va al pomeriggio, e viceversa.
  const [preferito, ripiego] = prev < (inizio + fine) / 2 ? [dopo, prima] : [prima, dopo];
  const scelto = haPosto(preferito) ? preferito : haPosto(ripiego) ? ripiego : null;
  if (!scelto) return giorno;

  const r = Math.min(Math.max(caso, 0), 1 - 1e-9);
  const secondoVoluto = scelto[0] * 60 + Math.floor(r * (scelto[1] - scelto[0]) * 60);
  const secondoDi = (d: Date) => minutoDelGiorno(d, tz) * 60 + d.getUTCSeconds();
  let esito = new Date(giorno.getTime() - giorno.getUTCMilliseconds() + (secondoVoluto - secondoDi(giorno)) * 1000);
  // Il giorno del cambio d'ora lo scarto tra fuso e UTC si sposta: si corregge una volta.
  const scarto = secondoVoluto - secondoDi(esito);
  if (scarto !== 0) esito = new Date(esito.getTime() + scarto * 1000);
  // Finestre quasi da 24 ore: sul giro dell'orologio si potrebbe ricadere vicino.
  if (distanzaTraOrari(minutoDelGiorno(esito, tz), prev) < minimo) return giorno;
  return esito;
}
