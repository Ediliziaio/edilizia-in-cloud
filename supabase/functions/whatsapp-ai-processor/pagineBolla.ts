import type { ToolCtx } from "./tools/shared/types.ts";
import { tipoFileDdt } from "../_shared/tipoFileDdt.ts";
import { percorsoStorageSicuro } from "../_shared/storageAmmesso.ts";

export const paginaDiBolla = (testo: string) => /^(?:pagina\s+\d+|(?:seconda|terza|altra|ultima) pagina)\b/i.test(testo.trim());

const LIMITE_BOLLA = 18 * 1024 * 1024;
const ESTENSIONI: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heif", "image/bmp": "bmp",
};

export async function aggiungiPaginaBolla(ctx: ToolCtx, riferimento: string | null): Promise<string> {
  if (!riferimento) return "Per aggiungere una pagina, inviala rispondendo alla foto o al PDF della prima pagina.";
  const { storagePath } = ctx.mediaCorrente ?? {};
  if (!storagePath || !storagePath.startsWith(`${ctx.company_id}/`) || !percorsoStorageSicuro(storagePath)) {
    return "Non trovo l’originale della pagina. Invia di nuovo il file rispondendo alla prima pagina.";
  }
  const messaggio = await ctx.supabase.from("whatsapp_messages").select("id")
    .eq("wa_message_id", riferimento).eq("direction", "inbound").eq("company_id", ctx.company_id)
    .eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone).in("message_type", ["image", "document"]).maybeSingle();
  if (messaggio.error) throw new Error("riferimento_pagina_non_verificabile");
  if (!messaggio.data) return "Non trovo la prima pagina in questa conversazione. Rispondi direttamente a quella foto o PDF.";
  let query = ctx.supabase.from("ddt_document_jobs").select("id, files, updated_at, status")
    .eq("company_id", ctx.company_id).eq("source", "whatsapp").eq("source_key", messaggio.data.id);
  query = ctx.user_id ? query.eq("created_by", ctx.user_id) : query.is("created_by", null).eq("employee_id", ctx.employee_id!);
  const lavoro = await query.maybeSingle();
  if (lavoro.error) throw new Error("documento_pagina_non_verificabile");
  const job = lavoro.data;
  if (!job || !Array.isArray(job.files)) return "La prima pagina non è ancora nella coda DDT. Attendi che risulti acquisita e poi rimanda la pagina.";
  const numero = (job.files as Array<{ size?: number }>).length;
  if (job.status === "processing") return "Sto leggendo la bolla. Rimanda questa pagina tra poco rispondendo alla prima.";
  if (!["queued", "review", "da_leggere", "error"].includes(job.status)) {
    return "Questa bolla è già chiusa. Chiedi all’ufficio di verificarla prima di aggiungere altre pagine.";
  }
  const originale = await ctx.supabase.storage.from("whatsapp-media").download(storagePath);
  if (originale.error || !originale.data?.size) throw new Error("originale_pagina_non_disponibile");
  const usati = job.files.reduce((totale: number, f: { size: number }) => totale + Number(f.size), 0);
  const bytes = new Uint8Array(await originale.data.arrayBuffer());
  const mime = tipoFileDdt(bytes);
  if (!mime) return "La pagina deve essere una foto o un PDF valido.";
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const impronta = Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
  if (job.files.some((f: { sha256?: string }) => f.sha256 === impronta)) return "Questa pagina è già presente nella bolla.";
  if (numero >= 12 || usati + bytes.length > LIMITE_BOLLA) return "La bolla può contenere al massimo 12 file per un totale di 18 MB.";

  const percorso = `${ctx.company_id}/${ctx.user_id ?? "null"}/${job.id}/pagina-${impronta}.${ESTENSIONI[mime]}`;
  const caricamento = await ctx.supabase.storage.from("ddt-documenti").upload(percorso, bytes, { contentType: mime, upsert: false });
  if (caricamento.error && !/already exists|duplicate/i.test(caricamento.error.message)) throw new Error("pagina_non_caricata");
  const prossimePagine = [...job.files, {
    path: percorso, name: `Pagina ${numero + 1}.${ESTENSIONI[mime]}`,
    mime, size: bytes.length, bucket: "ddt-documenti", sha256: impronta, whatsapp_message_id: ctx.requestId,
  }];
  const cambiato = await ctx.supabase.from("ddt_document_jobs").update({
    files: prossimePagine, status: job.status === "da_leggere" ? "da_leggere" : "queued",
    result: null, attempts: 0, last_error: null, retry_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", job.id).eq("company_id", ctx.company_id).eq("status", job.status).eq("updated_at", job.updated_at).select("id").maybeSingle();
  if (cambiato.error) throw new Error("pagina_non_confermata");
  return cambiato.data ? `Pagina aggiunta alla stessa bolla. Ora sono ${numero + 1} in «DDT → Documenti in ingresso».`
    : "La bolla è cambiata durante il salvataggio. Verifica nell’app e, se manca, rimanda la pagina.";
}
