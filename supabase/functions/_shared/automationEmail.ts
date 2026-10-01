/** Shared contract for the email editor and worker. Legacy aliases remain readable. */
export const EMAIL_RECORD_FIELDS: Record<string, readonly string[]> = {
  contact: ["id", "first_name", "last_name", "full_name", "email", "phone", "city", "province", "region", "address", "postal_code", "company_name", "source", "tags", "created_at", "date_of_birth"],
  opportunity: ["id", "name", "value", "status", "source", "expected_close_date", "loss_reason"],
  appointment: ["id", "title", "appointment_date", "appointment_time", "appointment_end_time", "formatted_address", "meeting_url", "status", "giorno", "data", "ora", "ora_fine", "titolo", "luogo", "link_riprogramma", "link_sposta", "link_call"],
  order: ["id", "order_code", "description", "total_amount", "deposit_amount", "balance_amount", "expected_date", "work_start_date", "work_end_date"],
  quote: ["id", "quote_number", "total", "client_name", "client_email", "expires_at"],
  invoice: ["id", "invoice_number", "total", "tax_amount", "client_company_name", "client_email", "due_date"],
  task: ["id", "title", "priority", "due_date", "status"],
  ticket: ["id", "subject", "priority", "category", "status"],
};
export const EMAIL_PREFIX_TYPES: Record<string, string> = {
  contatto: "contact", contact: "contact", opportunita: "opportunity", opportunity: "opportunity",
  appuntamento: "appointment", appointment: "appointment", ordine: "order", order: "order",
  preventivo: "quote", quote: "quote", fattura: "invoice", invoice: "invoice", task: "task", ticket: "ticket",
};
export const EMAIL_BASE_VARIABLES = [
  { key: "contatto.first_name", label: "Nome contatto" },
  { key: "contatto.last_name", label: "Cognome contatto" },
  { key: "contatto.full_name", label: "Nome completo" },
  { key: "contatto.email", label: "Email contatto" },
  { key: "contatto.phone", label: "Telefono contatto" },
  { key: "contatto.company_name", label: "Azienda del contatto" },
  { key: "contatto.city", label: "Città" },
  { key: "contatto.province", label: "Provincia" },
  { key: "azienda.name", label: "Nome della tua azienda" },
  { key: "azienda.email", label: "Email della tua azienda" },
  { key: "azienda.phone", label: "Telefono della tua azienda" },
  { key: "system.today", label: "Data di oggi" },
  { key: "unsubscribe_url", label: "Link di disiscrizione" },
];
/** The visible Italian fields win even when intentionally cleared. */
export function normalizeAutomationEmailConfig(raw: Record<string, any> = {}): Record<string, any> {
  return { ...raw,
    email_to: raw.destinatario ?? raw.email_to ?? "",
    email_subject: raw.oggetto ?? raw.email_subject ?? raw.subject ?? "",
    email_body: raw.corpo ?? raw.email_body ?? raw.html ?? raw.body ?? "",
    template_id: raw.modello_id ?? raw.template_id ?? "",
    from_name: raw.da_nome ?? raw.from_name ?? "",
    from_email: raw.da_email ?? raw.from_email ?? "",
  };
}
export function emailVariableSupported(key: string): boolean {
  if (EMAIL_BASE_VARIABLES.some(v => v.key === key)) return true;
  const [prefix, field, extra] = key.split(".");
  return !extra && field !== "id" && !!EMAIL_RECORD_FIELDS[EMAIL_PREFIX_TYPES[prefix]]?.includes(field);
}
/** Stable across renames and two custom fields having the same label/slug. */
export function emailCustomFieldKey(id: string): string { return `contact.custom_${id.replace(/-/g, "")}`; }
export function emailTokens(text: unknown): string[] {
  return Array.from(new Set(Array.from(String(text ?? "").matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g), m => m[1])));
}
export function escapeEmailValue(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
export function emailContentEmpty(value: unknown): boolean {
  const html = String(value ?? "");
  if (/<img\b[^>]*\bsrc\s*=/i.test(html)) return false;
  return !html.replace(/<[^>]*>/g, "").replace(/&(?:nbsp|#160|#xA0);/gi, " ").replace(/[\s\u200b-\u200d\ufeff]/g, "");
}
export function emailAddressList(raw: string): string[] {
  if (!raw.trim()) return [];
  const values = raw.split(/[,;]+/).map(v => v.trim());
  if (values.some(v => !/^[^@\s<>;,]+@[^@\s<>;,]+\.[^@\s<>;,]+$/.test(v))) throw new Error("Indirizzo email non valido: usa una virgola per separare più indirizzi");
  return Array.from(new Set(values.map(v => v.toLowerCase())));
}
export function automationEmailDelayMs(config: Record<string, any>): number {
  if (config.ritardo_valore == null || config.ritardo_valore === "") return 0;
  const n = Number(config.ritardo_valore);
  const multiplier = ({ minuti: 60_000, ore: 3_600_000, giorni: 86_400_000 } as Record<string, number>)[config.ritardo_unita || "minuti"];
  if (!Number.isInteger(n) || n < 0 || !multiplier || !Number.isSafeInteger(n * multiplier)) throw new Error("Ritardo email non valido");
  return n * multiplier;
}
export function renderEmailSample(text: string, values: Record<string, string>, html = false): { text: string; missing: string[] } {
  const missing: string[] = [];
  const rendered = String(text ?? "").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) { missing.push(key); return match; }
    return html ? escapeEmailValue(values[key]) : String(values[key]);
  });
  return { text: rendered, missing: Array.from(new Set(missing)) };
}
