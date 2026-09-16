/**
 * Foto più leggere prima del caricamento: una foto del telefono pesa 3-6 MB,
 * ridimensionata a 2560 px sul lato lungo resta leggibilissima (anche per
 * targhe, contatori, etichette) e pesa 400-900 KB. I documenti non si toccano.
 */

export const LATO_MASSIMO = 2560;
export const SOGLIA_BYTE = 1.5 * 1024 * 1024;
const QUALITA = 0.85;

/**
 * Foto che vale la pena ridurre. HEIC (iPhone): Safari lo decodifica e diventa
 * un JPEG visibile ovunque; Chrome no, e allora resta com'è. PNG: solo se non
 * ha trasparenza (si controlla dopo averlo disegnato).
 */
export function fotoDaRidurre(file: { name: string; type: string; size: number }): boolean {
  const tipo = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const heic = tipo === "image/heic" || tipo === "image/heif" || ["heic", "heif"].includes(ext);
  if (heic) return true; // anche leggero: convertirlo lo rende visibile in ogni browser
  if (file.size < SOGLIA_BYTE) return false;
  return ["image/jpeg", "image/webp", "image/png"].includes(tipo) || ["jpg", "jpeg", "webp", "png"].includes(ext);
}

function haTrasparenza(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const passo = Math.max(1, Math.floor(Math.min(w, h) / 60));
  const dati = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += passo) {
    for (let x = 0; x < w; x += passo) {
      if (dati[(y * w + x) * 4 + 3] < 250) return true;
    }
  }
  return false;
}

/** Dimensioni finali mantenendo le proporzioni. */
export function dimensioniRidotte(larghezza: number, altezza: number, max = LATO_MASSIMO): { w: number; h: number } {
  const lato = Math.max(larghezza, altezza);
  if (lato <= max) return { w: larghezza, h: altezza };
  const k = max / lato;
  return { w: Math.round(larghezza * k), h: Math.round(altezza * k) };
}

export interface EsitoRiduzione {
  file: File;
  ridotta: boolean;
  byteOriginali: number;
}

/**
 * Restituisce la foto ridotta, o l'originale se non serve / non si riesce /
 * il risultato non è più leggero. Non lancia mai: il caricamento deve partire.
 */
export async function riduciFoto(file: File): Promise<EsitoRiduzione> {
  const originale: EsitoRiduzione = { file, ridotta: false, byteOriginali: file.size };
  if (!fotoDaRidurre(file) || typeof createImageBitmap !== "function") return originale;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { w, h } = dimensioniRidotte(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return originale; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const png = /png$/i.test(file.type) || /\.png$/i.test(file.name);
    if (png && haTrasparenza(ctx, w, h)) return originale;
    const heic = /hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALITA));
    // HEIC diventa JPEG anche se non pesa meno: così si vede in tutti i browser.
    if (!blob || (!heic && blob.size >= file.size * 0.9)) return originale;
    const nome = file.name.replace(/\.(jpe?g|webp|png|heic|heif)$/i, "") + ".jpg";
    return {
      file: new File([blob], nome, { type: "image/jpeg", lastModified: file.lastModified }),
      ridotta: true,
      byteOriginali: file.size,
    };
  } catch {
    return originale;
  }
}

/** Riduce foto e PDF scansionati; qualunque altro file resta com'è. */
export async function riduciFile(file: File): Promise<EsitoRiduzione> {
  if (fotoDaRidurre(file)) return riduciFoto(file);
  const { pdfDaValutare, riduciPdfScansionato } = await import("./riduciPdf");
  if (pdfDaValutare(file)) return riduciPdfScansionato(file);
  return { file, ridotta: false, byteOriginali: file.size };
}
