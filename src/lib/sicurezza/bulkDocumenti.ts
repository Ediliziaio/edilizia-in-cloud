/**
 * Sicurezza — bulk document ingestion helpers (P1).
 *
 * Funzioni PURE (nessun React, nessun I/O di rete) per l'importazione massiva
 * di documenti del fascicolo subappaltatore (tab "Subappaltatori" di
 * SicurezzaCantiere). Riutilizzano la tassonomia reale `TipoDocumentoSub`, il
 * bucket storage `subappaltatori-documenti` e la tabella `documenti_subappaltatore`
 * già esistenti: nessuna migration né edge function richiesta.
 *
 * Flusso d'uso (BulkDocumentiUploadDialog):
 *   1. L'utente carica un .zip (o più file). extractZipEntries() lo scompatta
 *      lato client con jszip (import dinamico, fuori dal bundle principale).
 *   2. Ogni file viene pre-classificato (classifyTipoDocumento) e gli si prova
 *      a dedurre la scadenza dal nome (guessScadenzaFromName).
 *   3. L'utente rivede/corregge tipo e scadenza, poi conferma il caricamento.
 *
 * La classificazione è EURISTICA (basata sul nome file) e sempre rivedibile
 * dall'utente prima dell'inserimento: nessuna scrittura cieca.
 */

import type { TipoDocumentoSub } from "@/types/subappaltatori";

/** Bucket storage condiviso col caricamento singolo (SubappaltatoreDetail). */
export const SUBAPPALTATORI_DOCUMENTI_BUCKET = "subappaltatori-documenti";

/** Etichette IT della tassonomia documenti subappaltatore (D.Lgs 81/08). */
export const TIPO_DOC_LABELS: Record<TipoDocumentoSub, string> = {
  durc: "DURC",
  visura_camerale: "Visura Camerale",
  attestazione_soa: "Attestazione SOA",
  dvr: "DVR",
  polizza_rc: "Polizza RC",
  iso_certificazione: "Certificazione ISO",
  altro: "Altro",
};

/**
 * Regole di classificazione ordinate per specificità (la prima che combacia
 * vince). Tutto lower-case; default "altro" se nessuna combacia.
 */
const CLASSIFIERS: Array<{ tipo: TipoDocumentoSub; re: RegExp }> = [
  { tipo: "durc", re: /durc/i },
  { tipo: "attestazione_soa", re: /\bsoa\b|attestaz/i },
  { tipo: "visura_camerale", re: /visura|cciaa|camerale|registro[\s_-]*imprese/i },
  { tipo: "dvr", re: /\bdvr\b|valutazione[\s_-]*(?:dei[\s_-]*)?rischi/i },
  { tipo: "polizza_rc", re: /polizz|assicuraz|fideiuss|\brc[to]?\b|\brct\b|\brco\b/i },
  { tipo: "iso_certificazione", re: /\biso\b|9001|14001|45001|18001|certificaz/i },
];

/** Deduce il tipo documento dal nome file. Default: "altro". */
export function classifyTipoDocumento(filename: string): TipoDocumentoSub {
  const name = String(filename ?? "").toLowerCase();
  for (const c of CLASSIFIERS) {
    if (c.re.test(name)) return c.tipo;
  }
  return "altro";
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 2000 || year > 2099) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Prova a estrarre una data di scadenza dal nome file. Riconosce sia il formato
 * ISO (yyyy-mm-dd) sia quello italiano (dd-mm-yyyy), con separatori . _ - /.
 * Ritorna ISO `yyyy-mm-dd` o null. Solo suggerimento: l'utente può correggere.
 */
export function guessScadenzaFromName(filename: string): string | null {
  const s = String(filename ?? "");
  // yyyy[sep]mm[sep]dd
  let m = s.match(/(20\d{2})[._\-/](\d{1,2})[._\-/](\d{1,2})/);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  // dd[sep]mm[sep]yyyy
  m = s.match(/(\d{1,2})[._\-/](\d{1,2})[._\-/](20\d{2})/);
  if (m) return toIsoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  tif: "image/tiff",
  tiff: "image/tiff",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  p7m: "application/pkcs7-mime",
  zip: "application/zip",
};

/** Content-type dall'estensione del nome file, con fallback. */
export function guessContentType(
  filename: string,
  fallback = "application/octet-stream",
): string {
  const ext = String(filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] || fallback || "application/octet-stream";
}

/** Sanitizza il nome file per lo storage path (mirror del caricamento singolo). */
export function sanitizeFileName(name: string): string {
  return String(name ?? "file").replace(/[^\w.-]+/g, "_");
}

export interface ZipEntry {
  name: string;
  blob: Blob;
}

/**
 * Scompatta un .zip lato client e ritorna i file utili (no directory, no
 * artefatti macOS, no dotfile, no entry vuote). I nomi sono ridotti al
 * basename. jszip è importato dinamicamente per non appesantire il bundle.
 */
export async function extractZipEntries(file: File): Promise<ZipEntry[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const out: ZipEntry[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (entry.name.includes("__MACOSX")) continue;
    const base = entry.name.split("/").pop() ?? entry.name;
    if (!base || base.startsWith(".")) continue;
    const blob = await entry.async("blob");
    if (blob.size === 0) continue;
    out.push({ name: base, blob });
  }
  return out;
}
