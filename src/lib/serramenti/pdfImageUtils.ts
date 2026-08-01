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
 * Best-effort, con una regola dura appresa dal campo:
 *
 *   se l'immagine NON si è caricata qui, NON va passata a react-pdf.
 *
 * react-pdf scarica le immagini remote SENZA timeout interno: un URL che non
 * risponde (CORS, 404, bucket privato) manda `toBlob()` in attesa PER SEMPRE e
 * l'anteprima resta a girare. Prima, in caso di errore, tornavamo l'URL
 * originale "così react-pdf ci prova": era proprio quel tentativo a bloccare
 * la generazione. Meglio un PDF senza logo che un PDF che non arriva mai.
 *
 * Unica eccezione: quando l'immagine SI è caricata ma il canvas non è
 * esportabile (canvas "tainted" da CORS) — lì react-pdf ha una chance concreta
 * di farcela con la sua richiesta, e il timeout a valle ci copre comunque.
 */
const IMAGE_LOAD_TIMEOUT_MS = 12_000;

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
      // Non si è caricata qui in 12s: darla a react-pdf significherebbe
      // bloccare la generazione all'infinito. Meglio saltarla.
      console.warn("[pdf] immagine non caricata entro il timeout, esclusa dal PDF:", url.substring(0, 80));
      finish(null);
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
        // Canvas "tainted": l'immagine ESISTE e si è caricata, non è
        // esportabile per CORS. Qui react-pdf ha una chance reale con la sua
        // richiesta, e il timeout a valle copre il caso peggiore.
        console.warn("[pdf] canvas non esportabile (CORS), passo l'URL a react-pdf:", e);
        finish(url);
      }
    };
    img.onerror = () => {
      // L'immagine non è raggiungibile: react-pdf fallirebbe allo stesso modo,
      // ma restando appeso. Escludiamola.
      console.warn("[pdf] immagine non raggiungibile, esclusa dal PDF:", url.substring(0, 80));
      finish(null);
    };
    img.src = url;
  });
}
