import { percorsoStorageSicuro } from "../../../_shared/storageAmmesso.ts";
import { idWhatsAppValido } from "../../bolleInConversazione.ts";
import type { ToolCtx } from "./types.ts";

const tipi = [
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"],
  ["image/heic", "heic"], ["application/pdf", "pdf"],
  ["audio/ogg", "ogg"], ["audio/mpeg", "mp3"], ["audio/mp4", "m4a"],
  ["audio/aac", "aac"], ["audio/wav", "wav"], ["audio/webm", "webm"],
] as const;

/** Usa solo il media verificato dal processore, anche durante una conferma successiva. */
export async function allegatoOperativo(ctx: ToolCtx, destinazione: "attivita" | "ticket", recordId: string) {
  const media = ctx.mediaCorrente;
  const origine = ctx.sourceMessageId ?? ctx.requestId;
  if (!media) return null;
  if (!idWhatsAppValido(origine) || !idWhatsAppValido(recordId) ||
    !media.storagePath.startsWith(`${ctx.company_id}/`) || !percorsoStorageSicuro(media.storagePath)) {
    throw new Error("allegato_non_disponibile");
  }
  const { data: file, error } = await ctx.supabase.storage.from("whatsapp-media").download(media.storagePath);
  if (error || !file || !file.size || file.size > 20 * 1024 * 1024) throw new Error("allegato_non_disponibile");
  const mime = file.type.split(";")[0].toLowerCase();
  const estensione = media.storagePath.split(".").at(-1)?.toLowerCase();
  const riconosciuto = tipi.find(([tipo, ext]) => tipo === mime || ((!mime || mime === "application/octet-stream") && ext === estensione));
  if (!riconosciuto) throw new Error("allegato_tipo_non_ammesso");

  const [contentType, ext] = riconosciuto;
  const tipoMedia = contentType.startsWith("audio/") ? "Vocale" : contentType.startsWith("image/") ? "Foto" : "Documento";
  const nome = `${tipoMedia} WhatsApp.${ext}`;
  const path = `${destinazione === "attivita" ? `${ctx.company_id}/` : ""}${recordId}/wa-${origine}.${ext}`;
  const bucket = destinazione === "attivita" ? "task-attachments" : "ticket-attachments";
  const { error: upload } = await ctx.supabase.storage.from(bucket).upload(path, file, { contentType, upsert: false });
  if (upload && String(upload.statusCode) !== "409" && !/already exists|duplicate/i.test(upload.message)) {
    throw new Error("allegato_non_caricato");
  }
  return { origine, path, nome, contentType, dimensione: file.size, tipoMedia };
}
