/**
 * Il testo che arriva al PDF. Il font incorporato (Roboto) non ha frecce, spunte, avvisi, emoji né lo spazio stretto
 * U+202F: un testo incollato da Word, WhatsApp o proposto dall'AI («Prima → durante → dopo») fermava anteprima e
 * approvazione con un codice Unicode. Qui i simboli di uso comune diventano testo equivalente; ciò che resta senza
 * glifo continua a fermare la generazione, perché un carattere perso in silenzio in un documento di sicurezza è peggio
 * di un errore. Le parole lunghe senza spazi (e-mail, impronte, URL) si spezzano con uno zero-width space: pdfmake non
 * le spezza e uscivano dalla pagina, con i valori che sparivano dal documento.
 *
 * Codice puro, senza Deno né browser.
 */

const SIMBOLI: ReadonlyArray<readonly [string, string]> = [
  ["→", "->"], ["➔", "->"], ["➜", "->"], ["➡", "->"], ["⟶", "->"], ["⇒", "=>"], ["←", "<-"], ["⇐", "<="], ["↔", "<->"],
  ["↑", "(su)"], ["↓", "(giù)"],
  ["►", ">"], ["▶", ">"], ["▪", "-"], ["◼", "-"], ["◾", "-"], ["★", "*"], ["☆", "*"], ["✱", "*"],
  ["✓", "[x]"], ["✔", "[x]"], ["☑", "[x]"], ["✅", "[x]"], ["☒", "[x]"], ["☐", "[ ]"],
  ["✗", "X"], ["✘", "X"], ["❌", "X"],
  ["⚠", "(!)"], ["⚡", "(!)"], ["☎", "Tel."], ["✆", "Tel."], ["✉", "@"],
  ["⌀", "Ø"], ["℃", "°C"], ["℉", "°F"], ["㎡", "m²"], ["㎥", "m³"], ["㎜", "mm"], ["㎝", "cm"], ["㎞", "km"], ["㎏", "kg"], ["㎖", "ml"],
];
const MAPPA = new Map(SIMBOLI);
const RICONOSCIUTI = new RegExp(`[${SIMBOLI.map(([c]) => c).join("")}]`, "gu");
/** Spazi tipografici (en, em, sottile, stretto…) che il font non ha: spazio normale. */
const SPAZI_TIPOGRAFICI = /[ -   　]/g;
/** Selettori e giunzioni invisibili (variation selector, ZWJ, BOM…): nessun glifo, si tolgono. */
const INVISIBILI = /[︎️‌‍⁠﻿]/g;
/** Emoji e pittogrammi decorativi rimasti dopo le sostituzioni mirate. */
const PITTOGRAMMI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

export function sostituisciSimboliPdf(testo: string): string {
  const senza = testo
    .replace(RICONOSCIUTI, (c) => MAPPA.get(c) ?? c)
    .replace(SPAZI_TIPOGRAFICI, " ")
    .replace(INVISIBILI, "");
  if (!PITTOGRAMMI.test(senza)) return senza;
  PITTOGRAMMI.lastIndex = 0;
  // Togliere un'emoji lascia due spazi di fila o uno spazio a bordo: si ricompongono.
  return senza.replace(PITTOGRAMMI, "").replace(/ {2,}/g, " ").replace(/^ +| +$/g, "");
}

const ZWSP = "​";
const PAROLA_LUNGA = 28;
const BLOCCO = 24;
const SEPARATORI = /([@/._:=&?+,;-])(?=[^\s​])/g;

/** Inserisce un punto d'a capo (zero-width space) nelle parole più lunghe di 28 caratteri. */
export function spezzaParoleLunghe(testo: string): string {
  return testo.replace(/[^\s​]{29,}/g, (parola) => {
    // Prima dopo i separatori naturali, poi a blocchi se qualche tratto resta lungo.
    const conSeparatori = parola.replace(SEPARATORI, `$1${ZWSP}`);
    return conSeparatori.split(ZWSP).map((tratto) => {
      if (tratto.length <= PAROLA_LUNGA) return tratto;
      const pezzi: string[] = [];
      for (let i = 0; i < tratto.length; i += BLOCCO) pezzi.push(tratto.slice(i, i + BLOCCO));
      return pezzi.join(ZWSP);
    }).join(ZWSP);
  });
}

export const testoPerPdf = (testo: string): string => spezzaParoleLunghe(sostituisciSimboliPdf(testo));

/**
 * Le caselle ☒ e ☐ (anche quelle incollate da Word) il PDF le disegna con un mini-font: nel testo si lasciano due segni
 * privati, che il layout trasforma in simboli e che per il controllo dei glifi tornano «[x]» e «[ ]». I segni privati
 * scritti da un utente si tolgono prima: nessuno può fingere una casella.
 */
export const MARCA_CASELLA_SI = "";
export const MARCA_CASELLA_NO = "";
const SEGNI_PRIVATI = /[-]/g;
export const testoPerPdfConCaselle = (testo: string): string =>
  testoPerPdf(testo.replace(SEGNI_PRIVATI, "").replace(/[☒☑]/g, MARCA_CASELLA_SI).replace(/☐/g, MARCA_CASELLA_NO));
/** Il testo con le caselle in lettere, come lo vede il controllo dei glifi. */
export const caselleInLettere = (testo: string): string => testo.replaceAll(MARCA_CASELLA_SI, "[x]").replaceAll(MARCA_CASELLA_NO, "[ ]");
