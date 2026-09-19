/**
 * Miniature dei documenti create al caricamento, nel browser di chi carica,
 * e salvate accanto al file (cartella «miniature»). La griglia mostra quelle:
 * niente foto intere scaricate a ogni apertura, niente conversione immagini
 * del server (a pagamento). Per i PDF la miniatura è la prima pagina.
 */
import { supabase } from "@/integrations/supabase/client";

export const LATO_MINIATURA = 320;
const QUALITA = 0.72;

/** "orders/<c>/123-foto.png" → "orders/<c>/miniature/123-foto.jpg" (stesso prefisso: valgono le stesse regole di accesso). */
export function percorsoMiniatura(percorsoFile: string): string {
  const i = percorsoFile.lastIndexOf("/");
  const cartella = i >= 0 ? percorsoFile.slice(0, i) : "";
  const nome = (i >= 0 ? percorsoFile.slice(i + 1) : percorsoFile).replace(/\.[^.]+$/, "");
  return `${cartella ? `${cartella}/` : ""}miniature/${nome}.jpg`;
}

function tipoFile(file: { name: string; type: string }): "immagine" | "pdf" | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type === "application/pdf" || ext === "pdf") return "pdf";
  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp", "avif"].includes(ext)) return "immagine";
  return null;
}

async function canvasInJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((ok) => canvas.toBlob(ok, "image/jpeg", QUALITA));
}

async function daImmagine(file: File): Promise<Blob | null> {
  // HEIC in Chrome non si decodifica: niente miniatura, si vedrà l'icona.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, LATO_MINIATURA / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); return null; }
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasInJpeg(canvas);
}

async function daPdf(file: File): Promise<Blob | null> {
  const lib = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  if (typeof worker === "string" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = worker;
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pagina = await doc.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: LATO_MINIATURA / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvasInJpeg(canvas);
  } finally {
    void doc.loadingTask.destroy();
  }
}

/** Miniatura JPEG del file, o null se il tipo non ne ha / non si riesce. Non lancia mai. */
export async function creaMiniatura(file: File): Promise<Blob | null> {
  try {
    const tipo = tipoFile(file);
    if (tipo === "immagine") return await daImmagine(file);
    if (tipo === "pdf" && file.size <= 50 * 1000 * 1000) return await daPdf(file);
    return null;
  } catch {
    return null;
  }
}

/**
 * Crea e carica la miniatura accanto al file. Restituisce il percorso o null:
 * una miniatura mancante non deve mai fermare il caricamento del documento.
 */
export async function caricaMiniatura(bucket: string, percorsoFile: string, file: File): Promise<string | null> {
  const blob = await creaMiniatura(file);
  if (!blob) return null;
  const percorso = percorsoMiniatura(percorsoFile);
  const { error } = await supabase.storage.from(bucket).upload(percorso, blob, { contentType: "image/jpeg", upsert: true });
  return error ? null : percorso;
}
