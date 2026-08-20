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
 * I file .p7m (XML con firma digitale CAdES) sono deliberatamente ESCLUSI:
 * sono contenitori binari e leggerli come testo produce spazzatura. Dai
 * portali si scarica sempre anche la versione non firmata, quindi invece di
 * fallire in modo oscuro diciamo all'utente cosa scaricare.
 */

import { extractZipEntries } from "@/lib/sicurezza/bulkDocumenti";

export type TipoFileFattura = "xml" | "zip" | "p7m" | "ignoto";

export interface XmlDaImportare {
  /** Nome del file, usato nel resoconto per far ritrovare l'originale. */
  nome: string;
  contenuto: string;
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
      return "File firmato digitalmente: scarica dal portale la versione XML non firmata.";
    case "ignoto":
      return `Formato non riconosciuto (${nome.split(".").pop() ?? "senza estensione"}): servono file .xml o uno .zip che li contenga.`;
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

/**
 * Espande la selezione dell'utente in una lista piatta di XML pronti da
 * mandare al server. Gli zip vengono scompattati (un livello, quello che
 * producono i portali) e al loro interno si tengono solo gli .xml.
 *
 * Non solleva mai: ogni file che non si riesce a leggere finisce tra gli
 * scartati con il suo motivo, cosi' un file rotto non blocca gli altri 300.
 */
export async function espandiXmlDaFiles(files: File[]): Promise<EspansioneResult> {
  const xml: XmlDaImportare[] = [];
  const scartati: FileScartato[] = [];

  for (const file of files) {
    const tipo = classificaFileFattura(file.name);

    if (tipo === "xml") {
      try {
        const contenuto = await file.text();
        if (!sembraFatturaElettronica(contenuto)) {
          scartati.push({ nome: file.name, motivo: "Non e' una fattura elettronica: manca il tracciato FatturaElettronica." });
        } else {
          xml.push({ nome: file.name, contenuto });
        }
      } catch {
        scartati.push({ nome: file.name, motivo: "File illeggibile." });
      }
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

      const xmlNelloZip = entries.filter((e) => classificaFileFattura(e.name) === "xml");
      if (xmlNelloZip.length === 0) {
        const soloFirmati = entries.some((e) => classificaFileFattura(e.name) === "p7m");
        scartati.push({
          nome: file.name,
          motivo: soloFirmati
            ? "Lo zip contiene solo file firmati .p7m: riesporta gli XML non firmati."
            : "Lo zip non contiene file .xml.",
        });
        continue;
      }

      for (const entry of xmlNelloZip) {
        try {
          const contenuto = await entry.blob.text();
          if (!sembraFatturaElettronica(contenuto)) {
            scartati.push({ nome: entry.name, motivo: "Non e' una fattura elettronica: manca il tracciato FatturaElettronica." });
          } else {
            xml.push({ nome: entry.name, contenuto });
          }
        } catch {
          scartati.push({ nome: entry.name, motivo: "File illeggibile dentro lo zip." });
        }
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
 * diversi. I duplicati verso il database restano compito del server.
 */
export function eliminaDoppioniInterni(xml: XmlDaImportare[]): XmlDaImportare[] {
  const visti = new Set<string>();
  const out: XmlDaImportare[] = [];
  for (const f of xml) {
    const chiave = f.contenuto.replace(/\s+/g, "");
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    out.push(f);
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
