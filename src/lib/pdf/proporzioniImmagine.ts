/**
 * Larghezza diviso altezza di una foto già convertita per il PDF (data URL JPG
 * o PNG, vedi `toDataUrl`), letta dall'intestazione del file senza disegnarla.
 *
 * Serve a scegliere come mostrare una foto caricata dall'azienda: una foto
 * orizzontale può riempire un riquadro ritagliando un po' i lati; una verticale
 * o un banner con una scritta no, e si mostrano interi. Un indirizzo che non è
 * un data URL (le anteprime di prova) o un file illeggibile danno null.
 */
export function proporzioniImmagine(src: string | null | undefined): number | null {
  if (!src || !src.startsWith("data:image/")) return null;
  const virgola = src.indexOf(",");
  if (virgola < 0) return null;
  let byte: Uint8Array;
  try {
    // Le dimensioni stanno all'inizio del file: bastano i primi 96 kB, presi a
    // gruppi interi di quattro caratteri (atob non vuole un gruppo a metà).
    const parte = src.slice(virgola + 1, virgola + 1 + 131072).replace(/[^A-Za-z0-9+/=]/g, "");
    const binario = atob(parte.slice(0, parte.length - (parte.length % 4)));
    byte = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  const dimensioni = dimensioniPng(byte) ?? dimensioniJpg(byte);
  if (!dimensioni || dimensioni.larghezza <= 0 || dimensioni.altezza <= 0) return null;
  return dimensioni.larghezza / dimensioni.altezza;
}

type Dimensioni = { larghezza: number; altezza: number };

/** PNG: la firma, poi il blocco IHDR con larghezza e altezza su 4 byte ciascuna. */
function dimensioniPng(b: Uint8Array): Dimensioni | null {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || firma.some((v, i) => b[i] !== v)) return null;
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  return { larghezza: u32(16), altezza: u32(20) };
}

/** JPG: si scorrono i segmenti fino a un SOF (C0–CF, meno C4, C8 e CC), che porta altezza e larghezza. */
function dimensioniJpg(b: Uint8Array): Dimensioni | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marcatore = b[i + 1];
    if (marcatore === 0xff) { i += 1; continue; }
    if (marcatore === 0xd8 || marcatore === 0x01 || (marcatore >= 0xd0 && marcatore <= 0xd7)) { i += 2; continue; }
    const lunghezza = (b[i + 2] << 8) | b[i + 3];
    if (marcatore >= 0xc0 && marcatore <= 0xcf && marcatore !== 0xc4 && marcatore !== 0xc8 && marcatore !== 0xcc) {
      return { altezza: (b[i + 5] << 8) | b[i + 6], larghezza: (b[i + 7] << 8) | b[i + 8] };
    }
    if (lunghezza < 2) return null;
    i += 2 + lunghezza;
  }
  return null;
}
