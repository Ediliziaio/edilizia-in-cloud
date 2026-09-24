/**
 * Fatture dei fornitori da openapi.it — la parte che non parla con la rete.
 *
 * Fino al 24/09/2026 le fatture passive entravano solo a mano: un file alla
 * volta o uno zip dalla pagina Fatture ricevute. Chi invia con openapi può
 * anche RICEVERE con openapi (codice destinatario PIC7CPS registrato
 * all'Agenzia delle Entrate): la funzione openapi-fatture-ricevute le va a
 * prendere, e questo modulo fa i conti che lei non deve sbagliare.
 *
 *   · Il file che arriva dallo SDI è spesso FIRMATO: una busta CAdES (.p7m)
 *     con dentro l'XML. Qui si apre la busta senza librerie: una fattura non
 *     si perde perché il fornitore firma.
 *   · Gli allegati di una fattura openapi possono essere più d'uno: la
 *     fattura, il PDF di cortesia, il file metadati dello SDI (…_MT_001.xml).
 *     Si sceglie il file giusto, non il primo.
 *   · Le chiamate di openapi quando arriva una fattura (callback) portano un
 *     gettone che si ricalcola dalla chiave di servizio: nessun segreto nuovo
 *     da configurare.
 *
 * La firma NON si verifica: si estrae il contenuto. La fattura l'ha già
 * controllata lo SDI prima di consegnarla (una firma non valida è motivo di
 * scarto, codice 00102), e il file originale si conserva così com'è.
 *
 * Modulo puro: lo usa openapi-fatture-ricevute, lo provano i test in
 * src/test/logic/ricevuteOpenapi.test.ts.
 */

// ── La busta firmata (.p7m) ──────────────────────────────────────────────

/** 1.2.840.113549.1.7.2 — signedData, codificato come lo scrive l'ASN.1. */
const OID_SIGNED_DATA = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02];

/** Oltre questa profondità il file è rotto o costruito apposta per bloccare. */
const PROFONDITA_MASSIMA = 32;

interface Tlv {
  /** Primo byte dell'etichetta: classe, costruito, numero. */
  tag: number;
  /** Dove comincia il contenuto. */
  contenuto: number;
  /** Dove finisce il contenuto (esclusi gli 00 00 di chiusura). */
  fineContenuto: number;
  /** Il primo byte dopo l'elemento. */
  fine: number;
}

/**
 * Legge un elemento DER o BER a partire da `pos`. Le buste delle fatture
 * arrivano in tutte e due le forme: DER con le lunghezze scritte, BER «a
 * flusso» con la lunghezza indefinita e il contenuto spezzato in pezzi. Il
 * secondo caso è quello che fa sbagliare chi cerca l'XML a occhio nel file:
 * tra un pezzo e l'altro ci sono byte di intestazione, e la fattura ne esce
 * guasta.
 */
function leggiTlv(b: Uint8Array, pos: number, limite: number, profondita = 0): Tlv | null {
  if (profondita > PROFONDITA_MASSIMA || pos + 2 > limite) return null;
  const tag = b[pos];
  let p = pos + 1;
  if ((tag & 0x1f) === 0x1f) {
    // Etichetta lunga: continua finché il bit alto è acceso.
    while (p < limite && (b[p] & 0x80) !== 0) p++;
    p++;
  }
  if (p >= limite) return null;
  const primo = b[p++];

  if (primo === 0x80) {
    // Lunghezza indefinita: valgono solo i costruiti, e finiscono con 00 00.
    if ((tag & 0x20) === 0) return null;
    let q = p;
    for (;;) {
      if (q + 2 > limite) return null;
      if (b[q] === 0 && b[q + 1] === 0) return { tag, contenuto: p, fineContenuto: q, fine: q + 2 };
      const figlio = leggiTlv(b, q, limite, profondita + 1);
      if (!figlio) return null;
      q = figlio.fine;
    }
  }

  let lunghezza = primo;
  if (primo > 0x80) {
    const n = primo & 0x7f;
    if (n > 4 || p + n > limite) return null;
    lunghezza = 0;
    for (let i = 0; i < n; i++) lunghezza = lunghezza * 256 + b[p++];
  }
  const fine = p + lunghezza;
  if (fine > limite) return null;
  return { tag, contenuto: p, fineContenuto: fine, fine };
}

function figli(b: Uint8Array, t: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let q = t.contenuto;
  while (q < t.fineContenuto) {
    const f = leggiTlv(b, q, t.fineContenuto);
    if (!f) break;
    out.push(f);
    q = f.fine;
  }
  return out;
}

function eOid(b: Uint8Array, t: Tlv | undefined, oid: number[]): boolean {
  if (!t || t.tag !== 0x06 || t.fineContenuto - t.contenuto !== oid.length) return false;
  return oid.every((x, i) => b[t.contenuto + i] === x);
}

/** I byte di un OCTET STRING: in un pezzo solo (0x04) o spezzato (0x24). */
function ottetti(b: Uint8Array, t: Tlv, pezzi: Uint8Array[], profondita = 0): boolean {
  if (t.tag === 0x04) {
    pezzi.push(b.subarray(t.contenuto, t.fineContenuto));
    return true;
  }
  if (t.tag !== 0x24 || profondita > PROFONDITA_MASSIMA) return false;
  return figli(b, t).every((f) => ottetti(b, f, pezzi, profondita + 1));
}

/**
 * Il contenuto firmato di una busta CAdES/PKCS#7, oppure null.
 *
 *   ContentInfo  SEQUENCE { signedData OID, [0] {
 *     SignedData SEQUENCE { versione, algoritmi, encapContentInfo SEQUENCE {
 *       tipo OID, [0] { OCTET STRING ← qui c'è la fattura } }, certificati… } } }
 */
export function contenutoP7m(b: Uint8Array): Uint8Array | null {
  const radice = leggiTlv(b, 0, b.length);
  if (!radice || radice.tag !== 0x30) return null;
  const [tipo, esplicito] = figli(b, radice);
  if (!eOid(b, tipo, OID_SIGNED_DATA) || esplicito?.tag !== 0xa0) return null;

  const signedData = figli(b, esplicito)[0];
  if (signedData?.tag !== 0x30) return null;
  // versione (INTEGER), algoritmi (SET), poi la prima SEQUENCE: il contenuto.
  const encap = figli(b, signedData).find((f) => f.tag === 0x30);
  if (!encap) return null;
  const involucro = figli(b, encap).find((f) => f.tag === 0xa0);
  // Firma «staccata»: il contenuto non c'è. Non è una fattura da leggere.
  if (!involucro) return null;
  const stringa = figli(b, involucro)[0];
  if (!stringa) return null;

  const pezzi: Uint8Array[] = [];
  if (!ottetti(b, stringa, pezzi)) return null;
  if (pezzi.length === 1) return pezzi[0];
  const totale = pezzi.reduce((s, x) => s + x.length, 0);
  const unito = new Uint8Array(totale);
  let at = 0;
  for (const x of pezzi) {
    unito.set(x, at);
    at += x.length;
  }
  return unito;
}

// ── Dal file all'XML ─────────────────────────────────────────────────────

const BOM_UTF8 = [0xef, 0xbb, 0xbf];

function saltaBomESpazi(b: Uint8Array): number {
  let i = b.length >= 3 && BOM_UTF8.every((x, k) => b[k] === x) ? 3 : 0;
  while (i < b.length && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++;
  return i;
}

/**
 * Da byte a testo, con la codifica che il file dichiara. FatturaPA ammette
 * UTF-8 e ISO-8859-1; qualche gestionale dichiara UTF-8 e scrive Latin-1, e
 * le lettere accentate diventerebbero punti interrogativi: in quel caso si
 * riprova in Latin-1 (windows-1252, che lo contiene).
 */
function decodificaXml(b: Uint8Array): string {
  const testa = new TextDecoder("windows-1252").decode(b.subarray(0, 200));
  const dichiarata = /<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/i.exec(testa)?.[1]?.toLowerCase();
  if (dichiarata && dichiarata !== "utf-8" && dichiarata !== "utf8") {
    try {
      return new TextDecoder(dichiarata).decode(b);
    } catch {
      // Codifica sconosciuta: si prova come se fosse UTF-8.
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    const inizio = b.length >= 3 && BOM_UTF8.every((x, k) => b[k] === x) ? 3 : 0;
    return new TextDecoder("windows-1252").decode(b.subarray(inizio));
  }
}

/** Un file scritto in base64 (così lo restituiscono certe API), decodificato. */
function daBase64(b: Uint8Array): Uint8Array | null {
  if (b.length < 16) return null;
  const testo = new TextDecoder("windows-1252").decode(b);
  if (!/^[A-Za-z0-9+/=_\-\s]+$/.test(testo)) return null;
  let pulito = testo.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (pulito.length % 4 === 1) return null;
  while (pulito.length % 4 !== 0) pulito += "=";
  try {
    const binario = atob(pulito);
    const out = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) out[i] = binario.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const APERTURA_FATTURA = /<\?xml|<([A-Za-z_][\w.-]*:)?FatturaElettronica[\s>]/;
const CHIUSURA_FATTURA = /<\/([A-Za-z_][\w.-]*:)?FatturaElettronica\s*>/g;

/**
 * Ultima spiaggia per una busta che non si riesce a leggere come ASN.1: la
 * fattura cercata come testo dentro il file. Si accetta solo se nel tratto
 * trovato non ci sono byte di controllo — cioè se non è spezzata in pezzi,
 * che la guasterebbero in silenzio (una descrizione con dentro byte a caso).
 */
function xmlCercatoNelFile(b: Uint8Array): string | null {
  // windows-1252: un carattere per byte, gli indici restano quelli del file.
  const testo = new TextDecoder("windows-1252").decode(b);
  const apertura = APERTURA_FATTURA.exec(testo);
  if (!apertura) return null;
  let fine = -1;
  for (const m of testo.matchAll(CHIUSURA_FATTURA)) fine = (m.index ?? 0) + m[0].length;
  if (fine <= apertura.index) return null;
  const tratto = b.subarray(apertura.index, fine);
  for (const x of tratto) {
    if (x < 0x20 && x !== 0x09 && x !== 0x0a && x !== 0x0d) return null;
  }
  return decodificaXml(tratto);
}

/**
 * L'XML di una fattura a partire dal file ricevuto, qualunque forma abbia:
 * XML in chiaro, busta .p7m (DER o BER), l'uno o l'altra in base64.
 * Ritorna null se dentro non c'è una fattura elettronica.
 */
export function xmlDaFile(dati: Uint8Array, profondita = 0): string | null {
  if (profondita > 3 || dati.length === 0) return null;

  if (dati[saltaBomESpazi(dati)] === 0x3c /* < */) {
    const xml = decodificaXml(dati);
    return sembraFatturaPA(xml) ? xml : null;
  }
  if (dati[0] === 0x30 /* SEQUENCE: una busta ASN.1 */) {
    const dentro = contenutoP7m(dati);
    if (dentro) return xmlDaFile(dentro, profondita + 1);
  }
  const decodificato = daBase64(dati);
  if (decodificato) return xmlDaFile(decodificato, profondita + 1);

  const cercato = xmlCercatoNelFile(dati);
  return cercato && sembraFatturaPA(cercato) ? cercato : null;
}

/**
 * Il file come lo SDI l'ha consegnato. Se un'API lo restituisce scritto in
 * base64, si conservano i suoi byte veri: il .p7m nello storage deve aprirsi
 * con Dike o ArubaSign come l'originale.
 */
export function fileOriginale(dati: Uint8Array): Uint8Array {
  if (dati.length === 0 || dati[saltaBomESpazi(dati)] === 0x3c || dati[0] === 0x30) return dati;
  const decodificato = daBase64(dati);
  if (decodificato && (decodificato[saltaBomESpazi(decodificato)] === 0x3c || decodificato[0] === 0x30)) {
    return decodificato;
  }
  return dati;
}

/** Ha la forma di una fattura elettronica (intestazione e corpo)? */
export function sembraFatturaPA(xml: string): boolean {
  return /<([A-Za-z_][\w.-]*:)?FatturaElettronica[\s>]/.test(xml) &&
    xml.includes("FatturaElettronicaHeader") &&
    xml.includes("FatturaElettronicaBody");
}

// ── Le risposte di openapi ───────────────────────────────────────────────

type Oggetto = Record<string, unknown>;

function oggetto(x: unknown): Oggetto | null {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Oggetto) : null;
}

/** La fattura dentro la risposta: `{ data: {…} }` oppure l'oggetto stesso. */
function laFattura(risposta: unknown): Oggetto | null {
  const o = oggetto(risposta);
  if (!o) return null;
  return oggetto(o.data) ?? oggetto(o.invoice) ?? o;
}

/** Le voci grezze di una pagina dell'elenco, in qualunque involucro arrivino. */
function elencoGrezzo(risposta: unknown): unknown[] {
  if (Array.isArray(risposta)) return risposta;
  const o = oggetto(risposta);
  if (Array.isArray(o?.data)) return o!.data as unknown[];
  const dentro = oggetto(o?.data);
  return Array.isArray(dentro?.items) ? (dentro!.items as unknown[]) : [];
}

/**
 * Quante voci ha la pagina, comprese quelle scartate: è questo a dire se ce
 * n'è un'altra. Contare solo le ricevute fermerebbe il giro a metà.
 */
export function lunghezzaElenco(risposta: unknown): number {
  return elencoGrezzo(risposta).length;
}

export interface VoceElenco {
  id: string;
  /** Data di creazione su openapi, se c'è: serve solo a ordinare. */
  creata: string | null;
}

/**
 * Le fatture di un elenco GET /IT-invoices. Quelle con una direzione diversa
 * da «incoming» si scartano anche se il filtro le avesse lasciate passare:
 * una fattura EMESSA importata tra le ricevute diventerebbe un costo finto.
 */
export function vociElenco(risposta: unknown): VoceElenco[] {
  const voci: VoceElenco[] = [];
  for (const v of elencoGrezzo(risposta)) {
    const f = oggetto(v);
    if (!f) continue;
    const direzione = typeof f.direction === "string" ? f.direction.toLowerCase() : "";
    if (direzione && direzione !== "incoming") continue;
    const id = typeof f.id === "string" ? f.id : typeof f.uuid === "string" ? f.uuid : "";
    if (!id.trim()) continue;
    const creata = typeof f.create_at === "string" ? f.create_at : typeof f.created_at === "string" ? f.created_at : null;
    voci.push({ id: id.trim(), creata });
  }
  return voci;
}

/** La partita IVA a cui openapi ha consegnato la fattura (quella registrata). */
export function fiscalIdFattura(risposta: unknown): string | null {
  const v = laFattura(risposta)?.fiscal_id;
  const cifre = typeof v === "string" ? v.replace(/\D/g, "") : "";
  return cifre.length === 11 ? cifre : null;
}

/**
 * Il file dentro una risposta JSON, quando un'API lo restituisce così:
 * il primo testo lungo sotto i nomi soliti. xmlDaFile poi riconosce da sé se
 * è XML, base64 o una busta firmata.
 */
export function testoFileDaJson(risposta: unknown): string | null {
  const o = oggetto(risposta);
  if (!o) return null;
  const dentro = oggetto(o.data);
  for (const c of [o.data, o.content, o.file, o.xml, o.document, dentro?.content, dentro?.file, dentro?.xml, dentro?.document]) {
    if (typeof c === "string" && c.length > 100) return c;
  }
  return null;
}

/** La fattura è davvero una ricevuta dal fornitore, per quella partita IVA? */
export function fatturaRicevutaPer(risposta: unknown, fiscalId: string): boolean {
  const f = laFattura(risposta);
  if (!f) return false;
  const direzione = typeof f.direction === "string" ? f.direction.toLowerCase() : "";
  if (direzione && direzione !== "incoming") return false;
  const suo = typeof f.fiscal_id === "string" ? f.fiscal_id.replace(/\D/g, "") : "";
  return !suo || suo === fiscalId.replace(/\D/g, "");
}

export interface AllegatoOpenapi {
  nome: string;
  tipo: string;
  url: string;
}

/** I file che lo SDI manda insieme alla fattura: notifiche e metadati. */
const FILE_DI_SERVIZIO = /_(RC|NS|MC|NE|MT|EC|SE|DT|AT)_[A-Za-z0-9]{3}\.xml$/i;

/**
 * Tra gli allegati di una fattura openapi, quello che È la fattura: il nome
 * che lo SDI le ha dato (details.sdi_filename), altrimenti un .xml o .xml.p7m
 * che non sia un file di servizio, altrimenti il primo con un tipo XML o
 * PKCS#7. Mai il PDF: è una copia di cortesia, non ha valore legale.
 */
export function allegatoFattura(risposta: unknown): AllegatoOpenapi | null {
  const f = laFattura(risposta);
  if (!f || !Array.isArray(f.attachments)) return null;
  const nomeSdi = String(oggetto(f.details)?.sdi_filename ?? "").trim();

  const allegati: AllegatoOpenapi[] = [];
  for (const a of f.attachments) {
    const x = oggetto(a);
    if (!x) continue;
    const nome = String(x.fileName ?? x.filename ?? x.file_name ?? x.name ?? "").trim();
    const tipo = String(x.mimeType ?? x.mime_type ?? x.contentType ?? "").trim();
    const url = String(x.downloadUrl ?? x.download_url ?? x.url ?? "").trim();
    if (!url.startsWith("https://")) continue;
    if (/pdf/i.test(tipo) || /\.pdf$/i.test(nome) || FILE_DI_SERVIZIO.test(nome)) continue;
    allegati.push({ nome, tipo, url });
  }
  return (nomeSdi ? allegati.find((a) => a.nome === nomeSdi) : undefined) ??
    allegati.find((a) => /\.xml(\.p7m)?$/i.test(a.nome)) ??
    allegati.find((a) => /xml|pkcs7|p7m/i.test(a.tipo)) ??
    null;
}

/** Il nome con cui lo SDI ha consegnato il file, se openapi lo dice. */
export function nomeFileSdi(risposta: unknown): string | null {
  const nome = String(oggetto(laFattura(risposta)?.details)?.sdi_filename ?? "").trim();
  // Solo un nome di file, mai un percorso: finisce dentro un percorso nostro.
  return /^[A-Za-z0-9._-]{5,120}$/.test(nome) ? nome : null;
}

/**
 * Quando la fattura è arrivata a openapi dallo SDI (create_at della fattura
 * ricevuta), in formato ISO. Null se manca o non è una data.
 */
export function ricevutaIl(risposta: unknown): string | null {
  const f = laFattura(risposta);
  const v = f?.create_at ?? f?.created_at;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** L'identificativo SDI della consegna (details.sdi_id), se c'è. */
export function identificativoSdi(risposta: unknown): string | null {
  const id = oggetto(laFattura(risposta)?.details)?.sdi_id;
  if (typeof id === "number") return String(id);
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * L'id della fattura in una chiamata di openapi (callback). Il corpo può
 * essere la fattura in JSON, la fattura dentro `data`, oppure un modulo con
 * la fattura in JSON nel campo `data`. Dal corpo si prende SOLO l'id: la
 * fattura poi si rilegge da openapi col nostro token, così una chiamata
 * falsa non può far entrare niente.
 */
export function idDaCallback(corpo: unknown): string | null {
  let o: unknown = corpo;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  const radice = oggetto(o);
  if (!radice) return null;
  const dati = typeof radice.data === "string" ? idDaCallback(radice.data) : null;
  if (dati) return dati;
  for (const c of [oggetto(radice.data), oggetto(radice.invoice), oggetto(oggetto(radice.data)?.invoice), radice]) {
    // invoice_id prima di id: in una notifica, id può essere quello della notifica.
    const id = c?.invoice_id ?? c?.id ?? c?.uuid;
    if (typeof id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(id.trim())) return id.trim();
  }
  return null;
}

// ── Il gettone delle callback ────────────────────────────────────────────

/**
 * Il gettone che openapi rimanda nelle callback (intestazione
 * x-callback-token). Si ricalcola dalla chiave di servizio: niente segreti
 * nuovi da tenere allineati tra openapi, Vault e variabili d'ambiente. Se la
 * chiave cambia, le callback vengono respinte finché l'azienda non ripete
 * l'attivazione — e intanto il giro orario continua a importare.
 */
export async function gettoneCallback(chiave: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(chiave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("openapi-fatture-ricevute"));
  return Array.from(new Uint8Array(firma), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Confronto a tempo costante: niente oracolo a chi prova un carattere alla volta. */
export function stessoGettone(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Il giro ──────────────────────────────────────────────────────────────

/**
 * Ogni quanto si ripassa TUTTO l'elenco di un'azienda. Negli altri giri si
 * guarda solo la prima pagina: non sappiamo in che ordine openapi restituisce
 * le fatture, e se fossero dalla più vecchia le nuove starebbero in fondo.
 * Una volta al giorno si va fino in fondo: nel caso peggiore una fattura
 * arriva con un giorno di ritardo, mai persa.
 */
export const ORE_TRA_GIRI_COMPLETI = 20;

export function giroCompletoDovuto(ultimoCompleto: string | null | undefined, adesso = new Date()): boolean {
  if (!ultimoCompleto) return true;
  const t = Date.parse(ultimoCompleto);
  return !Number.isFinite(t) || adesso.getTime() - t >= ORE_TRA_GIRI_COMPLETI * 3_600_000;
}

/** Il percorso del file originale nello storage: mai due fatture sullo stesso. */
export function percorsoOriginale(
  companyId: string,
  nomeSdi: string | null,
  cedentePiva: string,
  numero: string,
  data: string,
  firmata: boolean,
): string {
  if (nomeSdi) return `${companyId}/ricevute/${nomeSdi}`;
  const pulito = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, "_");
  return `${companyId}/ricevute/IT${pulito(cedentePiva)}_${pulito(numero)}_${pulito(data)}.xml${firmata ? ".p7m" : ""}`;
}
