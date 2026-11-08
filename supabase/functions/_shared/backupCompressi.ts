// I backup compressi (08/11/2026).
//
// I JSON dei backup erano 9,5 GB su 13 dell'archivio: compressi pesano circa un decimo e non si perde un byte.
// Il file tiene lo stesso nome (`.json`), perché su quel nome contano l'indice dei blocchi, la scadenza a 90
// giorni e il rapporto dei backup mancanti; chi è compresso lo dicono il tipo salvato (application/gzip) e i
// primi due byte. Chi legge passa da `apriBackup`, che vale per i file compressi e per quelli vecchi.

export const TIPO_COMPRESSO = "application/gzip";

export function eCompresso(byte: Uint8Array): boolean {
  return byte.length > 2 && byte[0] === 0x1f && byte[1] === 0x8b;
}

async function attraverso(byte: Uint8Array, trasforma: { readable: ReadableStream; writable: WritableStream }): Promise<Uint8Array> {
  const uscita = new Response(byte as BodyInit).body!.pipeThrough(trasforma);
  return new Uint8Array(await new Response(uscita).arrayBuffer());
}

export const comprimi = (byte: Uint8Array): Promise<Uint8Array> => attraverso(byte, new CompressionStream("gzip"));
export const decomprimi = (byte: Uint8Array): Promise<Uint8Array> => attraverso(byte, new DecompressionStream("gzip"));

/** Il contenuto vero di un file di backup: compresso o no, esce il JSON. */
export async function apriBackup(file: Blob): Promise<Blob> {
  const byte = new Uint8Array(await file.arrayBuffer());
  if (!eCompresso(byte)) return file;
  return await new Response(await decomprimi(byte) as BodyInit, { headers: { "Content-Type": "application/json" } }).blob();
}

export function stessiByte(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Quanto lavora un giro: il limite vero della funzione è la CPU, e comprimere è CPU (circa 60 MB al secondo). */
export const BYTE_PER_GIRO = 20 * 1024 * 1024;
export const TETTO_GIRO_MS = 90_000;

export interface FileDaComprimere { percorso: string; peso: number }

export interface ArchivioBackup {
  scarica(percorso: string): Promise<Uint8Array>;
  carica(percorso: string, byte: Uint8Array, tipo: string): Promise<void>;
}

export interface EsitoCompressione { compressi: number; byte_prima: number; byte_dopo: number; errori: string[] }

/**
 * Comprime un lotto. L'originale si sostituisce solo dopo aver riaperto la copia compressa e trovato gli stessi
 * byte; dopo il caricamento il file si riscarica e si ricontrolla, e se non torna si rimette l'originale.
 */
export async function comprimiFile(
  archivio: ArchivioBackup,
  file: FileDaComprimere[],
  adesso: () => number = Date.now,
): Promise<EsitoCompressione> {
  const inizio = adesso();
  const esito: EsitoCompressione = { compressi: 0, byte_prima: 0, byte_dopo: 0, errori: [] };
  for (const { percorso } of file) {
    if (adesso() - inizio > TETTO_GIRO_MS) break;
    try {
      const originale = await archivio.scarica(percorso);
      if (eCompresso(originale)) {
        // Il contenuto è già compresso: si sistema solo il tipo, sennò il file resterebbe in coda per sempre.
        await archivio.carica(percorso, originale, TIPO_COMPRESSO);
        continue;
      }
      const compresso = await comprimi(originale);
      if (!stessiByte(await decomprimi(compresso), originale)) throw new Error("la copia compressa non coincide");
      await archivio.carica(percorso, compresso, TIPO_COMPRESSO);
      const ricaricato = await archivio.scarica(percorso);
      if (!stessiByte(await decomprimi(ricaricato), originale)) {
        await archivio.carica(percorso, originale, "application/json");
        throw new Error("il file salvato non coincide: rimesso l'originale");
      }
      esito.compressi++;
      esito.byte_prima += originale.length;
      esito.byte_dopo += compresso.length;
    } catch (e) {
      esito.errori.push(`${percorso}: ${(e as Error)?.message ?? e}`);
    }
  }
  return esito;
}
