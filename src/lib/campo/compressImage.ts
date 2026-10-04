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
      const t = setTimeout(() => reject(new Error("image load timeout")), 10000);
      el.onload = () => { clearTimeout(t); resolve(el); };
      el.onerror = () => { clearTimeout(t); reject(new Error("image load error")); };
      el.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(img.width || maxWidth, maxWidth);
    canvas.height = Math.round((img.height || canvas.width) * (canvas.width / (img.width || canvas.width)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) throw new Error("toBlob returned null");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
