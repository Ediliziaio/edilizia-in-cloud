/**
 * L'impronta di un file per ricordare la sua lettura AI (14/11/2026). La chiave dipende solo dal
 * contenuto e dal tipo di lettura: lo stesso PDF caricato due volte, con un altro nome o in un'altra
 * cartella, ha la stessa chiave e la seconda volta si legge dalla cache (ai_response_cache).
 */
import { sha256Hex } from "./improntaDocumento.ts";

export function improntaFile(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  return sha256Hex(bytes);
}

export function chiaveLetturaFile(lettura: string, impronta: string): string {
  return `${lettura}:sha256:${impronta}`;
}
