/** Formati in ingresso; al motore arrivano soltanto PDF, JPEG, PNG o WebP. */
export const ACCETTA_DOCUMENTO_PIANTA = "application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif";
export const MIME_DOCUMENTO_PIANTA = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"];
export const MASSIMO_DOCUMENTO_BYTES = 10 * 1024 * 1024;
type FileDaLeggere = { type: string; size: number; name?: string };

export function mimeDocumento(file: Pick<FileDaLeggere, "type" | "name">): string {
  const tipo = file.type.toLowerCase();
  if (tipo && tipo !== "application/octet-stream") return tipo;
  const ext = file.name?.split(".").pop()?.toLowerCase();
  return ({ heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" } as Record<string, string>)[ext ?? ""] ?? tipo;
}
export const eHeic = (file: Pick<FileDaLeggere, "type" | "name">) => ["image/heic", "image/heif"].includes(mimeDocumento(file));

export function erroreDocumento(file: FileDaLeggere): string | null {
  if (!MIME_DOCUMENTO_PIANTA.includes(mimeDocumento(file))) return "Carica un PDF o una foto (JPG, PNG, WebP, HEIC o HEIF).";
  if (file.size > MASSIMO_DOCUMENTO_BYTES) return "Il file è troppo grande (massimo 10 MB): prova con una foto più leggera.";
  if (!file.size) return "Il file è vuoto: scegli un altro documento.";
  return null;
}

/** Decoder caricato solo per le foto Apple. La conversione usa un worker locale. */
export async function normalizzaDocumento(file: File): Promise<File> {
  const errore = erroreDocumento(file);
  if (errore) throw new Error(errore);
  const mime = mimeDocumento(file);
  if (!eHeic(file)) return mime === file.type ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
  try {
    const { heicTo } = await import("heic-to/csp");
    const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.96 });
    if (!blob.size || blob.type !== "image/jpeg") throw new Error("Decodifica incompleta");
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    throw new Error("Non riesco a leggere questa foto HEIC. Riprova con il file originale oppure esportala in JPG dall’app Foto.");
  }
}

/** Ritaglio sull'immagine originale, in percentuale: indipendente dalla misura dell'anteprima. */
export interface RitaglioPianta { x: number; y: number; width: number; height: number }
export function ritaglioPixel(w: number, h: number, r?: RitaglioPianta | null) {
  if (!r || ![r.x, r.y, r.width, r.height].every(Number.isFinite)) return { x: 0, y: 0, width: w, height: h };
  const x = Math.round(Math.max(0, Math.min(99, r.x)) * w / 100);
  const y = Math.round(Math.max(0, Math.min(99, r.y)) * h / 100);
  return { x, y, width: Math.max(1, Math.min(w - x, Math.round(r.width * w / 100))), height: Math.max(1, Math.min(h - y, Math.round(r.height * h / 100))) };
}

export function notaLetturaPianta(ambito: "completa" | "ambiente", nome: string, nota: string, schizzo: boolean): string {
  const contesto = ambito === "ambiente" ? `Un solo ambiente${nome.trim() ? `: ${nome.trim().slice(0, 60)}` : ""}. Ignora altri fogli sullo sfondo; non aggiungere altre stanze.` : "";
  const regole = schizzo ? "Non inventare porte o finestre. Segui quote scritte e rientri. H piastrelle e quote scarichi non sono altezze dei locali né aperture. Sanitari solo se indicati con posizione chiara; segnala le quote ambigue." : "";
  return [contesto, nota.trim().slice(0, schizzo ? 120 : 300), regole].filter(Boolean).join(" ").slice(0, 500);
}
