import { supabase } from "@/integrations/supabase/client";
import { syncQueue } from "@/lib/campo/sync-queue";
import {
  preparaDocumento,
  improntaDocumenti,
  MAX_DOCUMENTO_BYTE,
  erroreDocumento,
  mimeDocumento,
} from "./preparaDocumento";
export interface FileDocumento {
  path: string;
  name: string;
  mime: string;
  size: number;
  prepared_path?: string;
  prepared_name?: string;
  prepared_mime?: string;
  bucket?: string;
}
export interface DocumentoPersistente {
  id: string;
  company_id: string;
  created_by: string | null;
  order_id: string | null;
  source: "campo" | "desktop" | "whatsapp";
  /** «da_leggere»: solo la foto, l'AI la avvia l'ufficio (impostazione «Bolle dal telefono»). */
  status: "queued" | "processing" | "review" | "registered" | "error" | "split" | "da_leggere";
  /** Dove va la merce, scelto da chi ha caricato. Nullo sui lavori vecchi e da WhatsApp. */
  destinazione?: "cantiere" | "magazzino" | null;
  warehouse_id?: string | null;
  files: FileDocumento[];
  split_ids?: string[];
  result: Record<string, unknown> | null;
  last_error: string | null;
  ddt_id: string | null;
  created_at: string;
  updated_at?: string;
}
// Tabella nuova: il contratto è esplicito finché non si rigenerano tutti i tipi.
export const documentiDb = supabase as unknown as {
  from: (tabella: string) => any;
  rpc: (
    nome: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: any; error: any }>;
};
/** La destinazione del documento: quella scelta, altrimenti dedotta dalla commessa. */
export function destinazioneDocumento(j: Pick<DocumentoPersistente, "destinazione" | "order_id">): "cantiere" | "magazzino" {
  return j.destinazione ?? (j.order_id ? "cantiere" : "magazzino");
}
export async function avviaLetturaPersistente(id: string) {
  const { error } = await supabase.functions.invoke("ddt-documenti-processa", {
    body: { id },
  });
  if (error)
    throw new Error(
      "Documento salvato. La lettura verrà ripresa automaticamente.",
    );
}
export async function inviaDocumentoPersistente(input: {
  files: File[];
  companyId: string;
  userId: string;
  orderId: string | null;
  source: "campo" | "desktop";
  /** Dove va la merce. Con «magazzino» anche l'operaio invia senza commessa. */
  destinazione?: "cantiere" | "magazzino";
  warehouseId?: string | null;
  operationId?: string;
  salvaCopiaLocale?: boolean;
}): Promise<{ id: string | null; duplicate: boolean }> {
  const { files, companyId, userId, orderId, source } = input;
  if (!companyId || !userId) throw new Error("Accedi per salvare il documento");
  if (!files.length || files.length > 12)
    throw new Error("Scegli da una a dodici pagine dello stesso documento");
  if (files.reduce((s, f) => s + f.size, 0) > MAX_DOCUMENTO_BYTE)
    throw new Error("Il documento completo supera 18 MB: dividi prima il PDF");
  const id = input.operationId ?? crypto.randomUUID();
  const erroreFormato = files.map(erroreDocumento).find(Boolean);
  if (erroreFormato) throw new Error(erroreFormato);
  // Anche il desktop conserva la ripresa PRIMA della rete. Il processore offline
  // richiama questa funzione senza salvaCopiaLocale, evitando di ricreare la coda.
  const copiaLocale = input.salvaCopiaLocale
    ? await syncQueue.enqueue({
        type: "documento_ddt",
        operationId: id,
        payload: {
          files,
          fileNames: files.map((f) => f.name),
          fileTypes: files.map((f) => f.type),
          user_id: userId,
          company_id: companyId,
          order_id: orderId,
          source,
          destinazione: input.destinazione ?? null,
          warehouse_id: input.warehouseId ?? null,
        },
      })
    : null;
  const hash = await improntaDocumenti(files);
  const metadata: FileDocumento[] = [];
  // Originale e copia per l’AI hanno percorsi distinti e identità stabili anche dopo un retry offline.
  for (let i = 0; i < files.length; i++) {
    const originale = files[i];
    const erroreFormato = erroreDocumento(originale);
    if (erroreFormato) throw new Error(erroreFormato);
    const prefisso = `${companyId}/${userId}/${id}/${i + 1}`;
    const path = `${prefisso}-originale.${originale.name.split(".").pop()?.toLowerCase() ?? "bin"}`;
    const upload = async (p: string, f: File) => {
      const { error } = await supabase.storage
        .from("ddt-documenti")
        .upload(p, f, {
          contentType: f.type || "application/octet-stream",
          upsert: false,
        });
      if (
        error &&
        !String((error as { statusCode?: string }).statusCode).match(/^409$/) &&
        !/already exists|duplicate/i.test(error.message)
      )
        throw new Error(
          "Caricamento non completato. La copia locale resta disponibile per riprovare.",
        );
    };
    const tipoOriginale = mimeDocumento(originale);
    await upload(
      path,
      originale.type === tipoOriginale
        ? originale
        : new File([originale], originale.name, { type: tipoOriginale }),
    );
    const f: FileDocumento = {
      path,
      name: originale.name,
      mime: tipoOriginale,
      size: originale.size,
    };
    // Il server sa convertire HEIC: un browser che fallisce la conversione non perde l'originale.
    const { lettura } = await preparaDocumento(originale).catch(() => ({
      lettura: originale,
    }));
    if (lettura !== originale) {
      const prepared = `${prefisso}-lettura.${lettura.name.split(".").pop()}`;
      await upload(prepared, lettura);
      Object.assign(f, {
        prepared_path: prepared,
        prepared_name: lettura.name,
        prepared_mime: lettura.type,
      });
    }
    metadata.push(f);
  }
  const { data, error } = await documentiDb.rpc("ddt_documento_accoda", {
    p_id: id,
    p_company: companyId,
    p_order: orderId,
    p_files: metadata,
    p_hash: hash,
    p_source: source,
    // Solo se detta: un documento senza destinazione segue la regola di prima.
    ...(input.destinazione
      ? { p_destinazione: input.destinazione, p_warehouse: input.warehouseId ?? null }
      : {}),
  });
  if (error) throw new Error(error.message ?? "Documento non accodato");
  if (!data || typeof data.duplicate !== "boolean")
    throw new Error(
      "Manca la conferma del salvataggio: controlla i documenti in ingresso prima di riprovare",
    );
  if (copiaLocale) await syncQueue.remove(copiaLocale).catch(() => {});
  if (data.id && ["queued", "processing"].includes(data.status))
    void avviaLetturaPersistente(data.id).catch(() => {});
  return { id: data.id ?? null, duplicate: data.duplicate };
}
export async function leggiPersistente(
  id: string,
): Promise<DocumentoPersistente> {
  const { data, error } = await documentiDb
    .from("ddt_document_jobs")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Documento non disponibile");
  return data;
}
export async function attendiLetturaPersistente(
  id: string,
  annullato?: () => boolean,
): Promise<Record<string, unknown>> {
  const fine = Date.now() + 150000;
  while (Date.now() < fine) {
    if (annullato?.())
      throw new Error("Lettura salvata: la trovi nei documenti in ingresso");
    const j = await leggiPersistente(id);
    if ((j.status === "review" || j.status === "registered") && j.result)
      return j.result;
    if (j.status === "da_leggere")
      throw new Error("Documento salvato: la lettura con l'AI la avvia l'ufficio.");
    if (j.status === "split")
      throw new Error(
        "Questo PDF è già stato diviso: apri le singole bolle nei documenti in ingresso.",
      );
    if (j.status === "error")
      throw new Error(
        j.last_error ?? "Lettura non riuscita, originale conservato",
      );
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    "La lettura continua in background. Puoi riprenderla dai documenti in ingresso.",
  );
}
