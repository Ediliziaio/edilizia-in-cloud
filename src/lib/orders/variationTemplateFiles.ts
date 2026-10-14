import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const VARIATION_FILES_BUCKET = "variation-template-files";
export const VARIATION_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const VARIATION_FILES_MAX = 10;
export type VariationTemplateFile = { id: string; company_id: string; template_id: string; file_name: string; storage_path: string; file_size: number; is_active: boolean; created_at: string };
type FileDatabase = { public: { Tables: { order_variation_template_files: { Row: VariationTemplateFile; Insert: Omit<VariationTemplateFile, "created_at">; Update: { is_active: boolean }; Relationships: [] } }; Views: Record<string, never>; Functions: Record<string, never>; Enums: Record<string, never>; CompositeTypes: Record<string, never> } };
const db = supabase as unknown as SupabaseClient<FileDatabase>;
const columns = "id,company_id,template_id,file_name,storage_path,file_size,is_active,created_at";
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function variationFilePath(company: string, template: string, id: string) {
  if (![company, template, id].every(value => uuid.test(value))) throw new Error("Ambito dell'allegato non valido.");
  return `${company}/${template}/${id}.pdf`;
}
export function checkVariationFile(row: VariationTemplateFile, company: string, template: string) {
  if (row.company_id !== company || row.template_id !== template || row.storage_path !== variationFilePath(company, template, row.id) || !row.is_active || row.file_size < 1 || row.file_size > VARIATION_FILE_MAX_BYTES) throw new Error("Allegato non verificabile per questo modello.");
  return row;
}
export async function validateVariationPdf(file: File) {
  if (!/\.pdf$/i.test(file.name) || file.name.length > 180 || file.size < 5 || file.size > VARIATION_FILE_MAX_BYTES) throw new Error("Scegli un PDF fino a 10 MB, con nome entro 180 caratteri.");
  if (await file.slice(0, 5).text() !== "%PDF-") throw new Error("Il file non contiene un PDF valido.");
}
export async function listVariationFiles(company: string, template: string) {
  variationFilePath(company, template, template);
  const { data, error } = await db.from("order_variation_template_files").select(columns).eq("company_id", company).eq("template_id", template).eq("is_active", true).order("created_at").limit(101);
  if (error) throw new Error("Allegati non disponibili. Riprova.");
  // Concurrent uploads can briefly exceed the UI limit; still list them so an editor can remove extras.
  if ((data ?? []).length > 100) throw new Error("Elenco allegati incompleto: verifica i file prima di continuare.");
  return (data ?? []).map(row => checkVariationFile(row, company, template));
}
export async function uploadVariationFile(company: string, template: string, file: File) {
  await validateVariationPdf(file);
  if ((await listVariationFiles(company, template)).length >= VARIATION_FILES_MAX) throw new Error("Il modello ha già 10 allegati. Rimuovine uno prima di aggiungerne altri.");
  const id = crypto.randomUUID();
  const path = variationFilePath(company, template, id);
  const bucket = supabase.storage.from(VARIATION_FILES_BUCKET);
  const uploaded = await bucket.upload(path, file, { contentType: "application/pdf", upsert: false });
  if (uploaded.error) throw new Error(`Caricamento non riuscito: ${uploaded.error.message.slice(0, 180)}. Il modello non è cambiato.`);
  if (uploaded.data?.path !== path) throw new Error("Caricamento non confermato. Riprova; il modello non è cambiato.");
  const payload = { id, company_id: company, template_id: template, file_name: file.name, storage_path: path, file_size: file.size, is_active: true };
  const saved = await db.from("order_variation_template_files").insert(payload).select(columns).single();
  const matches = (row: VariationTemplateFile | null) => !!row && Object.entries(payload).every(([key, value]) => row[key as keyof VariationTemplateFile] === value);
  if (!saved.error && matches(saved.data)) return saved.data!;
  // A lost response may still have committed. Verify before compensating an upload.
  const verified = await db.from("order_variation_template_files").select(columns).eq("company_id", company).eq("template_id", template).eq("id", id).maybeSingle();
  if (!verified.error && matches(verified.data)) return verified.data!;
  if (!verified.error && !verified.data) {
    const removed = await bucket.remove([path]);
    if (!removed.error) throw new Error("Allegato non salvato: caricamento annullato. Riprova.");
  }
  throw new Error("Esito del caricamento incerto. Ricarica gli allegati prima di riprovare; nessun file esistente è stato cancellato.");
}
export async function archiveVariationFile(row: VariationTemplateFile, company: string, template: string) {
  checkVariationFile(row, company, template);
  const { data, error } = await db.from("order_variation_template_files").update({ is_active: false }).eq("company_id", company).eq("template_id", template).eq("id", row.id).eq("is_active", true).select("id").single();
  if (error || data?.id !== row.id) throw new Error("Rimozione non confermata. Ricarica gli allegati.");
}
export async function downloadVariationFile(row: VariationTemplateFile, company: string, template: string) {
  checkVariationFile(row, company, template);
  const { data, error } = await supabase.storage.from(VARIATION_FILES_BUCKET).download(row.storage_path);
  if (error || !data || data.size !== row.file_size) throw new Error("Download dell'allegato non riuscito o file incompleto.");
  return data;
}
export function variationPackageName(name: string, ordinal: number) {
  return `${String(ordinal).padStart(2, "0")}-${name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/^\.+/, "_").slice(0, 150) || "allegato.pdf"}`;
}
