// _shared/imageDimensions.ts
//
// Lettura delle dimensioni di un'immagine dai primi byte (PNG e JPEG), senza
// decodificarla. La stessa funzione esisteva gia' in copia identica dentro
// generate-bathroom-render, generate-facade-render e generate-shutter-render:
// qui e' condivisa per non farne una quarta.
//
// Serve come rete di sicurezza sul formato del render: quando il client non
// manda larghezza e altezza, il selettore della size non ha su cosa decidere e
// ripiega su un quadrato 1024x1024. Da una foto landscape questo costringe il
// modello a ricomporre la scena per riempire il quadrato, e il render perde il
// soffitto, sposta le aperture e cambia l'inquadratura.

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

export function detectImageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 16) return null;

  // PNG: larghezza e altezza stanno nell'header IHDR, offset fissi 16 e 20.
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    if (bytes.length < 24) return null;
    return {
      width: readUint32BE(bytes, 16),
      height: readUint32BE(bytes, 20),
    };
  }

  // JPEG: si scorrono i segmenti fino al marker SOF, che porta le dimensioni.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset];
      offset += 1;

      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 1 >= bytes.length) break;

      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;

      const isSofMarker = (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSofMarker && offset + 6 < bytes.length) {
        return {
          height: (bytes[offset + 3] << 8) | bytes[offset + 4],
          width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        };
      }
      offset += length;
    }
  }

  // WEBP: i provider immagine lo restituiscono, e senza questo ramo la
  // funzione tornava null proprio sui render webp — la guardia sul formato
  // si spegneva in silenzio invece di scartare un quadrato. Il ramo esisteva
  // nella copia locale del render bagno ed era andato perso accorpando le tre
  // copie qui dentro.
  if (
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const chunkType = String.fromCharCode(...bytes.slice(12, 16));

    if (chunkType === "VP8X") {
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    }

    if (chunkType === "VP8 ") {
      const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      if (width > 0 && height > 0) return { width, height };
    }

    if (chunkType === "VP8L" && bytes.length >= 25) {
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      if (width > 0 && height > 0) return { width, height };
    }
  }

  return null;
}

/**
 * Orientamento di un'immagine dalle sue dimensioni.
 */
export function orientationFromDimensions(
  width: number,
  height: number,
): "portrait" | "landscape" | "square" {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

/**
 * Confronta il formato di un render con quello della foto sorgente e descrive
 * lo scarto, o null se il formato e' accettabile.
 *
 * Serve come guardia sui retry: un retry corrective puo' PEGGIORARE il render.
 * Visto in produzione su bagno e infissi: il primo tentativo esce dal provider
 * diretto con `size` esplicito e rispetta il formato, il retry va in timeout,
 * la catena ripiega su OpenRouter — che accetta la direttiva di formato solo
 * come testo e la ignora — e restituisce un 1024x1024. Il quadrato sostituiva
 * l'immagine buona: la foto di un infisso verticale tornava al cliente
 * ricomposta, senza cassonetto o senza davanzale.
 *
 * Soglia dell'8% sul rapporto: sotto quella differenza il ritaglio non e'
 * percepibile e non vale la pena buttare un retry che ha corretto altro.
 */
export function describeFormatMismatch(
  expected: { width: number; height: number } | null,
  actual: { width: number; height: number } | null,
): string | null {
  if (!expected || !actual) return null;

  const expectedOrientation = orientationFromDimensions(
    expected.width,
    expected.height,
  );
  const actualOrientation = orientationFromDimensions(
    actual.width,
    actual.height,
  );
  if (
    expectedOrientation !== actualOrientation &&
    expectedOrientation !== "square"
  ) {
    return `orientamento diverso (atteso ${expectedOrientation}, ottenuto ${actualOrientation})`;
  }

  const expectedRatio = expected.width / expected.height;
  const actualRatio = actual.width / actual.height;
  const diff = Math.abs(expectedRatio - actualRatio) / expectedRatio;
  if (diff > 0.08) {
    return `proporzioni diverse (atteso ${expected.width}x${expected.height}, ottenuto ${actual.width}x${actual.height})`;
  }

  return null;
}

/**
 * Le tre size che i modelli immagine OpenAI sanno produrre, scelte in base
 * all'orientamento della sorgente.
 *
 * Il render NON esce mai con le proporzioni esatte della foto: esce con quelle
 * del contenitore piu' vicino. Una foto 689x916 (0.752) diventa 1024x1536
 * (0.667). Chi confronta il render con la SORGENTE trova sempre uno scarto e
 * conclude che il formato e' sbagliato anche quando e' il migliore ottenibile:
 * e' l'errore che rendeva inutile la guardia sui retry, perche' bocciava anche
 * il primo tentativo corretto e finiva per accettare sempre il secondo.
 * Il confronto giusto e' contro la size RICHIESTA, non contro la foto.
 */
export function expectedOutputSize(
  width?: number,
  height?: number,
): { width: number; height: number } {
  if (!width || !height) return { width: 1024, height: 1024 };
  const ratio = width / height;
  if (ratio < 0.8) return { width: 1024, height: 1536 };
  if (ratio > 1.25) return { width: 1536, height: 1024 };
  return { width: 1024, height: 1024 };
}
