/**
 * Commessa generale dai documenti — riconoscere una pagina dal suo testo, senza AI (lotto 1 del
 * piano docs/piano-commessa-generale-da-documenti.md, §3.2 punto 4). Gira nel browser sul testo
 * nativo e nell'edge function sul testo dell'OCR: stesso codice, stesse regole.
 *
 * Due cose decide:
 * - la CLASSE (articolato, verbale, polizza, computo…): serve a mostrarla e a raggruppare;
 * - se la pagina va ESCLUSA perché contiene dati personali di terzi (documenti d'identità,
 *   autocertificazioni con i dati di nascita): resta nell'originale, non va all'estrazione.
 */

export interface Riconoscimento { classe: string; esclusa: boolean; motivo?: string }

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ");

/** Le regole in ordine: vince la prima che trova. */
const REGOLE: { classe: string; esclusa?: boolean; parole: RegExp }[] = [
  { classe: "Verbale di consegna", parole: /verbale di consegna|consegna in via d.urgenza|si procede alla consegna/ },
  { classe: "Polizza", parole: /polizza|contraente.{0,80}assicurat|somma assicurata|massimale/ },
  { classe: "Computo metrico", parole: /computo metrico|riporto|a riportare|quantit[aà].{0,40}prezzo unitario|n\.? ?ord\.?.{0,40}tariffa/ },
  { classe: "Elenco prezzi", parole: /elenco (dei )?prezzi|prezzo in lettere|euro\s*\/\s*(mq|mc|ml|kg|cad)/ },
  { classe: "Stima della sicurezza", parole: /oneri (della )?sicurezza|costi (della )?sicurezza|stima dei costi della sicurezza/ },
  { classe: "Cronoprogramma", parole: /cronoprogramma|diagramma di gantt/ },
  { classe: "Quadro economico", parole: /quadro economico|somme a disposizione/ },
  { classe: "Capitolato", parole: /capitolato speciale/ },
  { classe: "Atto notarile", parole: /repertorio n|notaio|compravendita|preliminare di vendita/ },
  { classe: "Titolo edilizio", parole: /permesso di costruire|s\.?c\.?i\.?a\.?|segnalazione certificata/ },
  { classe: "Articolato", parole: /\bart(icolo|\.)\s*\d+|premesso che|tra le parti|stazione appaltante|l.appaltatore/ },
  { classe: "Frontespizio", parole: /^.{0,400}(elaborato|tavola|allegato)\s*(n\.?\s*)?\d+/ },
];

/** Pagina senza testo (o quasi): la decide lo stato «bianca», non questa funzione. */
export const PAGINA_QUASI_VUOTA = 25;

/**
 * Un documento d'identità o un'autocertificazione con dati personali: la pagina è breve e ha
 * insieme la parola del documento e almeno due dati anagrafici. Una sola parola non basta: il
 * frontespizio di un atto che cita «carta d'identità» del firmatario è una pagina utile.
 */
const DOCUMENTO = /carta d.identit|identity card|passaporto|patente di guida|documento di riconoscimento/;
const AUTOCERTIFICAZIONE = /dichiarazione sostitutiva (di certificazione|dell.atto di notoriet)/;
const ANAGRAFICI = [/\bcognome\b/, /\bnat[oa] (a|il)\b|luogo di nascita/, /data di nascita/, /rilasciat[oa]/, /\bscadenza\b/, /statura/, /cittadinanza/, /residenza|residente in/, /codice fiscale/];
const MAX_CARATTERI_DOCUMENTO = 2500;

function datiPersonali(t: string): Riconoscimento | null {
  const anagrafici = ANAGRAFICI.filter((r) => r.test(t)).length;
  if (DOCUMENTO.test(t) && anagrafici >= 2 && t.length <= MAX_CARATTERI_DOCUMENTO) {
    return { classe: "Documento d'identità", esclusa: true, motivo: "Dati personali: la pagina resta nell'originale, non si legge. Se serve, «Includi questa pagina»." };
  }
  if (AUTOCERTIFICAZIONE.test(t) && anagrafici >= 2) {
    return { classe: "Autocertificazione", esclusa: true, motivo: "Dati personali: la pagina resta nell'originale, non si legge. Se serve, «Includi questa pagina»." };
  }
  return null;
}

/**
 * IBAN e codici fiscali di PERSONE (16 caratteri) si coprono prima di salvare il testo e prima
 * di mandarlo al modello. La partita IVA (11 cifre) resta: identifica committente e appaltatore.
 */
export function mascheraDatiPersonali(testo: string): string {
  return testo
    .replace(/\bIT\s?\d{2}\s?[A-Z](?:\s?[0-9A-Z]){22}\b/gi, "[IBAN]")
    .replace(/\b[A-Z]{6}\s?\d{2}[A-Z]\d{2}\s?[A-Z]\d{3}[A-Z]\b/gi, "[CODICE FISCALE]");
}

export function riconosciPagina(testo: string | null | undefined, opzioni: { includi?: boolean } = {}): Riconoscimento {
  const t = norm(testo ?? "");
  if (t.replace(/[^a-z0-9]/g, "").length < PAGINA_QUASI_VUOTA) return { classe: "Pagina quasi vuota", esclusa: false };
  if (!opzioni.includi) {
    const personale = datiPersonali(t);
    if (personale) return personale;
  }
  // Un articolato cita spesso oneri, polizze o consegna: con più articoli numerati è l'articolato.
  if ((t.match(/\bart(icolo|\.)\s*\d+/g) ?? []).length >= 2) return { classe: "Articolato", esclusa: false };
  for (const r of REGOLE) {
    if (r.parole.test(t)) {
      return r.esclusa
        ? { classe: r.classe, esclusa: true, motivo: "Dati personali: la pagina resta nell'originale, non si legge." }
        : { classe: r.classe, esclusa: false };
    }
  }
  return { classe: "Altro", esclusa: false };
}

/** Il nome del file dice spesso cosa è: un aiuto al primo menu, sempre cambiabile. */
export function documentoDalNome(nome: string): string {
  const n = norm(nome);
  if (/\.xpwe$|computo/.test(n)) return "computo";
  if (/elenco.?prezzi/.test(n)) return "elenco_prezzi";
  if (/sicurezza|psc|oneri/.test(n)) return "sicurezza";
  if (/crono/.test(n)) return "cronoprogramma";
  if (/capitolato|csa/.test(n)) return "capitolato";
  if (/verbale|consegna/.test(n)) return "verbale_consegna";
  if (/polizz|car|cauzion|fideiuss/.test(n)) return "polizze";
  if (/accordo.?quadro/.test(n)) return "accordo_quadro";
  if (/offerta|aggiudicaz/.test(n)) return "offerta";
  if (/quadro.?economico|relazione/.test(n)) return "quadro_economico";
  if (/business.?plan|\.xlsx$/.test(n)) return "business_plan";
  if (/atto|rogito|compromesso|preliminare/.test(n)) return "atto";
  if (/permesso|scia|cila|titolo/.test(n)) return "titolo";
  return "contratto";
}
