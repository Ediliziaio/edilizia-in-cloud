/**
 * Import massivo di fatture elettroniche in formato XML.
 *
 * Serve alle aziende che tengono la fatturazione su un provider esterno
 * (Aruba, Fatture in Cloud, ...) ma non pagano il piano che espone le API:
 * scaricano gli XML dal portale e li caricano qui a mano, anche centinaia
 * per volta, singolarmente o dentro uno zip.
 *
 * Qui dentro sta solo la logica pura — riconoscere i file, scompattare gli
 * zip, contare gli esiti — cosi' e' verificabile senza rete ne' database.
 * L'interpretazione dell'XML resta dove gia' funziona: la edge ricevi-sdi.
 *
 * Dal 24/09/2026 si leggono anche i .p7m (XML con firma digitale CAdES),
 * sciolti o dentro uno zip, con lo stesso lettore delle fatture che arrivano
 * da openapi (xmlDaFile): prima venivano scartati con «scarica la versione
 * non firmata», che per le fatture ricevute non esiste — lo SDI consegna il
 * file come l'ha firmato il fornitore. Il file firmato va al server così
 * com'è: è l'originale da conservare, l'XML ne è solo il contenuto.
 * I file di servizio dello SDI (…_MT_001.xml) si saltano in silenzio.
 */

import { extractZipEntries } from "@/lib/sicurezza/bulkDocumenti";
import { eFileDiServizioSdi, fileOriginale, xmlDaFile } from "../../../supabase/functions/_shared/ricevuteOpenapi";

export type TipoFileFattura = "xml" | "zip" | "p7m" | "ignoto";

export interface XmlDaImportare {
  /** Nome del file, usato nel resoconto per far ritrovare l'originale. */
  nome: string;
  /** L'XML della fattura, in chiaro anche quando il file era firmato. */
  contenuto: string;
  /** Il file .p7m così com'era: l'originale da conservare. Solo se firmato. */
  firmato?: Uint8Array;
}

export interface FileScartato {
  nome: string;
  motivo: string;
}

export interface EspansioneResult {
  xml: XmlDaImportare[];
  scartati: FileScartato[];
}

export type StatoEsito = "importata" | "duplicata" | "errore";

export interface EsitoImport {
  nome: string;
  stato: StatoEsito;
  /** Presente solo quando stato === "errore". */
  motivo?: string;
  /** Dove e' finita: serve al resoconto per dire "12 emesse · 40 ricevute". */
  direzione?: "attiva" | "passiva";
}

export interface Riepilogo {
  importate: number;
  duplicate: number;
  errori: number;
  totale: number;
}

/** Riconosce il tipo dal nome. Case-insensitive: i portali usano .XML maiuscolo. */
export function classificaFileFattura(nome: string): TipoFileFattura {
  const n = nome.toLowerCase().trim();
  if (n.endsWith(".p7m")) return "p7m";
  if (n.endsWith(".xml")) return "xml";
  if (n.endsWith(".zip")) return "zip";
  return "ignoto";
}

/** Messaggio per l'utente: dice cosa fare, non solo cosa non ha funzionato. */
export function motivoScarto(tipo: TipoFileFattura, nome: string): string {
  switch (tipo) {
    case "p7m":
      return "File firmato che non contiene una fattura elettronica leggibile: prova con la versione XML dal portale.";
    case "ignoto":
      return `Formato non riconosciuto (${nome.split(".").pop() ?? "senza estensione"}): servono file .xml o .p7m, o uno .zip che li contenga.`;
    default:
      return "File non utilizzabile.";
  }
}

/**
 * Un XML di fattura elettronica ha SEMPRE FatturaElettronica come radice.
 * Il controllo e' volutamente grossolano: serve solo a scartare subito i file
 * palesemente sbagliati (un preventivo, un tracciato bancario) prima di
 * spedirli al server, non a validare il tracciato — quello lo fa il parser.
 */
export function sembraFatturaElettronica(contenuto: string): boolean {
  return /<(?:[A-Za-z0-9_-]+:)?FatturaElettronica[\s>]/.test(contenuto);
}

type Letto = { xml: XmlDaImportare } | { scarto: FileScartato } | { servizio: true };

/**
 * Un file, sciolto o dentro uno zip, e la fattura che contiene. XML in chiaro
 * (UTF-8 o ISO-8859-1, come ammette FatturaPA), busta firmata .p7m, l'uno o
 * l'altra in base64: li apre xmlDaFile, lo stesso lettore delle fatture che
 * arrivano da openapi.
 */
async function leggiFattura(nome: string, blob: Blob, dentroZip: boolean): Promise<Letto> {
  let dati: Uint8Array;
  try {
    dati = new Uint8Array(await blob.arrayBuffer());
  } catch {
    return { scarto: { nome, motivo: dentroZip ? "File illeggibile dentro lo zip." : "File illeggibile." } };
  }
  const contenuto = xmlDaFile(dati);
  if (!contenuto) {
    // Notifiche e metadati dello SDI: accompagnano ogni fattura scaricata
    // dal portale, e segnalarli come errori riempirebbe il resoconto.
    if (eFileDiServizioSdi(nome)) return { servizio: true };
    return {
      scarto: {
        nome,
        motivo: classificaFileFattura(nome) === "p7m"
          ? motivoScarto("p7m", nome)
          : "Non e' una fattura elettronica: manca il tracciato FatturaElettronica.",
      },
    };
  }
  const originale = fileOriginale(dati);
  return { xml: originale[0] === 0x30 ? { nome, contenuto, firmato: originale } : { nome, contenuto } };
}

/**
 * Espande la selezione dell'utente in una lista piatta di fatture pronte da
 * mandare al server. Gli zip vengono scompattati (un livello, quello che
 * producono i portali) e al loro interno si tengono gli .xml e i .p7m.
 *
 * Non solleva mai: ogni file che non si riesce a leggere finisce tra gli
 * scartati con il suo motivo, cosi' un file rotto non blocca gli altri 300.
 */
export async function espandiXmlDaFiles(files: File[]): Promise<EspansioneResult> {
  const xml: XmlDaImportare[] = [];
  const scartati: FileScartato[] = [];
  const raccogli = (r: Letto) => {
    if ("xml" in r) xml.push(r.xml);
    else if ("scarto" in r) scartati.push(r.scarto);
  };

  for (const file of files) {
    const tipo = classificaFileFattura(file.name);

    if (tipo === "xml" || tipo === "p7m") {
      raccogli(await leggiFattura(file.name, file, false));
      continue;
    }

    if (tipo === "zip") {
      let entries: Awaited<ReturnType<typeof extractZipEntries>>;
      try {
        entries = await extractZipEntries(file);
      } catch {
        scartati.push({ nome: file.name, motivo: "Archivio zip illeggibile o danneggiato." });
        continue;
      }

      const fattureNelloZip = entries.filter((e) => {
        const t = classificaFileFattura(e.name);
        return t === "xml" || t === "p7m";
      });
      if (fattureNelloZip.length === 0) {
        scartati.push({ nome: file.name, motivo: "Lo zip non contiene file .xml o .p7m." });
        continue;
      }

      const prima = xml.length + scartati.length;
      for (const entry of fattureNelloZip) raccogli(await leggiFattura(entry.name, entry.blob, true));
      if (xml.length + scartati.length === prima) {
        // Solo file di servizio: lo zip delle notifiche, non quello delle fatture.
        scartati.push({ nome: file.name, motivo: "Lo zip contiene solo notifiche dello SDI, nessuna fattura." });
      }
      continue;
    }

    scartati.push({ nome: file.name, motivo: motivoScarto(tipo, file.name) });
  }

  return { xml, scartati };
}

/**
 * Toglie i doppioni DENTRO la selezione: capita di caricare due volte lo
 * stesso zip, o un file sia sciolto sia nell'archivio. Il confronto e' sul
 * contenuto, non sul nome, perche' lo stesso XML puo' arrivare con nomi
 * diversi. Fra la stessa fattura firmata e in chiaro si tiene la firmata:
 * e' l'originale da conservare. I duplicati verso il database restano
 * compito del server.
 */
export function eliminaDoppioniInterni(xml: XmlDaImportare[]): XmlDaImportare[] {
  const posizione = new Map<string, number>();
  const out: XmlDaImportare[] = [];
  for (const f of xml) {
    const chiave = f.contenuto.replace(/\s+/g, "");
    const gia = posizione.get(chiave);
    if (gia === undefined) {
      posizione.set(chiave, out.length);
      out.push(f);
    } else if (f.firmato && !out[gia].firmato) {
      out[gia] = f;
    }
  }
  return out;
}

export function riepilogoEsiti(esiti: EsitoImport[]): Riepilogo {
  return {
    importate: esiti.filter((e) => e.stato === "importata").length,
    duplicate: esiti.filter((e) => e.stato === "duplicata").length,
    errori: esiti.filter((e) => e.stato === "errore").length,
    totale: esiti.length,
  };
}

/** Riga di riepilogo per il toast: dice sempre la verita', anche quando e' brutta. */
export function descriviRiepilogo(r: Riepilogo): string {
  const parti: string[] = [];
  if (r.importate > 0) parti.push(`${r.importate} importate`);
  if (r.duplicate > 0) parti.push(`${r.duplicate} gia' presenti`);
  if (r.errori > 0) parti.push(`${r.errori} non riuscite`);
  return parti.length > 0 ? parti.join(" · ") : "Nessuna fattura elaborata";
}

// ─── Direzione della fattura ──────────────────────────────────────────────
//
// Lo stesso XML puo' essere una fattura che l'azienda ha EMESSO o una che ha
// RICEVUTO: dipende da quale delle due parti e' l'azienda stessa. Chi scarica
// tutto dal portale si ritrova i due tipi mescolati nella stessa cartella, e
// mandarli nel posto sbagliato falserebbe ricavi e registro IVA.
//
// Il verdetto si legge dalle partite IVA: se l'azienda e' il cedente ha
// emesso, se e' il cessionario ha ricevuto. Quando non corrisponde nessuna
// delle due il file NON viene indovinato — resta "incerta" e l'utente lo vede
// nel resoconto. Meglio una riga da sistemare a mano che un ricavo inventato.

export type DirezioneFattura = "attiva" | "passiva" | "incerta";

export interface PartiteIvaFattura {
  cedente: string | null;
  cessionario: string | null;
}

/** Normalizza per il confronto: via spazi, prefisso paese e maiuscole. */
export function normalizzaPartitaIva(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/\s+/g, "").toUpperCase().replace(/^IT/, "");
}

/**
 * Naviga per localName, cosi' il prefisso di namespace del portale (p:, ns2:,
 * nessuno) non cambia il risultato.
 */
function figlioPerNome(nodo: Element | Document, nome: string): Element | null {
  const figli: HTMLCollection | Element[] = "children" in nodo ? nodo.children : [];
  for (const f of Array.from(figli)) {
    if (f.localName === nome) return f;
  }
  return null;
}

function discendentePerPercorso(radice: Element | Document, percorso: string[]): Element | null {
  let corrente: Element | Document | null = radice;
  for (const passo of percorso) {
    if (!corrente) return null;
    corrente = figlioPerNome(corrente, passo);
  }
  return (corrente as Element) ?? null;
}

/** Estrae le due partite IVA dall'intestazione. Ritorna null dove manca. */
export function leggiPartiteIva(xml: string): PartiteIvaFattura {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "text/xml");
  } catch {
    return { cedente: null, cessionario: null };
  }
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return { cedente: null, cessionario: null };
  }

  const radice = doc.documentElement;
  if (!radice) return { cedente: null, cessionario: null };

  const header = figlioPerNome(radice, "FatturaElettronicaHeader");
  if (!header) return { cedente: null, cessionario: null };

  const leggi = (parte: string): string | null => {
    const el = discendentePerPercorso(header, [parte, "DatiAnagrafici", "IdFiscaleIVA", "IdCodice"]);
    const v = el?.textContent?.trim();
    return v ? v : null;
  };

  return { cedente: leggi("CedentePrestatore"), cessionario: leggi("CessionarioCommittente") };
}

/**
 * Decide dove va la fattura confrontando le partite IVA con quella
 * dell'azienda. Se la partita IVA dell'azienda non e' configurata non si
 * indovina: tutto "incerta".
 */
export function classificaDirezione(xml: string, partitaIvaAzienda: string | null | undefined): DirezioneFattura {
  const mia = normalizzaPartitaIva(partitaIvaAzienda);
  if (!mia) return "incerta";

  const { cedente, cessionario } = leggiPartiteIva(xml);
  const emittente = normalizzaPartitaIva(cedente);
  const destinatario = normalizzaPartitaIva(cessionario);

  // Autofattura (stessa partita IVA su entrambi i lati): non e' un ricavo
  // nuovo, va trattata a mano.
  if (emittente && destinatario && emittente === destinatario) return "incerta";
  if (emittente && emittente === mia) return "attiva";
  if (destinatario && destinatario === mia) return "passiva";
  return "incerta";
}
