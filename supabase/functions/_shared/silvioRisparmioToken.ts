/**
 * Quanto contesto manda silvio-chat a ogni passaggio (02/11/2026).
 *
 * Il conto che guida le scelte, Sonnet 4.5 a 3 $/M in ingresso:
 *  - scrittura in cache 3,75 $/M a 5 minuti, 6 $/M a un'ora; rilettura 0,30 $/M;
 *  - Anthropic mette in fila strumenti → sistema → messaggi: se cambia la lista
 *    strumenti si riscrive TUTTO, anche il sistema che non e' cambiato.
 *
 * Per questo qui si accorcia cio' che si riscrive a ogni messaggio (schema
 * degli strumenti) e NON si tagliano a posteriori i risultati vecchi: una volta
 * in cache costano un decimo, e riscriverli piu' corti invalida tutta la coda.
 */

/** Sola lettura: oltre, si risponde coi dati letti. 31 messaggi su 35 stanno entro 4. */
export const PASSAGGI_SOLA_LETTURA = 6;

/** Oltre i 6 messaggi piu' recenti lo storico si accorcia. */
export const STORICO_VECCHI = { recenti: 6, maxChars: 600 };

/** Budget del turno per i risultati degli strumenti: ~9K token, poi piu' corti. */
export const BUDGET_RISULTATI_TURNO = 32_000;
const RISULTATO_NORMALE = 8_000;
const RISULTATO_OLTRE_BUDGET = 3_000;

/** Il limite di caratteri per il prossimo risultato, dato cio' che e' gia' entrato. */
export function limiteRisultatoStrumento(charGiaUsati: number): number {
  return charGiaUsati >= BUDGET_RISULTATI_TURNO ? RISULTATO_OLTRE_BUDGET : RISULTATO_NORMALE;
}

export const CONCLUDI_ADESSO =
  "Controllo automatico: non puoi chiamare altri strumenti in questo turno. Rispondi adesso con i dati " +
  "gia' letti, dicendo chiaramente cosa non hai potuto verificare. Non presentare l'analisi come completa " +
  "se manca qualcosa e non dichiarare eseguita nessuna azione che non risulti dagli strumenti.";

/**
 * Regole fisse sui dati. Stavano nel blocco dinamico: senza nulla che cambi fra
 * un messaggio e l'altro, venivano riscritte ogni volta insieme a data e memoria.
 */
export const REGOLE_DATI_SILVIO = [
  "",
  "# REGOLE DUE-DILIGENCE NEI DATI",
  "1. PRIMA di rispondere a domande SU DATI AZIENDALI (commesse, fatture, cashflow, clienti, ecc), DEVI invocare il tool appropriato. NON inventare numeri.",
  "2. Se un tool ritorna un errore o dati vuoti, dillo esplicitamente.",
  "3. Se la domanda è cross-area (es. 'posso assumere?'), invoca PIÙ tool e sintetizza.",
  "4. Se il dato richiesto NON è coperto dai tool, dillo: 'Per questa info devi consultare [area]'.",
  "5. Riporta SEMPRE i numeri reali dai tool, non arrotondamenti vaghi.",
  "6. Cita sempre la fonte (es. 'in base alle 41 commesse attive registrate').",
  "7. Se un tool ritorna data_quality.warnings, non trattare lo zero come certezza: spiega cosa manca e dai solo una lettura prudente.",
  "8. Se un tool ritorna priorita_recupero o campi priorita, usa quell'ordine per dire chi/cosa fare prima.",
  "9. Non nominare mai personas/consulenti interni nella risposta finale: rispondi come una sola regia, Silvio.",
  "10. Se un tool ritorna proposalId, _proposal o riskLevel yellow/red, l'azione NON è conclusa: dì che è pronta/in attesa di conferma, non che è stata eseguita.",
  "11. PERIODI TEMPORALI: per domande su un MESE SPECIFICO passato ('mese scorso', 'aprile', 'come è andato marzo', 'fatturato di X mese', 'confronto vs mese precedente'), usa SEMPRE get_monthly_performance(year, month). Per 'mese scorso' calcola year/month dalla data corrente meno 1 mese. NON dire 'dati non disponibili' senza prima aver provato questo tool.",
  "",
  "# REGOLA FORMATO",
  "- Numeri sempre formato italiano: € 1.234,56",
  "- Date sempre dd/mm/yyyy",
  "- Risposte concise (max 250 parole) salvo richiesta esplicita di approfondimento",
].join("\n");

const APERTURA_DI_LETTURA =
  /^(?:quali|quale|qual|quanti|quante|quanto|quanta|quando|dove|chi|come|com'e|cosa|che cosa|perche|mostrami|mostra|elencami|elenca|dammi|dimmi|fammi vedere|ci sono|c'e|ho |abbiamo )/;

// Radici larghe di proposito: «pagate» o «registrate» fanno scattare il catalogo
// pieno anche se sono solo una domanda. Costa qualche token, mai una risposta.
const VERBO_DI_AZIONE =
  /\b(?:cre[ao]|crei|cream|creare|prepar|invi|mand|scriv|registr|segn|aggiorn|modific|cambi|correggi|cancell|elimin|annull|approv|conferm|proced|esegu|fiss|prenot|assegn|spost|pag|salv|caric|import|genera|emett|emiss|solleci|ricord|promemoria|bozz|aggiung|mett|blocc|chiud|compil|rispond|inoltr|allega|archivi|convert|duplic|stamp|pianific|convoc|notific|avvis|chiam|telefon|ordin|firm|fattur[ao]\b|fai\b|fare\b|farlo\b|facciamo|fammi(?! vedere))/;

/**
 * Vero solo per una domanda che chiaramente LEGGE: nessun allegato, apertura da
 * domanda o da elenco, nessun verbo che possa chiedere di fare qualcosa. Nel
 * dubbio e' falso, e il modello ha il catalogo di sempre.
 */
export function domandaDiSolaLettura(messaggio: string, conAllegati = false): boolean {
  if (conAllegati) return false;
  const testo = messaggio.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'");
  if (testo.length < 12 || testo.length > 300) return false;
  return APERTURA_DI_LETTURA.test(testo) && !VERBO_DI_AZIONE.test(testo);
}
