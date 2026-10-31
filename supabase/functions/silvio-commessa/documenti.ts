/**
 * I documenti che `silvio-commessa` legge senza farli ricaricare (31/10/2026, fase 3).
 *
 * Prima un documento già allegato alla commessa si scaricava nel browser e si ricaricava in
 * silvio-uploads per farlo leggere: la copia restava lì, orfana. Ora la funzione lo legge
 * dove sta. Il percorso NON arriva da chi chiama: arriva l'id della riga, che si legge col
 * client di chi chiama (la RLS decide se la vede, con gli stessi controlli dell'app), e il
 * percorso si prende da quella riga. Solo dopo si scarica con la chiave di servizio.
 *
 * - `allegato_commessa`: una riga di `order_attachments` (bucket order-attachments, o
 *   order-variation-documents per i documenti delle varianti), della commessa di questa azienda;
 * - `allegato_email`: un allegato di `email_inbox.attachments` (bucket email-attachments,
 *   sotto `<azienda>/…`), che il browser non può scaricare da sé.
 */
import { percorsoStorageSicuro } from "../_shared/storageAmmesso.ts";
import type { RifDocumento } from "../../../shared/silvio-commessa/ingressi.ts";

export type { RifDocumento };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DocumentoTrovato {
  bucket: string;
  path: string;
  nome: string;
}

/** Il riferimento nel corpo della richiesta, o null se non ha la forma giusta. */
export function rifDocumento(x: unknown): RifDocumento | null {
  const r = (x ?? {}) as Record<string, unknown>;
  if (r.tipo === "allegato_commessa" && typeof r.id === "string" && UUID.test(r.id)) return { tipo: r.tipo, id: r.id };
  if (r.tipo === "allegato_email" && typeof r.email_id === "string" && UUID.test(r.email_id)
    && Number.isInteger(r.indice) && (r.indice as number) >= 0 && (r.indice as number) < 50) {
    return { tipo: r.tipo, email_id: r.email_id, indice: r.indice as number };
  }
  return null;
}

/** Come `attachmentStorage` dell'app (src/components/orders/filePreviewUtils.ts): percorso, o URL intero vecchio. */
function storageDellAllegato(fileUrl: string): { bucket: string; path: string } {
  const varianti = "order-variation-documents/";
  if (fileUrl.startsWith(varianti)) return { bucket: "order-variation-documents", path: fileUrl.slice(varianti.length) };
  const marker = "/order-attachments/";
  return { bucket: "order-attachments", path: fileUrl.includes(marker) ? fileUrl.split(marker)[1].split("?")[0] : fileUrl };
}

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Trova il documento. `utente` è il client col token di chi chiama (RLS), `admin` quello
 * di servizio: si usa solo per controllare l'azienda della commessa. Null = non trovato o
 * non visibile (la funzione risponde 404, senza dire quale dei due).
 */
export async function trovaDocumento(rif: RifDocumento, companyId: string, utente: Db, admin: Db): Promise<DocumentoTrovato | null> {
  if (rif.tipo === "allegato_commessa") {
    const { data: a } = await utente.from("order_attachments").select("id, order_id, file_name, file_url").eq("id", rif.id).maybeSingle();
    if (!a?.file_url || !a.order_id) return null;
    const { data: o } = await admin.from("orders").select("id").eq("id", a.order_id).eq("company_id", companyId).maybeSingle();
    if (!o) return null;
    const { bucket, path } = storageDellAllegato(String(a.file_url));
    if (!percorsoStorageSicuro(path)) return null;
    return { bucket, path, nome: String(a.file_name ?? path.split("/").pop() ?? "documento") };
  }
  const { data: e } = await utente.from("email_inbox").select("id, company_id, attachments").eq("id", rif.email_id).maybeSingle();
  if (!e || e.company_id !== companyId) return null;
  const allegato = Array.isArray(e.attachments) ? e.attachments[rif.indice] : null;
  const path = allegato?.storage_path;
  if (!percorsoStorageSicuro(path) || !path.startsWith(`${companyId}/`)) return null;
  return { bucket: "email-attachments", path, nome: String(allegato.filename ?? path.split("/").pop() ?? "allegato") };
}
