import { supabase } from "@/integrations/supabase/client";
import { SyncDeferredError, SyncPermanentError, syncOperationId, syncItemScope, type SyncItem } from "./sync-queue";

/** Non aggira RLS: nessuna RPC security-definer generica e nessun target libero. */
export async function processCampoOffline(item: SyncItem): Promise<void> {
  const payload = item.payload as Record<string, unknown>;
  const row = (item.type === "foto" ? payload.riga : payload) as Record<string, unknown> | undefined;
  const { owner } = syncItemScope(item);
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !data.session) throw new SyncDeferredError("Accedi per sincronizzare");
  if (!owner || owner !== data.session.user.id) throw new SyncDeferredError("Questa operazione appartiene a un altro utente o richiede verifica dell’autore");
  if (item.type === "rapportino_vocale") {
    // Vecchi payload non contengono un giornaliero completo: conservarli, mai fingere l'invio canonico.
    throw new SyncPermanentError("Vecchia bozza vocale: apri il giornaliero del cantiere e conferma i dati. Il contenuto locale è conservato.");
  }
  if (item.type === "generic") throw new SyncPermanentError("Operazione non supportata: contatta l’assistenza. I dati locali sono conservati.");
  if (item.type === "checklist") {
    const { error } = await supabase.from("checklist_sicurezza").upsert(payload as never, { onConflict: "company_id,operaio_id,data,turno" });
    if (error) throw databaseError(error);
    return;
  }
  const id = await syncOperationId(item);
  let table: "foto_cantiere" | "campo_timbrature";
  let insert: Record<string, unknown>;
  if (item.type === "foto") {
    const photo = payload as unknown as { bucket: string; path: string; blob: Blob; contentType: string; riga?: Record<string, unknown> };
    // Audio legacy non associato ad un giornaliero: non cancellarlo come "foto sincronizzata".
    if (!photo.riga || !owner || !photo.path) throw new SyncPermanentError("Allegato senza giornaliero: contenuto locale conservato, contatta l’assistenza.");
    const { error } = await supabase.storage.from(photo.bucket).upload(photo.path, photo.blob, { contentType: photo.contentType, upsert: false });
    const exists = error && ((error as { statusCode?: string }).statusCode === "409" || error.message.toLowerCase().includes("already exists"));
    if (error && !exists) throw new Error(error.message);
    table = "foto_cantiere"; insert = { ...photo.riga, storage_path: photo.path, id };
  } else if (item.type === "timbratura") {
    if (!owner) throw new SyncPermanentError("Timbratura senza autore: non inviata");
    table = "campo_timbrature"; insert = { ...payload, id };
  } else throw new SyncPermanentError("Tipo offline non supportato");
  const { error } = await supabase.from(table).insert(insert as never);
  if (!error) return;
  if (error.code === "23505") {
    // Risposta persa dopo un insert riuscito: verifica quella riga, non qualunque vincolo duplicato.
    const lookup = table === "foto_cantiere"
      ? supabase.from("foto_cantiere").select("id").eq("id", id).eq("company_id", row?.company_id as string).eq("uploaded_by", owner as string)
      : supabase.from("campo_timbrature").select("id").eq("id", id).eq("company_id", row?.company_id as string).eq("user_id", owner as string);
    const { data: existing, error: lookupError } = await lookup.maybeSingle();
    if (!lookupError && existing) return;
    if (lookupError) throw databaseError(lookupError);
  }
  throw databaseError(error);
}

function databaseError(error: { code?: string; message: string }): Error {
  return error.code?.startsWith("22") || error.code?.startsWith("23") || error.code === "42501"
    ? new SyncPermanentError(error.message) : new Error(error.message);
}
