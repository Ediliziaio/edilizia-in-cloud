import { supabase } from "@/integrations/supabase/client";
import { salvaChecklistSicurezza, type ChecklistDaSalvare } from "./salvaChecklistSicurezza";
// Caricati con la coda, così il primo tentativo al ritorno della rete ha già i gestori.
import { inviaPrelievoInCoda, type PrelievoInCoda } from "./prelievoInCoda";
import { inviaRapportoInCoda, type RapportoInCoda } from "./rapportoInCoda";
import { inviaTecnicaInCoda } from "./tecnicaInCoda";
import type { SegnalazioneInCoda, SpesaInCoda } from "./spese";
import type { DatiBozzaTecnica } from "./bozzaTecnica";
import {
  SyncDeferredError,
  SyncPermanentError,
  isInvioTecnico,
  syncOperationId,
  syncItemScope,
  type SyncItem,
} from "./sync-queue";

/** Non aggira RLS: nessuna RPC security-definer generica e nessun target libero. */
export async function processCampoOffline(item: SyncItem) {
  const payload = item.payload as Record<string, unknown>;
  const row = (item.type === "foto" ? payload.riga : payload) as
    | Record<string, unknown>
    | undefined;
  const { owner, companyId } = syncItemScope(item);
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !data.session)
    throw new SyncDeferredError("Accedi per sincronizzare");
  if (!owner || owner !== data.session.user.id)
    throw new SyncDeferredError(
      "Questa operazione appartiene a un altro utente o richiede verifica dell’autore",
    );
  if (isInvioTecnico(item.type)) {
    const { data: azienda, error } = await supabase.rpc("get_effective_company_id");
    if (error || !azienda || azienda !== companyId) {
      throw new SyncDeferredError("L’invio riprende nell’azienda della registrazione.");
    }
    return inviaTecnicaInCoda(item.payload as DatiBozzaTecnica, await syncOperationId(item));
  }
  if (item.type === "prelievo" || item.type === "rapportino") {
    const { data: azienda, error } = await supabase.rpc("get_my_company_id");
    if (error || !azienda || azienda !== companyId) {
      throw new SyncDeferredError("L’invio riprende quando è disponibile l’azienda della registrazione.");
    }
  }
  if (item.type === "prelievo") {
    return inviaPrelievoInCoda(item.payload as PrelievoInCoda, await syncOperationId(item));
  }
  if (item.type === "rapportino") {
    return inviaRapportoInCoda(item.payload as RapportoInCoda, await syncOperationId(item));
  }
  if (item.type === "documento_ddt") {
    const { inviaDocumentoPersistente } = await import(
      "../ddt/documentiPersistenti"
    );
    const files = payload.files;
    if (
      !Array.isArray(files) ||
      !files.length ||
      files.some((f) => !(f instanceof Blob) && !(f instanceof ArrayBuffer))
    )
      throw new SyncPermanentError(
        "Documento locale non disponibile: la bozza è conservata",
      );
    const companyId =
      typeof payload.company_id === "string" ? payload.company_id : "";
    if (!companyId)
      throw new SyncPermanentError("Azienda mancante nella bozza");
    await inviaDocumentoPersistente({
      files: files.map((f, i) =>
        f instanceof File
          ? f
          : new File(
              [f],
              Array.isArray(payload.fileNames)
                ? String(payload.fileNames[i] || `pagina-${i + 1}.jpg`)
                : `pagina-${i + 1}.jpg`,
              {
                type: Array.isArray(payload.fileTypes)
                  ? String(payload.fileTypes[i] || f.type)
                  : f.type,
              },
            ),
      ),
      companyId,
      userId: owner,
      orderId: typeof payload.order_id === "string" ? payload.order_id : null,
      source: payload.source === "desktop" ? "desktop" : "campo",
      destinazione:
        payload.destinazione === "magazzino" || payload.destinazione === "cantiere"
          ? payload.destinazione
          : undefined,
      warehouseId: typeof payload.warehouse_id === "string" ? payload.warehouse_id : null,
      operationId: await syncOperationId(item),
    });
    return;
  }
  if (item.type === "rapportino_vocale") {
    // Vecchi payload non contengono un giornaliero completo: conservarli, mai fingere l'invio canonico.
    throw new SyncPermanentError(
      "Vecchia bozza vocale: apri il giornaliero del cantiere e conferma i dati. Il contenuto locale è conservato.",
    );
  }
  if (item.type === "generic")
    throw new SyncPermanentError(
      "Operazione non supportata: contatta l’assistenza. I dati locali sono conservati.",
    );
  if (item.type === "segnalazione") {
    // Segnalazione fatta senza rete (piano campo completo 1.7): prima il ticket con l'id nato sul telefono,
    // poi le foto. Ogni passo si può ripetere: ticket già c'è, foto già caricata, messaggio già scritto.
    const s = payload as unknown as SegnalazioneInCoda;
    const { error } = await supabase.from("tickets").insert(s.riga as never);
    if (error && error.code !== "23505") throw databaseError(error);
    for (const f of s.foto) {
      const { error: up } = await supabase.storage.from("ticket-attachments").upload(f.path, f.blob, { contentType: f.contentType, upsert: false });
      const esiste = up && ((up as { statusCode?: string }).statusCode === "409" || up.message.toLowerCase().includes("already exists"));
      if (up && !esiste) throw new Error(up.message);
      const { data: gia } = await supabase.from("ticket_messages").select("id").eq("ticket_id", s.riga.id).eq("attachment_url", f.path).maybeSingle();
      if (gia) continue;
      const { error: msg } = await supabase.from("ticket_messages").insert({ ticket_id: s.riga.id, sender_id: s.user_id, message: `📎 ${f.nome}`, attachment_url: f.path } as never);
      if (msg) throw databaseError(msg);
    }
    return;
  }
  if (item.type === "spesa") {
    // Spesa fatta senza rete (26/11/2026, piano campo completo 1.7): prima la foto dello scontrino, poi la riga,
    // con l'id nato sul telefono. Se la risposta si era persa, la riga c'è già: va bene così.
    const spesa = payload as unknown as SpesaInCoda;
    if (spesa.foto) {
      const { error } = await supabase.storage.from("campo-spese").upload(spesa.foto.path, spesa.foto.blob, {
        contentType: spesa.foto.contentType, upsert: false,
      });
      const esiste = error && ((error as { statusCode?: string }).statusCode === "409" || error.message.toLowerCase().includes("already exists"));
      if (error && !esiste) throw new Error(error.message);
    }
    const { error } = await supabase.from("campo_spese").insert({ ...spesa.riga, foto_path: spesa.foto?.path ?? null } as never);
    if (!error) return;
    if (error.code === "23505") {
      const { data: giaInviata } = await supabase.from("campo_spese").select("id").eq("id", spesa.riga.id).maybeSingle();
      if (giaInviata) return;
    }
    throw databaseError(error);
  }
  if (item.type === "checklist") {
    const idChecklist = typeof payload.id === "string" ? payload.id : await syncOperationId(item);
    const error = await salvaChecklistSicurezza(payload as ChecklistDaSalvare, idChecklist);
    if (error?.code === "PT409") throw new SyncPermanentError(`${error.message} La checklist locale è ancora in coda.`);
    if (error) throw databaseError(error);
    return;
  }
  // La timbratura porta il suo id da quando è nata: lo stesso del primo tentativo andato male.
  const idOriginale = item.type === "foto" ? row?.id : payload.id;
  const id = typeof idOriginale === "string" ? idOriginale : await syncOperationId(item);
  let table: "foto_cantiere" | "campo_timbrature";
  let insert: Record<string, unknown>;
  if (item.type === "foto") {
    const photo = payload as unknown as {
      bucket: string;
      path: string;
      blob: Blob;
      contentType: string;
      riga?: Record<string, unknown>;
    };
    // Audio legacy non associato ad un giornaliero: non cancellarlo come "foto sincronizzata".
    if (!photo.riga || !owner || !photo.path)
      throw new SyncPermanentError(
        "Allegato senza giornaliero: contenuto locale conservato, contatta l’assistenza.",
      );
    const storage = supabase.storage.from(photo.bucket);
    const { error } = await storage.upload(photo.path, photo.blob, {
      contentType: photo.contentType,
      upsert: false,
    });
    const exists =
      error &&
      ((error as { statusCode?: string }).statusCode === "409" ||
        error.message.toLowerCase().includes("already exists"));
    if (error && !exists) throw new Error(error.message);
    if (exists) {
      const { data: copia, error: lettura } = await storage.download(photo.path);
      if (lettura || !copia) throw new Error("Impossibile verificare il file già caricato.");
      const [locale, salvata] = await Promise.all([photo.blob.arrayBuffer(), copia.arrayBuffer()]);
      const bytes = new Uint8Array(salvata);
      if (locale.byteLength !== salvata.byteLength || !new Uint8Array(locale).every((valore, indice) => valore === bytes[indice])) {
        throw new SyncPermanentError("Il percorso contiene un altro file. La foto sul dispositivo è conservata.");
      }
    }
    table = "foto_cantiere";
    insert = { ...photo.riga, storage_path: photo.path, id };
  } else if (item.type === "timbratura") {
    if (!owner)
      throw new SyncPermanentError("Timbratura senza autore: non inviata");
    table = "campo_timbrature";
    insert = { ...payload, id };
  } else throw new SyncPermanentError("Tipo offline non supportato");
  const { error } = await supabase.from(table).insert(insert as never);
  if (!error) return;
  if (error.code === "23505") {
    // Risposta persa dopo un insert riuscito: verifica quella riga, non qualunque vincolo duplicato.
    const lookup =
      table === "foto_cantiere"
        ? supabase
            .from("foto_cantiere")
            .select("id")
            .eq("id", id)
            .eq("company_id", row?.company_id as string)
            .eq("uploaded_by", owner as string)
            .eq("storage_path", String(insert.storage_path))
        : supabase
            .from("campo_timbrature")
            .select("id")
            .eq("id", id)
            .eq("company_id", row?.company_id as string)
            .eq("user_id", owner as string);
    const { data: existing, error: lookupError } = await lookup.maybeSingle();
    if (!lookupError && existing) return;
    if (lookupError) throw databaseError(lookupError);
  }
  throw databaseError(error);
}

function databaseError(error: { code?: string; message: string }): Error {
  return error.code?.startsWith("22") ||
    error.code?.startsWith("23") ||
    error.code === "42501"
    ? new SyncPermanentError(error.message)
    : new Error(error.message);
}
