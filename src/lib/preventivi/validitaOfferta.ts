/**
 * Validità dell'offerta nei PDF degli otto moduli di preventivo.
 *
 * Il testo libero del template (`validity_text`) vince; senza, contano i giorni
 * predefiniti del template (`default_validita_giorni`); senza nemmeno quelli,
 * una frase senza numero. Prima i PDF scrivevano sempre «30 giorni», qualunque
 * validità avesse scelto l'azienda.
 */

/** Giorni di validità utilizzabili: un intero positivo, altrimenti null. */
export function giorniDiValidita(giorni: unknown): number | null {
  if (giorni === null || giorni === undefined || giorni === "") return null;
  const n = Math.trunc(Number(giorni));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const durata = (giorni: number) => (giorni === 1 ? "1 giorno" : `${giorni} giorni`);

/** La frase del riquadro di chiusura del PDF («Perché decidere ora»). */
export function fraseValiditaChiusura(testo: string | null | undefined, giorni: unknown): string {
  const libero = (testo ?? "").trim();
  if (libero) {
    // Il testo dell'editor è spesso già una frase completa («Offerta valida 30
    // giorni…»): incollarlo dopo «è valido» produceva doppioni sgrammaticati.
    const senzaPunto = libero.replace(/\.+$/, "");
    // Only duration fragments need a prefix. Preserve any other full free-text
    // statement, including demo notices, without turning it into a validity claim.
    const frammentoDurata = /^(?:per\s+)?(?:\d+|un|una|due|tre|quattro|cinque|sette|dieci|quindici|trenta|sessanta)\s+(?:giorn|settiman|mes|ann)/i.test(libero)
      || /^(?:fino|sino|entro)\s/i.test(libero);
    const frase = frammentoDurata ? `Questo preventivo è valido ${senzaPunto}` : senzaPunto;
    return /[!?]$/.test(frase) ? frase : `${frase}.`;
  }
  const n = giorniDiValidita(giorni);
  return n
    ? `Questo preventivo è valido ${durata(n)} dalla data di emissione.`
    : "Questo preventivo ha una validità limitata dalla data di emissione.";
}

/** Il testo del blocco «Validità dell'offerta» nelle condizioni del PDF. */
export function testoValiditaCondizioni(testo: string | null | undefined, giorni: unknown): string {
  const libero = (testo ?? "").trim();
  if (libero) return libero;
  const n = giorniDiValidita(giorni);
  return n
    ? `Preventivo valido ${durata(n)} dalla data di emissione, salvo diversa indicazione scritta.`
    : "Preventivo valido per un periodo limitato dalla data di emissione, salvo diversa indicazione scritta.";
}
