/**
 * Sequenze email + WhatsApp a mano (19/09/2026, flusso «Download Risorse —
 * PDF Vendita»): i pezzi puri che servono al motore delle automazioni.
 *
 * - numeroWhatsApp: il telefono del contatto come lo vuole wa.me (solo cifre,
 *   col prefisso internazionale), per il link che apre la chat dal telefono;
 * - conLinkCliccabili: nelle notifiche interne gli indirizzi erano testo
 *   morto, e dal telefono non si potevano toccare;
 * - senzaSpazioPrimaDellaVirgola: «Ciao {{nome}},» con il nome vuoto diventava
 *   «Ciao ,»;
 * - schedaAndataAvanti: la regola di «Interrompi su risposta» per chi non
 *   risponde per email — se la scheda del contatto entra in una fase dopo la
 *   prima mentre la sequenza gira, qualcuno se ne sta occupando a mano
 *   (ha scritto su WhatsApp, ha prenotato) e la sequenza si ferma;
 * - invioEmailDaRimandare / fusoDelFlusso: una sequenza che dura anni
 *   (Marketing Edile, 19/09/2026) non deve perdere un contatto per un guasto
 *   passeggero del provider, né mandare fuori orario per un fuso sbagliato.
 *
 * Provato in src/test/logic/sequenzaContatto.test.ts.
 */

/** «+39 333 123 4567» → «393331234567»; un cellulare senza prefisso prende il 39. */
export function numeroWhatsApp(telefono: string | null | undefined): string {
  let cifre = String(telefono ?? "").replace(/\D/g, "");
  if (cifre.startsWith("00")) cifre = cifre.slice(2);
  if (cifre.length === 10 && cifre.startsWith("3")) cifre = `39${cifre}`;
  return cifre.length >= 8 ? cifre : "";
}

/**
 * Gli indirizzi web di una riga GIÀ ripulita per l'HTML diventano link. La
 * punteggiatura in coda («…/gruppo.») resta fuori dal link.
 */
export function conLinkCliccabili(rigaHtml: string): string {
  return rigaHtml.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const coda = url.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
    const pulito = coda ? url.slice(0, -coda.length) : url;
    return `<a href="${pulito}" style="color:#1d4ed8">${pulito}</a>${coda}`;
  });
}

/** Lo spazio prima della virgola non è mai giusto: resta quando una variabile è vuota. */
export function senzaSpazioPrimaDellaVirgola(testo: string): string {
  return testo.replace(/ +,/g, ",");
}

/**
 * Durante la sequenza la scheda del contatto è entrata in una fase dopo la
 * prima della sua pipeline? La creazione non conta (entra nella prima fase),
 * uno spostamento a mano sì — anche verso «Perso» o «Non qualificato».
 */
export function schedaAndataAvanti(
  ingressi: Array<{ stage_id: string; entered_at: string | null }>,
  posizioni: Map<string, number | null>,
  inizioSequenza: string,
): boolean {
  const da = Date.parse(inizioSequenza);
  if (!Number.isFinite(da)) return false;
  return ingressi.some((i) => {
    const quando = i.entered_at ? Date.parse(i.entered_at) : NaN;
    if (!Number.isFinite(quando) || quando <= da) return false;
    const posizione = posizioni.get(i.stage_id);
    return typeof posizione === "number" && posizione > 0;
  });
}

/**
 * Un'email di marketing non partita per colpa del provider (occupato, giù,
 * troppo lento) si rimanda invece di chiudere l'iscrizione. Prima il motore
 * ritentava tre volte in due-tre minuti e poi dava il passo per fallito: un
 * guasto di mezz'ora, o il limite orario di Elastic il martedì alle 8:30,
 * toglieva per sempre il contatto da una sequenza pensata per non finire mai.
 * Le email di servizio (commessa, promemoria) restano come prima: arrivare con
 * un giorno di ritardo è peggio che non arrivare. 0 = nessuna risposta.
 */
const ESITI_PASSEGGERI = new Set([0, 408, 425, 429, 500, 502, 503, 504]);
export const MINUTI_RINVIO_EMAIL = 30;

export function invioEmailDaRimandare(status: number, stream: string): boolean {
  return stream === "marketing" && ESITI_PASSEGGERI.has(status);
}

/**
 * Il provider ha rifiutato il MITTENTE, non il messaggio: Elastic Email
 * risponde «From email address: "flo@…" not allowed», Resend «The … domain is
 * not verified». Non è un guasto passeggero ma una configurazione che manca,
 * quindi ritentare lo stesso indirizzo non serve: il 22/09/2026 sono stati
 * respinti 117 invii in un'ora e mezza e senza ripiego quei contatti sarebbero
 * rimasti senza email. Chi invia riprova UNA volta col mittente di piattaforma.
 */
const SEGNALI_MITTENTE_RIFIUTATO = [
  "from email address",
  "is not verified",
  "domain not verified",
  "sender not allowed",
  "unverified sender",
];

export function mittenteRifiutatoDalProvider(status: number, corpo: unknown): boolean {
  if (![400, 401, 403, 422].includes(status)) return false;
  const testo = (typeof corpo === "string" ? corpo : JSON.stringify(corpo ?? "")).toLowerCase();
  return SEGNALI_MITTENTE_RIFIUTATO.some((s) => testo.includes(s));
}

/** L'indirizzo dentro un «Nome <indirizzo>», o la stringa stessa. */
export function soloIndirizzo(mittente: string): string {
  return (mittente.match(/<([^>]+)>/)?.[1] ?? mittente).trim().toLowerCase();
}

/** Mittente di riserva: il nome di chi scrive, l'indirizzo di piattaforma. */
export function mittenteDiRiserva(nome: string | null | undefined, predefinito: string): string {
  const indirizzo = (predefinito.match(/<([^>]+)>/)?.[1] ?? predefinito).trim();
  const n = (nome ?? "").trim();
  return n && indirizzo.includes("@") ? `${n} <${indirizzo}>` : predefinito;
}

/**
 * Il fuso con cui leggere la finestra oraria del flusso. «account» (il valore
 * predefinito delle impostazioni) e «contact» non sono fusi: passati a Intl
 * davano errore e la finestra «dalle 8 alle 20» si calcolava in UTC, due ore
 * indietro d'estate. Tutto ciò che non è un fuso vero vale come Roma.
 */
export function fusoDelFlusso(fuso: unknown): string {
  const f = String(fuso ?? "").trim();
  if (!f) return "Europe/Rome";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: f });
    return f;
  } catch {
    return "Europe/Rome";
  }
}
