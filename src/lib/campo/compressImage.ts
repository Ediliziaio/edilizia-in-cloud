/**
 * Compressione immagine lato client con gestione completa degli errori:
 * - img.onerror rifiuta la Promise (prima restava pending → loader infinito)
 * - toBlob può ritornare null → Promise rifiutata, il caller usa fallback
 * - URL.revokeObjectURL per evitare memory leak dei blob URL temporanei
 * - timeout 10s per evitare loader "Uploading…" bloccato se il browser non risponde
 */
export async function compressImage(file: File, maxWidth = 1280, quality = 0.75): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      const cleanup = () => { clearTimeout(t); el.onload = null; el.onerror = null; };
      const t = setTimeout(() => { cleanup(); reject(new Error("image load timeout")); }, 10000);
      el.onload = () => { cleanup(); resolve(el); };
      el.onerror = () => { cleanup(); reject(new Error("image load error")); };
      try { el.src = objectUrl; }
      catch (error) { cleanup(); reject(error); }
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(img.width || maxWidth, maxWidth);
    canvas.height = Math.round((img.height || canvas.width) * (canvas.width / (img.width || canvas.width)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve, reject) => {
      // Anche toBlob è asincrono: il solo timeout di caricamento non protegge
      // da un canvas che non chiama mai il callback (memoria/rete del dispositivo).
      const t = setTimeout(() => reject(new Error("image conversion timeout")), 10000);
      try {
        canvas.toBlob((result) => { clearTimeout(t); resolve(result); }, "image/jpeg", quality);
      } catch (error) {
        clearTimeout(t);
        reject(error);
      }
    });
    if (!blob) throw new Error("toBlob returned null");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
