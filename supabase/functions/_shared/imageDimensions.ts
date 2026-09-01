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

  return null;
}
