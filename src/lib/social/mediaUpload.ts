// ============================================================================
// Caricamento dei file del Social Manager (bucket privato social-media)
// ============================================================================
// Meta scarica immagini e video da un indirizzo https: un data: URL dentro il
// post non si pubblica. Qui i file finiscono nello Storage sotto
// <company_id>/<aaaa-mm>/<uuid>.<ext>; il post salva bucket+path e il publisher
// genera un URL firmato al momento del giro (anche per i post programmati tra
// settimane). L'url firmato che torna al client serve solo per l'anteprima.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import type { SocialPostMedia } from "./types";

export const SOCIAL_MEDIA_BUCKET = "social-media";
export const SOCIAL_PREVIEW_URL_TTL_S = 60 * 60 * 24 * 30;
export const SOCIAL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const SOCIAL_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const SOCIAL_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const SOCIAL_VIDEO_TYPES = ["video/mp4", "video/quicktime"];

export type SocialUploadAccept = "image" | "video" | "any";

export function socialMediaKindFromMime(mime: string | null | undefined): "image" | "video" | null {
  if (!mime) return null;
  if (SOCIAL_IMAGE_TYPES.includes(mime)) return "image";
  if (SOCIAL_VIDEO_TYPES.includes(mime)) return "video";
  return null;
}

/** null se il file va bene, altrimenti il motivo. */
export function validateSocialUploadFile(
  file: { type: string; size: number },
  accept: SocialUploadAccept,
): string | null {
  const kind = socialMediaKindFromMime(file.type);
  if (!kind) return "Formato non supportato: usa JPG, PNG, WebP, MP4 o MOV.";
  if (accept === "image" && kind !== "image") return "Qui serve un'immagine (JPG, PNG o WebP).";
  if (accept === "video" && kind !== "video") return "Qui serve un video (MP4 o MOV).";
  const max = kind === "image" ? SOCIAL_IMAGE_MAX_BYTES : SOCIAL_VIDEO_MAX_BYTES;
  if (file.size > max) return `File troppo grande: massimo ${Math.round(max / 1024 / 1024)} MB.`;
  return null;
}

/**
 * PNG e WebP diventano JPEG prima del caricamento: Instagram pubblica le
 * immagini in JPEG, e un file già convertito evita il rifiuto al momento del giro.
 */
async function convertToJpeg(file: Blob): Promise<Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // la trasparenza diventa bianco, non nero
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return jpeg ?? file;
  } catch {
    return file;
  }
}

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "video/quicktime": return "mov";
    default: return "mp4";
  }
}

export async function uploadSocialMediaFile(companyId: string, file: Blob): Promise<SocialPostMedia> {
  const kind = socialMediaKindFromMime(file.type);
  if (!kind) throw new Error("Formato non supportato: usa JPG, PNG, WebP, MP4 o MOV.");

  const body = kind === "image" && file.type !== "image/jpeg" ? await convertToJpeg(file) : file;
  const contentType = body.type || file.type;
  const path = `${companyId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${extensionFor(contentType)}`;

  const { error } = await supabase.storage
    .from(SOCIAL_MEDIA_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(error.message);

  const { data: signed, error: signError } = await supabase.storage
    .from(SOCIAL_MEDIA_BUCKET)
    .createSignedUrl(path, SOCIAL_PREVIEW_URL_TTL_S);
  if (signError || !signed?.signedUrl) {
    throw new Error(signError?.message ?? "Indirizzo del file non disponibile");
  }

  return { bucket: SOCIAL_MEDIA_BUCKET, path, url: signed.signedUrl, type: kind };
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
}

/** Carica nello Storage ogni file ancora incorporato come data: URL. */
export async function ensureRemoteSocialMedia(
  companyId: string,
  media: SocialPostMedia[],
): Promise<SocialPostMedia[]> {
  const out: SocialPostMedia[] = [];
  for (const item of media) {
    if (!item.path && item.url && /^data:/i.test(item.url)) {
      const blob = dataUrlToBlob(item.url);
      if (!blob) throw new Error("Un'immagine del post non è leggibile: ricaricala.");
      out.push(await uploadSocialMediaFile(companyId, blob));
    } else {
      out.push(item);
    }
  }
  return out;
}
