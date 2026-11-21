import { percorsoStorageSicuro } from "./storageAmmesso.ts";
import { tipoFileDdt } from "./tipoFileDdt.ts";
const sha = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Adatta il lettore del bot allo stesso documento che rivede l'ufficio, senza un'altra chiamata AI. */
export function ddtWhatsappRicco(raw: Record<string, unknown>) {
  if (raw.intestazione) return raw;
  return {
    intestazione: {
      numero_ddt: raw.ddt_number ?? null,
      data_ddt: raw.ddt_date ?? null,
      causale: raw.causale ?? null,
    },
    mittente: {
      ragione_sociale: raw.supplier_name ?? null,
      partita_iva: raw.supplier_vat ?? null,
    },
    luogo_destinazione: { indirizzo: raw.delivery_address ?? null },
    riferimenti: {
      ordine_cliente: raw.order_reference ?? null,
      note_libere: raw.notes ?? null,
    },
    righe_merce: (Array.isArray(raw.items) ? raw.items : []).map(
      (r: Record<string, unknown>) => ({
        descrizione: r.description ?? "",
        codice_articolo: r.code ?? null,
        quantita: r.quantity ?? null,
        unita_misura: r.unit ?? null,
        prezzo_unitario_eur: r.unit_price ?? null,
      }),
    ),
    confidence:
      raw.confidenza_estrazione === "alta"
        ? 0.9
        : raw.confidenza_estrazione === "bassa"
          ? 0.45
          : 0.7,
    warnings: [],
    origine_lettura: "whatsapp",
  };
}

export async function acquisisciDdtWhatsapp(
  db: any,
  opts: {
    storagePath: string;
    companyId: string;
    userId: string | null;
    employeeId?: string | null;
    messageId: string;
    orderId?: string | null;
    result?: Record<string, unknown>;
    primaDellaLettura?: boolean;
    accodaLettura?: boolean;
    file?: Blob;
  },
) {
  if (
    !percorsoStorageSicuro(opts.storagePath) ||
    !opts.storagePath.startsWith(`${opts.companyId}/`)
  )
    throw new Error("Documento fuori dall’azienda");
  const { data: file, error } = opts.file
    ? { data: opts.file, error: null as unknown }
    : await db.storage.from("whatsapp-media").download(opts.storagePath);
  if (error || !file || !file.size || file.size > 18 * 1024 * 1024)
    throw new Error("Originale non disponibile o superiore a 18 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = tipoFileDdt(bytes);
  if (!mime) throw new Error("Formato documento non valido");
  const paginaHash = await sha(bytes);
  const fileHash = await sha(new TextEncoder().encode(paginaHash));
  const lookup = async () => {
    const r = await db
      .from("ddt_document_jobs")
      .select("id,created_by,employee_id,source_key,order_id,destinazione,status,result")
      .eq("company_id", opts.companyId)
      .eq("file_hash", fileHash)
      .maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  };
  let j = await lookup();
  if (!j) {
    const id = crypto.randomUUID();
    // Il documento passa nell'archivio DDT: il vecchio bucket WhatsApp limita
    // la lettura all'azienda principale del profilo e non copre gli utenti
    // autorizzati su più aziende. L'allegato WhatsApp originale resta intatto.
    const estensione =
      {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/heif": "heif",
        "image/bmp": "bmp",
      }[mime] ?? "bin";
    const originalePath = `${opts.companyId}/${opts.userId ?? "null"}/${id}/1-originale.${estensione}`;
    const { error: copyError } = await db.storage
      .from("ddt-documenti")
      .upload(originalePath, bytes, { contentType: mime, upsert: false });
    if (copyError)
      throw new Error("Copia del documento non completata: riprova");
    const { data, error: insertError } = await db
      .from("ddt_document_jobs")
      .insert({
        id,
        company_id: opts.companyId,
        created_by: opts.userId,
        employee_id: opts.employeeId ?? null,
        order_id: opts.orderId ?? null,
        ...(opts.orderId ? { destinazione: "cantiere" } : {}),
        source: "whatsapp",
        source_key: opts.messageId,
        file_hash: fileHash,
        files: [
          {
            path: originalePath,
            name: opts.storagePath.split("/").pop(),
            mime,
            size: file.size,
            bucket: "ddt-documenti",
            sha256: paginaHash,
          },
        ],
        status: opts.result ? "review" : opts.primaDellaLettura ? "da_leggere" : "queued",
        result: opts.result ? ddtWhatsappRicco(opts.result) : null,
      })
      .select("id,created_by,employee_id,source_key,order_id,destinazione,status,result")
      .single();
    if (insertError && insertError.code !== "23505") throw insertError;
    if (insertError) {
      j = await lookup();
      // Un'altra acquisizione ha vinto il vincolo sull'impronta.
      if (j && j.id !== id) await db.storage.from("ddt-documenti").remove([originalePath]);
    } else j = data;
  }
  if (!j) throw new Error("Manca la conferma del salvataggio");
  const stessoOperatore = opts.userId ? j.created_by === opts.userId
    : !j.created_by && !!opts.employeeId && j.employee_id === opts.employeeId;
  if (stessoOperatore && (opts.result || opts.accodaLettura) && j.source_key === opts.messageId && j.status === "da_leggere" && !j.result) {
    const status = opts.result ? "review" : "queued";
    const { data: aggiornata, error: letturaError } = await db.from("ddt_document_jobs")
      .update({ ...(opts.result ? { result: ddtWhatsappRicco(opts.result) } : {}), status, updated_at: new Date().toISOString() })
      .eq("company_id", opts.companyId).eq("id", j.id).eq("status", "da_leggere").is("result", null)
      .select("id").maybeSingle();
    if (letturaError) throw letturaError;
    if (aggiornata) j.status = status;
  }
  // Un duplicato di un collega non si riassegna: il documento viene confrontato dall'ufficio.
  if (
    opts.orderId &&
    !j.order_id &&
    !j.destinazione &&
    ["queued", "review", "da_leggere", "error"].includes(j.status) &&
    stessoOperatore
  ) {
    const { error: updateError } = await db
      .from("ddt_document_jobs")
      .update({ order_id: opts.orderId, destinazione: "cantiere", updated_at: new Date().toISOString() })
      .eq("company_id", opts.companyId)
      .eq("id", j.id)
      .is("order_id", null).is("destinazione", null).eq("status", j.status);
    if (updateError) throw updateError;
  }
  return { id: j.id as string, status: j.status as string, stessoOperatore };
}
