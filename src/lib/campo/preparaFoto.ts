/**
 * Preparazione delle foto di cantiere prima del caricamento (rapportino e giornale).
 *
 * Perché un modulo solo: le due pagine scartavano le foto in modi diversi (una a
 * 10 MB prima di comprimerle, l'altra le caricava originali), e l'operaio non
 * sapeva quali erano arrivate. Qui le regole sono una volta sola:
 *  - si comprime PRIMA di guardare il peso: la foto da 12 MB del telefono, compressa,
 *    pesa poche centinaia di kB e deve passare;
 *  - l'originale ha un tetto alto (40 MB) solo per non bloccare un telefono economico;
 *  - il limite vero è sul risultato (3 MB);
 *  - una foto alla volta, in sequenza: 15 foto decodificate insieme esauriscono la memoria;
 *  - mai scarti in silenzio: l'esito conta cosa è rimasto fuori e perché.
 */
import { compressImage } from "@/lib/campo/compressImage";

export const MAX_FOTO_PER_RAPPORTINO = 15;
export const MAX_ORIGINALE_BYTES = 40 * 1024 * 1024;
export const MAX_COMPRESSA_BYTES = 3 * 1024 * 1024;

export interface FotoPronta {
  blob: Blob;
  /** Nome sicuro per lo storage: mai il nome del file del telefono (spazi, accenti, doppioni). */
  nomeFile: string;
  contentType: string;
}

export interface EsitoPreparazione {
  pronte: FotoPronta[];
  /** Scelte oltre il massimo per rapportino: non preparate. */
  oltreLimite: number;
  /** Troppo pesanti anche dopo la compressione (o originale oltre il tetto). */
  troppoPesanti: number;
  /** File che non sono immagini. */
  nonImmagini: number;
}

/** Estensione coerente col contenuto: la compressione dà JPEG; se non riesce si tiene il formato originale. */
export function nomeFileFoto(contentType: string, id: string = crypto.randomUUID()): string {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${id}.${ext}`;
}

/** Quante foto si possono ancora aggiungere, dato quante ce ne sono già. */
export function postiLiberi(giaPresenti: number, massimo = MAX_FOTO_PER_RAPPORTINO): number {
  return Math.max(0, massimo - Math.max(0, giaPresenti));
}

export interface OpzioniPreparazione {
  giaPresenti?: number;
  massimo?: number;
  /** Chiamata prima di ogni foto: «Preparo le foto 3 di 12…». */
  onProgresso?: (corrente: number, totale: number) => void;
  /** Iniettabile per i test; di base la compressione del campo (1280 px, JPEG). */
  comprimi?: (file: File) => Promise<Blob | null>;
}

export async function preparaFoto(files: File[], opzioni: OpzioniPreparazione = {}): Promise<EsitoPreparazione> {
  const { giaPresenti = 0, massimo = MAX_FOTO_PER_RAPPORTINO, onProgresso, comprimi = compressImage } = opzioni;
  const posti = postiLiberi(giaPresenti, massimo);
  const immagini = files.filter((f) => !f.type || f.type.startsWith("image/"));
  const nonImmagini = files.length - immagini.length;
  const daFare = immagini.slice(0, posti);
  const esito: EsitoPreparazione = { pronte: [], oltreLimite: immagini.length - daFare.length, troppoPesanti: 0, nonImmagini };

  for (let i = 0; i < daFare.length; i++) {
    const file = daFare[i];
    onProgresso?.(i + 1, daFare.length);
    if (file.size > MAX_ORIGINALE_BYTES) { esito.troppoPesanti++; continue; }
    // Se il browser non riesce a comprimere (formato strano, memoria) si prova l'originale: passa solo se è già leggero.
    const blob: Blob = (await comprimi(file).catch((): null => null)) ?? file;
    if (blob.size > MAX_COMPRESSA_BYTES) { esito.troppoPesanti++; continue; }
    const contentType = blob.type || "image/jpeg";
    esito.pronte.push({ blob, contentType, nomeFile: nomeFileFoto(contentType) });
  }
  return esito;
}

/** Gli avvisi da mostrare dopo la preparazione: una riga per motivo, niente se è andato tutto bene. */
export function avvisiPreparazione(esito: Omit<EsitoPreparazione, "pronte">, massimo = MAX_FOTO_PER_RAPPORTINO): string[] {
  const avvisi: string[] = [];
  if (esito.oltreLimite > 0) {
    avvisi.push(`Massimo ${massimo} foto: ${esito.oltreLimite} ${esito.oltreLimite === 1 ? "foto non è stata aggiunta" : "foto non sono state aggiunte"}.`);
  }
  if (esito.troppoPesanti > 0) {
    avvisi.push(`${esito.troppoPesanti} ${esito.troppoPesanti === 1 ? "foto è troppo pesante" : "foto sono troppo pesanti"} anche dopo la compressione: scattala di nuovo dall'app.`);
  }
  if (esito.nonImmagini > 0) {
    avvisi.push(`${esito.nonImmagini} ${esito.nonImmagini === 1 ? "file non è una foto" : "file non sono foto"}.`);
  }
  return avvisi;
}

/** «Caricate 3 foto su 5»: null se sono arrivate tutte. */
export function avvisoCaricamento(caricate: number, totale: number): string | null {
  if (totale === 0 || caricate >= totale) return null;
  if (caricate === 0) return totale === 1 ? "La foto non è stata caricata: riprova." : `Nessuna delle ${totale} foto è stata caricata: riprova.`;
  return `Caricate ${caricate} foto su ${totale}: le altre non sono arrivate, riprova.`;
}
