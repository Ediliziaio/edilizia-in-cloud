import type { supabase } from "@/integrations/supabase/client";
import { estensione, problemaFile } from "@/lib/commesse/documentiCommessa";

/** Archivia l'originale intero, senza lettura AI o modifiche al contratto economico.
 * L'impronta conserva percorso e allegato nei tentativi successivi. */
export async function archiviaContrattoAppalto(db: typeof supabase, p: { orderId: string; userId: string; file: File }) {
  const problema = problemaFile(p.file);
  if (problema) throw new Error(problema);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await p.file.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join("");
  const nome = estensione(p.file.name);
  const percorso = `orders/${p.orderId}/contratti/${hash}.${nome}`;
  const { data: presente, error: lettura } = await db.from("order_attachments").select("id").eq("order_id", p.orderId).eq("file_url", percorso).limit(1).maybeSingle();
  if (lettura) throw lettura;
  let allegatoId = presente?.id;
  if (!allegatoId) {
    const tipo = p.file.type || "application/octet-stream";
    const { error: upload } = await db.storage.from("order-attachments").upload(percorso, p.file, { contentType: tipo, upsert: false });
    if (upload && !/already exists|duplicate|resource.*exists/i.test(upload.message)) throw upload;
    const { data, error } = await db.from("order_attachments").insert({ order_id: p.orderId, file_name: p.file.name, file_url: percorso, file_type: tipo, file_size: p.file.size, uploaded_by: p.userId, visible_to_customer: false, access_scope: "vendita" } as never).select("id").single();
    if (error || !data) throw new Error("Il file è stato caricato, ma non registrato nell'archivio. Riprova con lo stesso file per completare il caricamento.", { cause: error });
    allegatoId = data.id;
  }
  const segni = db.from("commesse_generali_documenti" as never);
  const { data: segno, error: eSegno } = await segni.select("id").eq("order_id", p.orderId).eq("voce", "contratto_firmato").eq("attachment_id", allegatoId).maybeSingle();
  if (eSegno) throw eSegno;
  if (!segno) {
    const { error } = await db.from("commesse_generali_documenti" as never).insert({ order_id: p.orderId, voce: "contratto_firmato", attachment_id: allegatoId, tipo: "documento", scadenza: null } as never);
    if (error && error.code !== "23505") throw new Error("Il file è nell'archivio, ma non è stato segnato come contratto. Riprova con lo stesso file per completare il collegamento.", { cause: error });
  }
  return allegatoId;
}
