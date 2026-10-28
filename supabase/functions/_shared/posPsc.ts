/** Declared reference to an original PSC. A digest identifies bytes; it is not technical approval. */
export interface RiferimentoPsc {
  archivio: "sicurezza_documenti" | "sicurezza_fascicolo";
  id: string;
  company_id: string;
  order_id: string;
  titolo: string;
  file_name: string;
  file_path: string;
  data_documento: string;
  revisione: string;
  sha256: string;
}
export interface FontePsc extends Omit<RiferimentoPsc, "sha256"> {
  created_at: string;
}
const stringa = (v: unknown) => typeof v === "string" ? v.trim() : "";
export function normalizzaRiferimentoPsc(
  v: unknown,
): RiferimentoPsc | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (
    o.archivio !== "sicurezza_documenti" && o.archivio !== "sicurezza_fascicolo"
  ) return undefined;
  const r: RiferimentoPsc = {
    archivio: o.archivio,
    id: stringa(o.id),
    company_id: stringa(o.company_id),
    order_id: stringa(o.order_id),
    titolo: stringa(o.titolo),
    file_name: stringa(o.file_name),
    file_path: stringa(o.file_path),
    data_documento: stringa(o.data_documento),
    revisione: stringa(o.revisione),
    sha256: stringa(o.sha256).toLowerCase(),
  };
  if (
    !r.id || !r.company_id || !r.order_id || !r.titolo || !r.revisione ||
    !/^[a-f0-9]{64}$/.test(r.sha256) ||
    !percorsoPscValido(r.file_path, r.company_id)
  ) return undefined;
  return r;
}
export function percorsoPscValido(path: string, companyId: string): boolean {
  return path.startsWith(`${companyId}/`) && !/[\\%?#]/.test(path) &&
    path.split("/").every((p) => p && p !== "." && p !== "..");
}
export function stessaFontePsc(
  r: Omit<RiferimentoPsc, "sha256">,
  f: FontePsc,
): boolean {
  // Revision may be declared by the editor for archives without a revision field.
  return r.archivio === f.archivio && r.id === f.id &&
    r.company_id === f.company_id && r.order_id === f.order_id &&
    r.titolo === f.titolo && r.file_name === f.file_name &&
    r.file_path === f.file_path && r.data_documento === f.data_documento &&
    (!f.revisione || r.revisione === f.revisione);
}
export async function improntaPsc(file: Blob): Promise<string> {
  if (!file.size || file.size > 50 * 1024 * 1024) {
    throw new Error("PSC vuoto o superiore a 50 MB.");
  }
  const bytes = await file.arrayBuffer();
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
