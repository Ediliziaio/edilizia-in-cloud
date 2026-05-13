/**
 * pdfImageUtils.ts — Conversione immagini per @react-pdf/renderer.
 *
 * react-pdf supporta SOLO JPG e PNG. Webp, AVIF, GIF non si renderizzano
 * (silenziosamente: l'Image element esiste ma il contenuto è vuoto).
 *
 * Soluzione: caricare l'URL in un <img> HTML, disegnare su canvas, esportare
 * come PNG/JPEG data URL. Il browser sa decodificare qualsiasi formato; il
 * canvas → PNG/JPEG produce un output che react-pdf renderizza sicuro.
 *
 * Limiti applicati:
 *  - max 1600px lato lungo → mantiene il PDF leggero su foto da 4000px
 *  - JPEG quality 0.85 → buon compromesso peso/qualità su foto
 *  - PNG per loghi (URL con .png o "logo" nel path) → preserva trasparenza
 *
 * Best-effort: in caso di errore (CORS, formato corrotto, network timeout),
 * ritorna l'URL originale come fallback quando react-pdf puo' comunque
 * provarci. Per formati non supportati da react-pdf (webp/avif/gif) torna
 * null: meglio un placeholder coerente di una generazione PDF rotta o appesa.
 */
const IMAGE_LOAD_TIMEOUT_MS = 12_000;
const UNSUPPORTED_REACT_PDF_IMAGE_RE = /\.(webp|avif|gif)(?:[?#].*)?$/i;

function fallbackForFailedConversion(url: string): string | null {
  return UNSUPPORTED_REACT_PDF_IMAGE_RE.test(url) ? null : url;
}

export async function toDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (typeof globalThis.Image !== "function" || typeof document === "undefined") return url;
  return new Promise<string | null>((resolve) => {
    let settled = false;
    const img = new globalThis.Image();
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(value);
    };
    const timer = globalThis.setTimeout(() => {
      console.warn("[pdf] toDataUrl image load timeout:", url.substring(0, 80));
      finish(fallbackForFailedConversion(url));
    }, IMAGE_LOAD_TIMEOUT_MS);

    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const MAX = 1600;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(url);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        // Euristica: PNG per loghi (preserva trasparenza), JPEG per foto.
        const isPng = /\.png(\?|$)/i.test(url) || /logo/i.test(url);
        const dataUrl = isPng
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", 0.85);
        finish(dataUrl);
      } catch (e) {
        console.warn("[pdf] toDataUrl canvas failed:", e);
        finish(fallbackForFailedConversion(url));
      }
    };
    img.onerror = () => {
      console.warn("[pdf] toDataUrl image load failed:", url.substring(0, 80));
      finish(fallbackForFailedConversion(url));
    };
    img.src = url;
  });
}
