/**
 * «Chiamami oggi alle 15»: dalla risposta a un'email a freddo, quando e se il
 * contatto vuole essere chiamato (25/09/2026, richiesta del founder). Caso vero
 * da cui è nato: «Ciao Francesco puoi chiamarmi dopo le 15».
 *
 * Restituisce il giorno e l'ora detti, oppure la fascia in cui cercare uno
 * slot libero («oggi pomeriggio», «domani mattina», o nessuna indicazione: il
 * resto della giornata lavorativa). Il calendario lo decide chi chiama questa
 * funzione; qui solo la lettura del testo e i conti sulle ore.
 *
 * Tutto in ora italiana. Modulo puro: niente I/O, testato da vitest.
 */
import { senzaCitazione } from "./outreach-autoreply.ts";
import { rispostaPiuAvanti } from "./outreach-intent-parole.ts";

export interface RichiestaChiamata {
  /** Giorno della chiamata, AAAA-MM-GG (ora italiana). */
  giorno: string;
  /** Ora detta dal contatto («15:00»); null se ha dato solo una fascia o niente. */
  ora: string | null;
  /** Dove cercare lo slot libero, in minuti dalla mezzanotte. */
  fascia: { da: number; a: number };
  /** Il pezzo di frase riconosciuto, per le note dell'appuntamento. */
  frase: string;
}

/** La giornata lavorativa in cui fissare una chiamata senza ora. */
export const GIORNATA = { da: 9 * 60, a: 18 * 60 + 30 };
const FASCE: Array<{ re: RegExp; da: number; a: number }> = [
  { re: /\b(?:stamattina|mattin(?:a|ata)|in\s+mattinata)\b/, da: 9 * 60, a: 12 * 60 + 30 },
  { re: /\b(?:pausa\s+pranzo|ora\s+di\s+pranzo|a\s+pranzo)\b/, da: 12 * 60 + 30, a: 14 * 60 },
  { re: /\b(?:pomeriggio|nel\s+pomeriggio|oggi\s+pomeriggio)\b/, da: 14 * 60, a: 18 * 60 + 30 },
  { re: /\b(?:stasera|sera|serata|in\s+serata)\b/, da: 18 * 60, a: 19 * 60 + 30 },
];

/** Chi chiede di essere chiamato, nelle forme che si scrivono davvero. */
const CHIEDE_CHIAMATA = /\b(?:chiam(?:ami|atemi|armi|aci|ateci|arci)|mi\s+chiam(?:i|ate|iate|erete|erai)\b|(?:puoi|pu[oò]|potete|potresti|potreste|potrebbe)\s+(?:chiamare|telefonare|richiamare)|telefon(?:ami|atemi|armi|arci)|mi\s+telefon(?:i|ate)\b|richiam(?:ami|atemi|armi|arci)|sentiamoci|sentirci|ci\s+sentiamo)\b/;
const NON_CHIAMARE = /\bnon\s+(?:mi\s+|ci\s+)?(?:chiam|telefon|richiam|contatt)/;

const GIORNI_SETTIMANA: Record<string, number> = {
  domenica: 0, "lunedì": 1, lunedi: 1, "martedì": 2, martedi: 2, "mercoledì": 3, mercoledi: 3,
  "giovedì": 4, giovedi: 4, "venerdì": 5, venerdi: 5, sabato: 6,
};
const MESI: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7,
  agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

/** Data e ora di adesso a Roma. */
function adessoRoma(adesso: Date): { a: number; m: number; g: number; min: number; dow: number } {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(adesso);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday"));
  return { a: +v("year"), m: +v("month"), g: +v("day"), min: +v("hour") * 60 + +v("minute"), dow };
}

/** Giorno di calendario spostato di n giorni (le date, non gli istanti: niente fusi di mezzo). */
function piuGiorni(a: number, m: number, g: number, n: number): { a: number; m: number; g: number; dow: number } {
  const d = new Date(Date.UTC(a, m - 1, g + n));
  return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, g: d.getUTCDate(), dow: d.getUTCDay() };
}
const iso = (d: { a: number; m: number; g: number }) =>
  `${d.a}-${String(d.m).padStart(2, "0")}-${String(d.g).padStart(2, "0")}`;
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** L'ora detta, in minuti: «alle 15», «15:30», «alle 3 e mezza» (del pomeriggio), «mezzogiorno». */
function oraDetta(t: string): { min: number; frase: string; dopo: boolean } | { da: number; a: number; frase: string } | null {
  const intervallo = /\b(?:dalle|tra\s+le|fra\s+le)\s+(\d{1,2})(?:[:.](\d{2}))?\s+(?:alle|e\s+le)\s+(\d{1,2})(?:[:.](\d{2}))?\b/.exec(t);
  if (intervallo) {
    const da = orario(+intervallo[1], +(intervallo[2] ?? 0)), a = orario(+intervallo[3], +(intervallo[4] ?? 0));
    if (da != null && a != null && a > da) return { da, a, frase: intervallo[0] };
  }
  if (/\bmezzogiorno\b/.test(t)) return { min: 12 * 60, frase: "mezzogiorno", dopo: false };
  const re = /\b(alle(?:\s+ore)?|ore|verso\s+le|intorno\s+alle|dopo\s+le|per\s+le|dalle)\s+(\d{1,2})(?:[:.](\d{2}))?(\s+e\s+mezz[ao]|\s+e\s+un\s+quarto|\s+e\s+tre\s+quarti)?\b/;
  const m = re.exec(t) ?? /\b()(\d{1,2})[:.](\d{2})()\b/.exec(t);
  if (!m) return null;
  let minuti = m[3] ? +m[3] : 0;
  if (m[4]) minuti = /mezz/.test(m[4]) ? 30 : /tre\s+quarti/.test(m[4]) ? 45 : 15;
  const min = orario(+m[2], minuti);
  if (min == null) return null;
  return { min, frase: m[0].trim(), dopo: /^dopo/.test(m[1]) };
}

/** Ore lavorative: «alle 3» è il pomeriggio, «alle 9» la mattina. */
function orario(h: number, mm: number): number | null {
  if (!Number.isFinite(h) || h > 23 || mm > 59) return null;
  const ore = h >= 1 && h <= 7 ? h + 12 : h;
  return ore * 60 + mm;
}

/**
 * La richiesta di chiamata contenuta nella risposta, o null. `adesso` è quando
 * è arrivata la risposta: «oggi» e «domani» si contano da lì.
 */
export function richiestaDiChiamata(testo: string | null | undefined, adesso: Date = new Date()): RichiestaChiamata | null {
  let t = senzaCitazione(String(testo ?? "").replace(/&nbsp;| /gi, " "));
  const firma = /\b(?:cordiali\s+saluti|distinti\s+saluti|cordialmente|inviato\s+da|sent\s+from)\b|(?:^|\n)[ \t]*--[ \t]*(?:\n|$)/i.exec(t);
  if (firma) t = t.slice(0, firma.index);
  // I saluti non sono fasce: «buonasera» non vuol dire «chiamami stasera».
  t = t.replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/\b(?:buona\s*sera|buon\s*pomeriggio|buon\s*giorno|buona\s*giornata|buona\s*serata|buona\s*mattinata)\b/g, " ");
  if (!t.trim() || !CHIEDE_CHIAMATA.test(t) || NON_CHIAMARE.test(t)) return null;

  const ora0 = adessoRoma(adesso);
  let giorno = { a: ora0.a, m: ora0.m, g: ora0.g, dow: ora0.dow };
  let giornoDetto = false;
  const pezzi: string[] = [];

  if (/\bdopodomani\b/.test(t)) { giorno = piuGiorni(ora0.a, ora0.m, ora0.g, 2); giornoDetto = true; pezzi.push("dopodomani"); }
  else if (/\bdomani\b/.test(t)) { giorno = piuGiorni(ora0.a, ora0.m, ora0.g, 1); giornoDetto = true; pezzi.push("domani"); }
  else if (/\b(?:oggi|stamattina|stasera|in\s+giornata)\b/.test(t)) { giornoDetto = true; pezzi.push("oggi"); }
  else {
    const data = /\b(?:il\s+)?(\d{1,2})\s*(?:\/|-|\s)\s*(\d{1,2}|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/.exec(t);
    // Niente \b dopo la «ì»: senza il flag u le lettere accentate non fanno parola.
    const sett = /\b(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)(?![a-zà-ù])/.exec(t);
    if (data) {
      const g = +data[1], m = MESI[data[2]] ?? +data[2];
      if (g >= 1 && g <= 31 && m >= 1 && m <= 12) {
        let a = ora0.a;
        if (m < ora0.m || (m === ora0.m && g < ora0.g)) a += 1;
        giorno = piuGiorni(a, m, g, 0); giornoDetto = true; pezzi.push(data[0].trim());
      }
    } else if (sett) {
      const voluto = GIORNI_SETTIMANA[sett[1]] ?? GIORNI_SETTIMANA[sett[1].replace(/i$/, "ì")];
      let n = (voluto - ora0.dow + 7) % 7;
      if (n === 0 && /\bprossim/.test(t)) n = 7;
      giorno = piuGiorni(ora0.a, ora0.m, ora0.g, n); giornoDetto = true; pezzi.push(sett[1]);
    }
  }

  // L'ora, o la fascia, o la giornata lavorativa.
  const detta = oraDetta(t);
  // «Richiamami più avanti» senza un giorno né un'ora è un «non adesso»: lo
  // gestisce il promemoria. «Sentiamoci il 2 ottobre alle 11» invece è preciso.
  if (!giornoDetto && !detta && rispostaPiuAvanti(t)) return null;
  let ora: number | null = null;
  let fascia = { ...GIORNATA };
  if (detta) {
    if ("min" in detta) ora = detta.min;
    else fascia = { da: detta.da, a: detta.a };
    pezzi.push(detta.frase);
  } else {
    const f = FASCE.find((x) => x.re.test(t));
    if (f) { fascia = { da: f.da, a: f.a }; pezzi.push((t.match(f.re) ?? [""])[0]); }
  }
  if (ora != null) fascia = { da: ora, a: Math.min(ora + 60, 20 * 60) };

  const oggi = giorno.a === ora0.a && giorno.m === ora0.m && giorno.g === ora0.g;
  // Oggi: mai prima di mezz'ora da adesso, arrotondato al quarto d'ora.
  const primoUtile = Math.ceil((ora0.min + 30) / 15) * 15;
  if (oggi) {
    if (ora != null && ora < ora0.min + 10) {
      // «Chiamami alle 15» arrivato alle 16: vale per il giorno dopo, stessa ora.
      giorno = piuGiorni(giorno.a, giorno.m, giorno.g, 1);
    } else if (ora == null) {
      if (fascia.a - Math.max(fascia.da, primoUtile) < 15) {
        // La fascia di oggi è finita: stessa fascia il primo giorno utile.
        giorno = piuGiorni(giorno.a, giorno.m, giorno.g, 1);
      } else {
        fascia = { da: Math.max(fascia.da, primoUtile), a: fascia.a };
      }
    }
  }
  // La domenica non si chiama: si passa al lunedì (se il giorno non l'ha scelto lui).
  if (giorno.dow === 0 && !(giornoDetto && /\bdomenica\b/.test(t))) giorno = piuGiorni(giorno.a, giorno.m, giorno.g, 1);

  return {
    giorno: iso(giorno),
    ora: ora != null ? hhmm(ora) : null,
    fascia,
    frase: pezzi.length ? pezzi.join(" ") : "chiamami",
  };
}

/**
 * Il primo inizio libero (minuti) di `durata` minuti dentro la fascia, a passi
 * di 15, lontano dagli impegni `occupati` (minuti, stessa giornata). null se
 * non c'è posto: chi chiama decide (il founder: «mettimi comunque
 * l'appuntamento»).
 */
export function primoSlotLibero(
  fascia: { da: number; a: number },
  occupati: Array<{ da: number; a: number }>,
  durata: number,
  passo = 15,
): number | null {
  const inizio = Math.ceil(fascia.da / passo) * passo;
  for (let s = inizio; s + durata <= fascia.a; s += passo) {
    if (!occupati.some((o) => s < o.a && s + durata > o.da)) return s;
  }
  return null;
}

/**
 * Il primo numero di telefono italiano scritto nella risposta («Tel. 348 808
 * 8451»), come +39…, o null. Chi chiede di essere chiamato spesso lascia il
 * numero lì, e sulla scheda non c'è: senza, la conferma su WhatsApp non parte.
 */
export function telefonoNelTesto(testo: string | null | undefined): string | null {
  const t = senzaCitazione(String(testo ?? ""));
  const candidati = t.match(/(?<![\p{L}\p{N}])(?:\+|00)?\d(?:[\s./-]?\d){5,13}(?![\p{L}\p{N}])/gu) ?? [];
  for (const c of candidati) {
    let cifre = c.replace(/\D/g, "");
    if (cifre.startsWith("0039")) cifre = cifre.slice(4);
    else if (c.trim().startsWith("+39")) cifre = cifre.slice(2);
    if (/^(?:3\d{8,9}|0\d{5,10})$/.test(cifre)) return `+39${cifre}`;
  }
  return null;
}
