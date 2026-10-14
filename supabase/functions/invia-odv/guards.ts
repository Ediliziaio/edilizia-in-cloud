export function pendingVariation(odv: { status?: unknown; company_id?: unknown; order?: {company_id?: unknown} | null }) {
  return odv.status === "in_attesa" && typeof odv.company_id === "string" && odv.order?.company_id === odv.company_id;
}
export function escapeVariationHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
}
export function variationEmailAmount(value: unknown) {
  const amount = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(amount)) throw new Error("Importo della variante non valido");
  return amount.toLocaleString("it-IT",{style:"currency",currency:"EUR"});
}
