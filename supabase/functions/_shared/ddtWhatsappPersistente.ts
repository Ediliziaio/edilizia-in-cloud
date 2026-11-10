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
  },
) {
  if (
    !percorsoStorageSicuro(opts.storagePath) ||
    !opts.storagePath.startsWith(`${opts.companyId}/`)
  )
    throw new Error("Documento fuori dall’azienda");
  const { data: file, error } = await db.storage
    .from("whatsapp-media")
    .download(opts.storagePath);
  if (error || !file || !file.size || file.size > 18 * 1024 * 1024)
    throw new Error("Originale non disponibile o superiore a 18 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = tipoFileDdt(bytes);
  if (!mime) throw new Error("Formato documento non valido");
  const fileHash = await sha(new TextEncoder().encode(await sha(bytes)));
  const lookup = async () => {
    const r = await db
      .from("ddt_document_jobs")
      .select("id,created_by,order_id,status,result")
      .eq("company_id", opts.companyId)
      .eq("file_hash", fileHash)
      .maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  };
  let j = await lookup();
  if (!j) {
    const id = crypto.randomUUID();
    const { data, error: insertError } = await db
      .from("ddt_document_jobs")
      .insert({
        id,
        company_id: opts.companyId,
        created_by: opts.userId,
        employee_id: opts.employeeId ?? null,
        order_id: opts.orderId ?? null,
        source: "whatsapp",
        source_key: opts.messageId,
        file_hash: fileHash,
        files: [
          {
            path: opts.storagePath,
            name: opts.storagePath.split("/").pop(),
            mime,
            size: file.size,
            bucket: "whatsapp-media",
          },
        ],
        status: opts.result ? "review" : "queued",
        result: opts.result ? ddtWhatsappRicco(opts.result) : null,
      })
      .select("id,created_by,order_id,status,result")
      .single();
    if (insertError && insertError.code !== "23505") throw insertError;
    j = insertError ? await lookup() : data;
  }
  if (!j) throw new Error("Manca la conferma del salvataggio");
  // Un duplicato di un collega non si riassegna: il documento viene confrontato dall'ufficio.
  if (
    opts.orderId &&
    !j.order_id &&
    j.status !== "registered" &&
    j.created_by === opts.userId &&
    opts.userId
  ) {
    const { error: updateError } = await db
      .from("ddt_document_jobs")
      .update({ order_id: opts.orderId, updated_at: new Date().toISOString() })
      .eq("company_id", opts.companyId)
      .eq("id", j.id)
      .is("order_id", null);
    if (updateError) throw updateError;
  }
  return { id: j.id as string, status: j.status as string };
}
