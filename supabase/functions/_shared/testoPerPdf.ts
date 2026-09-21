/**
 * Il testo che un PDF con i caratteri di serie sa stampare.
 *
 * I PDF dei preventivi usano Helvetica e Times, che conoscono soltanto
 * l'alfabeto WinAnsi (il Latin-1 più una trentina di segni: €, virgolette
 * curve, trattini, puntini). Tutto il resto — frecce, spunte, stelline, emoji —
 * il motore lo stampa come un carattere a caso: «casa 🏠, finalmente» usciva
 * «casa ,<â» e il resto del titolo spariva. Le aziende quei simboli li
 * incollano davvero, da WhatsApp e da Word.
 *
 * Qui ogni simbolo diventa il suo equivalente stampabile quando ne ha uno
 * (la freccia fa da trattino, «≥» diventa «>=»), sparisce quando è solo
 * decorazione (spunte, stelle, emoji), e una lettera accentata che WinAnsi non
 * ha perde l'accento invece della lettera («Ivić» → «Ivic»).
 */

/** I segni di Windows-1252 oltre al Latin-1: questi Helvetica li ha. */
const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

const stampabile = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return c === 0x0a || c === 0x09 || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch);
};

// Frecce (blocco Arrows, frecce dei dingbat, triangolini): in un elenco o in una
// frase fanno da separatore.
const FRECCE = /[\u2190-\u21FF\u2794-\u27BF\u27F0-\u27FF\u2B00-\u2B0D\u25B6\u25BA\u25C0\u25C4]\uFE0F?/u;
const FRECCIA_IN_TESTA = new RegExp(`^([ \\t]*)${FRECCE.source}[ \\t]*`, "gmu");
const FRECCIA_IN_MEZZO = new RegExp(`[ \\t]*${FRECCE.source}[ \\t]*`, "gu");

const SOSTITUZIONI: Array<[RegExp, string]> = [
  [/≥/g, ">="], [/≤/g, "<="], [/[≈∼]/g, "~"], [/≠/g, "!="],
  [/[\u2212\u2010\u2011\u2012]/g, "-"],                  // il meno matematico e i trattini rari
  [/[\u2002-\u2008\u2009\u200A\u202F\u205F]/g, " "],      // spazi tipografici
  [/\u2153/g, "1/3"], [/\u2154/g, "2/3"], [/\u215B/g, "1/8"], [/\u215C/g, "3/8"],
  [/[\u25CF\u25AA\u25A0\u25C6\u25FC\u25FE\u2023\u2043\u2219]/g, "•"], // pallini e quadratini: il punto elenco
  [/[\u2018\u201B\u2032]/g, "‘"], [/[\u2033\u201F]/g, "“"],
];

// Pura decorazione: emoji, simboli vari, dingbat (spunte, stelle, cuori),
// selettori di variante, giunzioni invisibili.
const DECORAZIONI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{FE00}-\u{FE0F}\u{200B}-\u{200D}\u{2060}\u{20E3}\u{E0020}-\u{E007F}]/gu;

const LETTERE_COL_TRATTO: Record<string, string> = {
  "Đ": "D", "đ": "d", "Ł": "L", "ł": "l", "Ħ": "H", "ħ": "h", "ı": "i",
  "Ŧ": "T", "ŧ": "t", "Ə": "E", "ə": "e", "Ŋ": "N", "ŋ": "n",
};

export function testoPerPdf(valore: string): string {
  if (!valore) return valore;
  // La strada veloce: quasi sempre il testo è già stampabile.
  let tutto = true;
  for (const ch of valore) { if (!stampabile(ch)) { tutto = false; break; } }
  if (tutto) return valore;

  let s = valore
    .replace(FRECCIA_IN_TESTA, "$1")
    .replace(FRECCIA_IN_MEZZO, " – ");
  for (const [re, con] of SOSTITUZIONI) s = s.replace(re, con);
  s = s.replace(DECORAZIONI, "");

  // Quello che resta fuori alfabeto: la lettera senza l'accento, oppure niente.
  // Le lettere col tratto (Đ, ł, ħ) non si scompongono: le si scrive a mano.
  let out = "";
  for (const ch of s) {
    if (stampabile(ch)) { out += ch; continue; }
    if (LETTERE_COL_TRATTO[ch]) { out += LETTERE_COL_TRATTO[ch]; continue; }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (base && [...base].every(stampabile)) out += base;
  }

  // I buchi lasciati dai simboli tolti: niente doppi spazi, niente spazio
  // prima della punteggiatura, niente spazi in fondo alla riga.
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?)])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+(?=\S)/gm, (m) => (m.includes("\t") ? m : ""));
}

/**
 * Lo stesso, su tutti i testi di un oggetto: i dati di un documento arrivano da
 * decine di campi, e basta dimenticarne uno. Le immagini incorporate (data:…) e
 * gli indirizzi web si lasciano stare: sono già ASCII, e pesano megabyte.
 */
export function testiPerPdf<T>(valore: T): T {
  if (typeof valore === "string") {
    if (valore.startsWith("data:") || /^https?:\/\//.test(valore)) return valore;
    return testoPerPdf(valore) as unknown as T;
  }
  if (Array.isArray(valore)) return valore.map((v) => testiPerPdf(v)) as unknown as T;
  if (valore && typeof valore === "object" && Object.getPrototypeOf(valore) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valore as Record<string, unknown>)) out[k] = testiPerPdf(v);
    return out as T;
  }
  return valore;
}
