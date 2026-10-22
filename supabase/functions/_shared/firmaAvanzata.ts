/**
 * Firma elettronica avanzata (FEA): i pezzi comuni alle funzioni della firma.
 *
 * - Livello per azienda (`fea_configurazione.livello_firma`): 'semplice' di
 *   partenza (firma col solo codice, come prima); 'avanzata' se l'azienda la
 *   accende. Fissato sulla richiesta all'invio.
 * - Dichiarazione di accettazione delle condizioni del servizio (DPCM
 *   22/02/2013 art. 57 c.1 a): testo versionato, la sua impronta si salva con
 *   l'accettazione e una copia va per email a chi firma (art. 57 c.1 c).
 * - Sessione di firma: dopo il codice giusto il server consegna al browser una
 *   chiave segreta valida 15 minuti; senza quella non si firma (controllo
 *   esclusivo del firmatario, art. 56 c.1 c). Nel database ne resta solo
 *   l'impronta.
 * - Firmatario identificato: uno per azienda ed email, con documento valido.
 *   L'identificazione la fa chi firma (foto dalla pagina di firma) o l'azienda
 *   (dal gestionale, dopo aver visto il documento); la dichiarazione la accetta
 *   sempre e solo chi firma, dopo il codice.
 */

export type LivelloFirma = "avanzata" | "semplice";

export const DICHIARAZIONE_VERSIONE = "2026-10-22";
export const DURATA_SESSIONE_FIRMA_MS = 15 * 60 * 1000;
/** Tetti per richiesta: codici inviati e codici sbagliati in tutto. */
export const MAX_CODICI_INVIATI = 10;
export const MAX_ERRORI_TOTALI = 15;

export const TIPI_DOCUMENTO_IDENTITA: Record<string, string> = {
  carta_identita: "Carta d'identità",
  passaporto: "Passaporto",
  patente: "Patente di guida",
};

// deno-lint-ignore no-explicit-any
export async function livelloFirmaAzienda(sb: any, companyId: string): Promise<LivelloFirma> {
  const { data } = await sb.from("fea_configurazione").select("livello_firma").eq("company_id", companyId).maybeSingle();
  return data?.livello_firma === "avanzata" ? "avanzata" : "semplice";
}

/** Il testo che chi firma accetta prima del primo documento con questa azienda. */
export function testoDichiarazione(azienda: string, sitoPubblico: string): string {
  return [
    `Dichiarazione di accettazione delle condizioni del servizio di firma elettronica avanzata di ${azienda}`,
    "",
    `1. Chiedo di usare la firma elettronica avanzata messa a disposizione da ${azienda} (di seguito «l'Azienda») tramite la piattaforma Edilizia in Cloud, per firmare i documenti che l'Azienda mi invia.`,
    "2. Mi identifico con il documento di riconoscimento di cui carico la copia e dichiaro che i dati che indico sono veri. Sono consapevole delle conseguenze penali delle dichiarazioni false (art. 76 del DPR 445/2000).",
    "3. Come funziona: firmo dopo aver letto il documento, con un codice monouso che ricevo sulla mia email e, se indicato, sul mio cellulare. Il codice è personale: mi impegno a non comunicarlo a nessuno e a custodire l'accesso alla mia email e al mio cellulare. Del documento si registra l'impronta informatica, che dimostra se è stato modificato dopo la firma; si registrano anche data e ora, indirizzo di rete e dispositivo usati.",
    "4. Limiti d'uso: la firma elettronica avanzata vale solo nei rapporti tra me e l'Azienda (art. 60 del DPCM 22 febbraio 2013).",
    "5. Conservazione: questa dichiarazione, la copia del documento di riconoscimento e le prove di ogni firma si conservano per almeno 20 anni (art. 57 c.1 b del DPCM 22 febbraio 2013).",
    "6. Ricevo gratuitamente copia di questa dichiarazione per email e posso chiedere in ogni momento all'Azienda, senza costi, copia della dichiarazione e delle informazioni sul servizio.",
    "7. Posso revocare in ogni momento l'adesione al servizio chiedendolo all'Azienda; la revoca vale per le firme successive.",
    `8. Le caratteristiche del sistema e le tecnologie usate sono pubblicate su ${sitoPubblico}/firma-elettronica-avanzata.`,
    "9. I miei dati sono trattati dall'Azienda, titolare del trattamento, per identificarmi e dare valore alla firma, secondo il Regolamento UE 2016/679.",
  ].join("\n");
}

export async function impronta(testo: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Una nuova chiave di sessione: va al browser; nel database solo l'impronta. */
export function nuovaSessioneFirma(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const sessioneValida = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);

/** La chiave arrivata dal browser corrisponde a quella data dopo il codice, e non è scaduta. */
export async function controllaSessioneFirma(
  r: { sessione_firma_hash: string | null; sessione_firma_scadenza: string | null },
  sessione: unknown,
  ora = Date.now(),
): Promise<boolean> {
  if (!sessioneValida(sessione) || !r.sessione_firma_hash || !r.sessione_firma_scadenza) return false;
  const scade = Date.parse(r.sessione_firma_scadenza);
  if (!Number.isFinite(scade) || scade <= ora) return false;
  return (await impronta(sessione)) === r.sessione_firma_hash;
}

export interface Firmatario {
  id: string;
  nome: string;
  cognome: string;
  codice_fiscale: string | null;
  documento_tipo: string;
  documento_numero: string;
  documento_scadenza: string;
  modalita: "autonoma" | "azienda";
  dichiarazione_versione: string | null;
  dichiarazione_hash: string | null;
  dichiarazione_accettata_at: string | null;
}

const oggiRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

/**
 * Il firmatario identificato per l'azienda, con documento non scaduto (la
 * dichiarazione può mancare se l'ha identificato l'azienda: va accettata).
 */
// deno-lint-ignore no-explicit-any
export async function firmatarioIdentificato(sb: any, companyId: string, email: string | null): Promise<Firmatario | null> {
  if (!email) return null;
  const { data } = await sb.from("fea_firmatari")
    .select("id, nome, cognome, codice_fiscale, documento_tipo, documento_numero, documento_scadenza, modalita, dichiarazione_versione, dichiarazione_hash, dichiarazione_accettata_at")
    .eq("company_id", companyId).ilike("email", email.trim().replace(/[\\%_]/g, (c) => `\\${c}`)).is("revocato_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data || String(data.documento_scadenza) < oggiRoma()) return null;
  return data as Firmatario;
}

/** Cosa manca a chi firma prima di firmare con firma avanzata. */
export interface StatoIdentificazione {
  firmatario: Firmatario | null;
  serveDocumento: boolean;
  serveDichiarazione: boolean;
}
// deno-lint-ignore no-explicit-any
export async function statoIdentificazione(sb: any, companyId: string, email: string | null): Promise<StatoIdentificazione> {
  const firmatario = await firmatarioIdentificato(sb, companyId, email);
  return { firmatario, serveDocumento: !firmatario, serveDichiarazione: !firmatario?.dichiarazione_accettata_at };
}

/** Numero del documento mascherato per il certificato: solo le ultime 3 cifre. */
export function mascheraNumeroDocumento(n: string): string {
  const s = n.replace(/\s+/g, "");
  return s.length <= 3 ? "***" : `${"*".repeat(Math.min(6, s.length - 3))}${s.slice(-3)}`;
}

export const ipDellaRichiesta = (req: Request): string | null =>
  (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
