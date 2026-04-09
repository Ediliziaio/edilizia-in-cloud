/**
 * Compressore foto intelligente.
 * - Ridimensiona a max 1920px lato lungo
 * - Comprime JPEG quality 0.80 (o 0.70 per file > 5MB)
 * - Target: < 500KB per foto
 * - Mantiene orientazione EXIF (il browser la rispetta via drawImage)
 */

const MAX_LONG_SIDE_PX = 1920;
const DEFAULT_QUALITY = 0.8;
const AGGRESSIVE_QUALITY = 0.7;
const AGGRESSIVE_THRESHOLD_BYTES = 5 * 1024 * 1024;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  sizeBytes: number;
  originalSizeBytes: number;
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile caricare l'immagine"));
    };
    img.src = url;
  });
}

/**
 * Comprime un'immagine e la restituisce come Blob JPEG.
 * Se l'input è già piccolo e delle dimensioni giuste, viene ricodificato comunque
 * per applicare eventuale quality uniforme.
 */
export async function compressImage(input: Blob): Promise<CompressedImage> {
  const img = await loadImageFromBlob(input);

  // Calcola dimensioni target
  const longSide = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longSide > MAX_LONG_SIDE_PX ? MAX_LONG_SIDE_PX / longSide : 1;
  const targetW = Math.round(img.naturalWidth * scale);
  const targetH = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non disponibile");
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const quality =
    input.size > AGGRESSIVE_THRESHOLD_BYTES ? AGGRESSIVE_QUALITY : DEFAULT_QUALITY;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compressione fallita"))),
      "image/jpeg",
      quality,
    );
  });

  return {
    blob,
    width: targetW,
    height: targetH,
    sizeBytes: blob.size,
    originalSizeBytes: input.size,
  };
}
