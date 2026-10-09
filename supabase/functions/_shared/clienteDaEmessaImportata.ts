type IdentitaFiscale = { fiscal_code?: string | null; vat_number?: string | null };
const norm = (v?: string | null) => v?.replace(/\s/g, "").toUpperCase() || "";
/** L'intestatario si può correggere nel modulo, l'identità non può diventare quella di un'altra fattura. */
export function stessaIdentitaFattura(originale: IdentitaFiscale, cliente: IdentitaFiscale): boolean {
  const cf = norm(originale.fiscal_code), iva = norm(originale.vat_number);
  return !!(cf || iva) && (!cf || cf === norm(cliente.fiscal_code)) && (!iva || iva === norm(cliente.vat_number));
}
/** Auth shadow deterministico: due click concorrenti non possono creare due account per lo stesso cliente. */
export async function emailTecnicaClienteImportato(companyId: string, identita: IdentitaFiscale): Promise<string> {
  const key = `${companyId}:${norm(identita.vat_number) || norm(identita.fiscal_code)}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const digest = Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, "0")).join("");
  return `cliente-import-${digest.slice(0,32)}@no-email.ediliziaincloud.local`;
}
