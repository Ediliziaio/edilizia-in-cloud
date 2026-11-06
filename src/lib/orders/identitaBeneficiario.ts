/** Identità del riepilogo, distinta dall'id contabile del compenso.
 * Unisce solo collegamenti espliciti allo stesso venditore, mai nomi omonimi.
 */
export function identitaBeneficiario(id: string, origine?: { source_type?: string | null; source_id?: string | null } | null): string {
  if (origine?.source_type === "salesperson" && origine.source_id) return `salesperson:${origine.source_id}`;
  return id;
}
