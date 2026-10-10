/**
 * La «scheda dell'azienda» delle fatture (tabella anagrafica_azienda): i dati fiscali che escono sui documenti.
 *
 * Nasce in due modi:
 *  - dalla pagina Fatturazione, al primo «Salva», con i dati che l'azienda ha già nel Profilo aziendale e quelli che
 *    ha scritto: se ne manca uno che il database vuole, si dice quale e non si crea niente;
 *  - dalla prima fattura (useCreateDocumento), con dei segnaposto dove il database vuole un valore e non c'è:
 *    «Da configurare», partita IVA 00000000000, CAP 00000, provincia XX. Quei valori non sono dati veri: la pagina
 *    li mostra come campi da completare e non li considera mai buoni per attivare l'invio allo SDI.
 */
import { userErrorMessage } from "@/lib/userErrorMessage";

/** I valori provvisori che la prima fattura scrive dove il database vuole qualcosa. */
export const SEGNAPOSTO_SCHEDA = {
  testo: "Da configurare",
  partita_iva: "00000000000",
  cap: "00000",
  provincia: "XX",
} as const;

// Nell'ordine in cui i campi stanno nella pagina: è l'ordine in cui l'avviso li elenca.
const SEGNAPOSTO_PER_CAMPO: Record<string, string> = {
  ragione_sociale: SEGNAPOSTO_SCHEDA.testo,
  partita_iva: SEGNAPOSTO_SCHEDA.partita_iva,
  codice_fiscale: SEGNAPOSTO_SCHEDA.partita_iva,
  indirizzo_via: SEGNAPOSTO_SCHEDA.testo,
  indirizzo_cap: SEGNAPOSTO_SCHEDA.cap,
  indirizzo_comune: SEGNAPOSTO_SCHEDA.testo,
  indirizzo_provincia: SEGNAPOSTO_SCHEDA.provincia,
};

export type DatiScheda = Record<string, unknown>;

/** Il valore è quello provvisorio della prima fattura, non un dato dell'azienda. */
export function eSegnaposto(campo: string, valore: unknown): boolean {
  return typeof valore === "string" && valore.trim() !== "" && SEGNAPOSTO_PER_CAMPO[campo] === valore.trim();
}

/** La scheda com'è da mostrare: i segnaposto diventano campi vuoti da compilare. */
export function schedaDaMostrare(scheda: DatiScheda | null | undefined): DatiScheda {
  const risultato: DatiScheda = { ...(scheda ?? {}) };
  for (const campo of Object.keys(SEGNAPOSTO_PER_CAMPO)) {
    if (eSegnaposto(campo, risultato[campo])) risultato[campo] = "";
  }
  return risultato;
}

const NOMI: Record<string, string> = {
  ragione_sociale: "ragione sociale",
  partita_iva: "partita IVA (11 cifre)",
  codice_fiscale: "codice fiscale",
  forma_giuridica: "forma giuridica",
  indirizzo_via: "indirizzo della sede",
  indirizzo_cap: "CAP (5 cifre)",
  indirizzo_comune: "comune",
  indirizzo_provincia: "provincia (2 lettere)",
};

/** I campi della scheda che sono ancora provvisori (il nome come lo legge l'utente). */
export function campiProvvisori(scheda: DatiScheda | null | undefined): string[] {
  if (!scheda) return [];
  return Object.keys(SEGNAPOSTO_PER_CAMPO).filter((c) => eSegnaposto(c, scheda[c])).map((c) => NOMI[c]);
}

const soloCifre = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const testo = (v: unknown) => String(v ?? "").trim();

/** I dati dell'azienda nel Profilo aziendale (companies), come servono alla scheda fiscale. */
export interface ProfiloAzienda {
  name?: string | null;
  business_name?: string | null;
  vat_number?: string | null;
  fiscal_code?: string | null;
  legal_address?: string | null;
  legal_city?: string | null;
  legal_province?: string | null;
  legal_postal_code?: string | null;
  pec?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
}

/**
 * Dal Profilo aziendale alla scheda fiscale. Solo quello che il profilo ha e che ha il formato giusto: un CAP di
 * quattro cifre o una provincia scritta per esteso restano fuori (campo vuoto da compilare, non un valore che il
 * database rifiuterebbe).
 */
export function schedaDalProfilo(profilo: ProfiloAzienda | null | undefined): DatiScheda {
  if (!profilo) return {};
  const piva = soloCifre(profilo.vat_number);
  const cf = testo(profilo.fiscal_code).toUpperCase();
  const cap = soloCifre(profilo.legal_postal_code);
  const provincia = testo(profilo.legal_province).toUpperCase();
  const dati: DatiScheda = {
    ragione_sociale: testo(profilo.business_name) || testo(profilo.name),
    partita_iva: piva.length === 11 ? piva : "",
    codice_fiscale: cf.length === 11 || cf.length === 16 ? cf : "",
    indirizzo_via: testo(profilo.legal_address),
    indirizzo_cap: cap.length === 5 ? cap : "",
    indirizzo_comune: testo(profilo.legal_city),
    indirizzo_provincia: provincia.length === 2 ? provincia : "",
    pec: testo(profilo.pec),
    email: testo(profilo.email),
    telefono: testo(profilo.phone),
    sito_web: testo(profilo.website),
  };
  // Solo i campi pieni: un campo vuoto non deve nascondere un valore che l'utente sta per scrivere.
  return Object.fromEntries(Object.entries(dati).filter(([, v]) => v !== ""));
}

/** Quello che il database vuole per creare la scheda: nome di ogni campo che manca o non è nel formato giusto. */
export function campiMancantiPerCreare(dati: DatiScheda): string[] {
  const mancanti: string[] = [];
  if (!testo(dati.ragione_sociale)) mancanti.push(NOMI.ragione_sociale);
  if (soloCifre(dati.partita_iva).length !== 11) mancanti.push(NOMI.partita_iva);
  const cf = testo(dati.codice_fiscale);
  if (cf.length !== 11 && cf.length !== 16) mancanti.push(NOMI.codice_fiscale);
  if (!testo(dati.forma_giuridica)) mancanti.push(NOMI.forma_giuridica);
  if (!testo(dati.indirizzo_via)) mancanti.push(NOMI.indirizzo_via);
  if (soloCifre(dati.indirizzo_cap).length !== 5) mancanti.push(NOMI.indirizzo_cap);
  if (!testo(dati.indirizzo_comune)) mancanti.push(NOMI.indirizzo_comune);
  if (!/^[A-Za-z]{2}$/.test(testo(dati.indirizzo_provincia))) mancanti.push(NOMI.indirizzo_provincia);
  return mancanti;
}

/** Lo SDI parte solo con dati veri: partita IVA e ragione sociale non provvisorie, e una PEC o un'email. */
export function datiBastanoPerAttivare(scheda: DatiScheda | null | undefined): boolean {
  if (!scheda) return false;
  return (
    soloCifre(scheda.partita_iva).length === 11 &&
    !eSegnaposto("partita_iva", scheda.partita_iva) &&
    testo(scheda.ragione_sociale) !== "" &&
    !eSegnaposto("ragione_sociale", scheda.ragione_sociale) &&
    (testo(scheda.pec) !== "" || testo(scheda.email) !== "")
  );
}

/**
 * Perché un salvataggio è fallito, in italiano. I controlli del database sulla partita IVA e sul codice fiscale
 * rispondono già con una frase chiara («Partita IVA non valida: …»): si legge quella. Il resto passa per la
 * traduzione degli errori tecnici.
 */
export function messaggioErroreSalvataggio(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === "23514" && /non valid/i.test(e.message ?? "")) return String(e?.message);
  return userErrorMessage(err, "Riprova tra poco.");
}
