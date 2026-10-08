import { requireQuoteModelAccess } from "./quoteModelAccess.ts";
import { moduloAttivo } from "./moduloAttivo.ts";
import { validateBathroomRenderInput } from "./bathroomRenderInput.ts";

export const BATHROOM_RENDERER_VERSION = "documento-edile-bgn-v1";
export const BATHROOM_MODELS = ["completo", "vasca-doccia", "doccia", "sanitari", "accessibilita", "rinnovo"];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function documentDigest(value: unknown): Promise<string> {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// deno-lint-ignore no-explicit-any -- schema-independent service client boundary; payload validated below
export async function readBathroomDocumentState(db: any, companyId: string, projectId: string, model: string, revision: string) {
  if (!UUID.test(companyId) || !UUID.test(projectId) || !BATHROOM_MODELS.includes(model) || !Number.isFinite(Date.parse(revision))) {
    throw new Error("Indica azienda, progetto bagno, modello e revisione esatti. Una quote classica non basta.");
  }
  const results = await Promise.all([
    db.from("bgn_progetti").select("*").eq("company_id", companyId).eq("id", projectId).is("deleted_at", null).maybeSingle(),
    db.from("bgn_computo_voci").select("*").eq("company_id", companyId).eq("progetto_id", projectId).order("ordine").order("id").limit(201),
    db.from("bgn_progetti_media").select("*").eq("company_id", companyId).eq("progetto_id", projectId).order("ordine").order("id").limit(101),
    db.from("companies").select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number, website, logo_url, brand_primary_color, brand_logo_dark_url").eq("id", companyId).maybeSingle(),
  ]);
  if (results.some(r => r.error) || !results[0].data || !results[3].data || results[2].data?.length > 100) {
    throw new Error("Dati del progetto non leggibili integralmente.");
  }
  const [p, rows, media, company] = results.map(r => r.data);
  if (p.updated_at !== revision || p.modello_snapshot?.modelId !== model) {
    throw new Error("Progetto o modello cambiato: verifica e richiedi nuova conferma.");
  }
  const payload = { progetto: p, computo: rows, media, company: {
    name: company.name, ragione_sociale: company.business_name ?? company.name,
    indirizzo: [company.legal_address, company.legal_postal_code, company.legal_city, company.legal_province].filter(Boolean).join(", "),
    telefono: company.phone, email: company.email, partita_iva: company.vat_number, website: company.website,
    logo_url: company.logo_url, colore_marca: company.brand_primary_color, logo_chiaro_url: company.brand_logo_dark_url,
  } };
  validateBathroomRenderInput(payload);
  return payload;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// deno-lint-ignore no-explicit-any -- authorization helper accepts the service client boundary
export async function requireBathroomDocumentAccess(db: any, companyId: string, userId: string) {
  await requireQuoteModelAccess(db, companyId, userId);
  if (!await moduloAttivo(db, companyId, "modulo_bagni_attivo")) throw new Error("Modulo Bagni non abilitato.");
}
export function bathroomStateDigest(payload: unknown) {
  return documentDigest({ renderer_version: BATHROOM_RENDERER_VERSION, payload });
}
// A service key cannot make an arbitrary path or renderer into a verified receipt.
export interface BathroomArtifact {
  id: string; company_id: string; project_id: string; module: "bagni"; model_id: string;
  project_revision: string; fingerprint: string; renderer_version: string; pdf_sha256: string;
  byte_length: number; storage_path: string;
}
export function validateBathroomArtifact(value: unknown, company: string, project: string, model: string, revision: string, fingerprint: string): asserts value is BathroomArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ricevuta PDF non verificabile.");
  const a = value as Record<string, unknown>;
  if (!UUID.test(String(a.id)) || a.company_id !== company || a.project_id !== project || a.module !== "bagni" ||
      a.model_id !== model || a.project_revision !== revision || a.fingerprint !== fingerprint ||
      a.renderer_version !== BATHROOM_RENDERER_VERSION || !/^[a-f0-9]{64}$/.test(String(a.pdf_sha256)) ||
      typeof a.byte_length !== "number" || !Number.isInteger(a.byte_length) || a.byte_length < 100 || a.byte_length > 20 * 1024 * 1024 ||
      a.storage_path !== `bagno/${company}/${project}/${fingerprint}-${a.pdf_sha256}.pdf`) {
    throw new Error("Ricevuta PDF non verificabile: nessun documento inviato.");
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// deno-lint-ignore no-explicit-any -- storage service client boundary; exact bytes verified below
export async function verifyBathroomArtifactBytes(db: any, artifact: Pick<BathroomArtifact, "storage_path" | "byte_length" | "pdf_sha256">): Promise<void> {
  const { data, error } = await db.storage.from("quote-pdfs").download(artifact.storage_path);
  if (error || !data || data.size !== artifact.byte_length) throw new Error("Documento salvato non disponibile o diverso dalla ricevuta.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-" || await documentDigest(bytes) !== artifact.pdf_sha256) {
    throw new Error("Documento salvato non corrisponde alla ricevuta: invio bloccato.");
  }
}
