/**
 * Foto più leggere prima del caricamento: una foto del telefono pesa 3-6 MB,
 * ridimensionata a 2560 px sul lato lungo resta leggibilissima (anche per
 * targhe, contatori, etichette) e pesa 400-900 KB. I documenti non si toccano.
 */

export const LATO_MASSIMO = 2560;
export const SOGLIA_BYTE = 1.5 * 1024 * 1024;
const QUALITA = 0.85;

/** Solo foto che il browser sa decodificare e che vale la pena ridurre. */
export function fotoDaRidurre(file: { name: string; type: string; size: number }): boolean {
  if (file.size < SOGLIA_BYTE) return false;
  const tipo = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  // HEIC: Chrome non lo decodifica. PNG: spesso schermate con trasparenza o testo fine.
  return tipo === "image/jpeg" || tipo === "image/webp" || ["jpg", "jpeg", "webp"].includes(ext);
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
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALITA));
    if (!blob || blob.size >= file.size * 0.9) return originale;
    const nome = file.name.replace(/\.(jpe?g|webp)$/i, "") + ".jpg";
    return {
      file: new File([blob], nome, { type: "image/jpeg", lastModified: file.lastModified }),
      ridotta: true,
      byteOriginali: file.size,
    };
  } catch {
    return originale;
  }
}
