/**
 * Le due risposte che il nutrimento quotidiano riconosce da solo (19/10/2026,
 * sistema email v12 di EdiliziaInCloud, sezione 1.10).
 *
 * - «meno»: la persona resta nel nutrimento ma riceve un'email a settimana.
 *   Il contatto prende il tag TAG_NUTRIMENTO_MENO, e le attese dei flussi di
 *   nutrimento con `delay_ritmo_settimanale_tag` non scendono sotto i 7 giorni.
 * - «basta così»: esce da tutto lo stesso giorno (disiscrizione marketing).
 *
 * Ogni altra risposta lascia il nutrimento com'è: la risposta arriva a Flo in
 * posta, e il nutrimento continua (decisione del titolare, 19/10/2026).
 *
 * Si legge solo il testo scritto dalla persona, non la citazione dell'email a
 * cui risponde (che contiene le parole «meno» e «basta così» della nostra email).
 * Nessun import: lo prova src/test/logic/nutrimentoRisposte.test.ts.
 */

export const TAG_NUTRIMENTO_MENO = "nutrimento-meno";

export type RispostaNutrimento = "basta" | "meno" | "altro";

/** Il testo nuovo della risposta: tutto quello che viene prima della citazione. */
export function testoNuovoRisposta(testo: string): string {
  const righe = String(testo ?? "").replace(/\r\n?/g, "\n").split("\n");
  const nuove: string[] = [];
  for (const riga of righe) {
    const r = riga.trim();
    if (r.startsWith(">")) break;
    if (/^(il|on|el|le|am)\b.{0,160}\b(ha scritto|wrote|escribió|a écrit|schrieb)\s*:?\s*$/i.test(r)) break;
    if (/^-{2,}\s*(messaggio originale|original message)/i.test(r)) break;
    if (/^(da|from)\s*:\s*\S/i.test(r) && nuove.length > 0) break;
    nuove.push(riga);
  }
  return nuove.join("\n").trim();
}

export function classificaRispostaNutrimento(testo: string, oggetto = ""): RispostaNutrimento {
  const nuovo = testoNuovoRisposta(testo).toLowerCase();
  const prime = nuovo.slice(0, 200).replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
  const ogg = String(oggetto ?? "").toLowerCase();
  if (/\bbasta( cos[iì])?\b/.test(prime) || /\b(cancellatemi|disiscrivimi|disiscrivetemi|non scrivetemi più|non scrivetemi piu|non voglio più ricevere|non voglio piu ricevere|toglietemi)\b/.test(prime)) {
    return "basta";
  }
  if (/^meno\b/.test(prime) || /\bmeno email\b|\bmeno mail\b|\buna a settimana\b|\bmeno spesso\b/.test(prime)) {
    return "meno";
  }
  if (!prime && /\bbasta\b/.test(ogg)) return "basta";
  return "altro";
}
