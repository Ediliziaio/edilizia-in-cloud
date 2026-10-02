/** Shared contract for the email editor and worker. Legacy aliases remain readable. */
/**
 * Campi di ogni oggetto utilizzabili nei testi (email, WhatsApp, automazioni).
 * L'elenco è lo stesso del dizionario «Campi personalizzati» → «Campi di sistema»
 * (src/components/settings/CustomFieldsConfig.tsx): la prova che non si
 * discostino è src/test/logic/campiSistemaParita.test.ts. Aggiungere un campo
 * al dizionario senza metterlo qui lo faceva restare stampato come {{...}}.
 * Fuori restano i riferimenti tecnici (…_id, assigned_to, created_by) e le note
 * interne: non hanno senso in un messaggio al cliente.
 */
export const EMAIL_RECORD_FIELDS: Record<string, readonly string[]> = {
  contact: ["id", "first_name", "last_name", "full_name", "email", "phone", "city", "province", "region", "address", "postal_code", "company_name", "source", "tags", "created_at", "date_of_birth", "updated_at", "stato", "tipo", "source_channel", "attr_source", "attr_medium", "attr_campaign", "attr_content", "attr_model", "meta_platform", "fbclid", "gclid", "icp_score", "is_decision_maker", "ai_score", "ai_score_tier", "ai_next_action", "ai_predicted_value_eur", "optout_at", "optout_reason", "opt_out", "unsubscribed_at", "marketing_consent", "marketing_consent_at", "marketing_consent_source", "ricontatta_dopo", "fatturato", "dipendenti", "company_size", "ateco_code", "lat", "lng", "contact_type", "fiscal_code", "vat_number", "lead_score", "icp_tier", "score", "preferred_language", "preferred_channel", "optout_email", "optout_whatsapp", "optout_sms", "optout_call", "unsubscribed", "last_activity_at", "country", "website"],
  opportunity: ["id", "name", "value", "status", "source", "expected_close_date", "loss_reason", "created_at", "updated_at", "last_activity_at", "stage_changed_at", "won_at", "lost_at", "tipo_opportunita", "gclid", "company_name", "tags", "probability", "next_action", "next_action_date", "lost_reason_category", "competitor_won"],
  appointment: ["id", "title", "appointment_date", "appointment_time", "appointment_end_time", "formatted_address", "meeting_url", "status", "giorno", "data", "ora", "ora_fine", "titolo", "luogo", "link_riprogramma", "link_sposta", "link_call", "created_at", "updated_at", "address_line", "address_city", "address_postal_code", "address_province", "address_country", "address_notes", "lat", "lng", "meeting_provider", "meeting_status", "booking_email", "cancelled_at", "riprogrammato_at", "conferma_inviata_at", "is_blocked_slot", "appointment_type", "description", "is_completed", "reminder_minutes"],
  order: ["id", "order_code", "description", "total_amount", "deposit_amount", "balance_amount", "expected_date", "work_start_date", "work_end_date", "created_at", "updated_at", "status", "fulfillment_status", "order_type", "percentuale_avanzamento", "tipo_lavoro", "client_name", "client_email", "client_phone", "client_company", "client_address", "indirizzo_lavori", "work_address", "work_description", "materials_location", "quote_number", "deposit_expected_date", "deposit_2_expected_date", "balance_expected_date", "financing_expected_date", "financing_paid_date", "work_start_time", "work_end_time", "next_action", "next_action_date", "distanza_sede_km", "distanza_sede_minuti", "dl_notification_email", "dl_notification_phone", "payment_type", "vat_rate", "financing_cost", "financing_amount", "warehouse_arrival_date", "deposit_2_amount", "deposit_paid", "deposit_2_paid", "balance_paid", "deposit_paid_date", "deposit_2_paid_date", "balance_paid_date", "has_building_bonus", "financing_paid"],
  quote: ["id", "quote_number", "total", "client_name", "client_email", "expires_at", "created_at", "updated_at", "notes", "tipo_lavoro", "indirizzo_lavori", "piano_installazione", "km_cantiere", "source", "signed_by_name", "refused_at", "refused_reason", "approval_status", "sconto_richiesto_pct", "sconto_autorizzato_pct", "margine_totale_percentuale", "totale_costo_interno", "totale_overhead", "payment_method", "revision_number", "financing_amount", "financing_num_installments", "financing_monthly_rate", "financing_total_due", "ai_close_probability_pct", "ai_predicted_close_date", "title", "status", "client_phone", "validity_days", "description", "terms_and_conditions", "subtotal", "vat_amount", "discount_percent", "discount_amount", "client_company", "client_vat_number", "client_fiscal_code", "client_address", "sent_at", "viewed_at", "signed_at"],
  invoice: ["id", "invoice_number", "total", "tax_amount", "client_company_name", "client_email", "due_date", "progressive_number", "payment_date", "footer_text", "external_status", "external_provider", "pdf_generated_at", "created_at", "updated_at", "subtotal", "status", "issue_date", "paid_amount", "client_vat_number", "payment_method", "document_type", "invoice_year", "client_fiscal_code", "client_pec", "client_sdi_code", "client_address", "client_city", "client_zip", "client_country", "payment_terms", "payment_days", "bank_iban", "notes", "pdf_url"],
  task: ["id", "title", "priority", "due_date", "status", "created_at", "updated_at", "is_recurring", "recurrence_rule", "recurrence_end_date", "estimated_hours", "actual_hours", "category", "completed_at"],
  ticket: ["id", "subject", "priority", "category", "status", "created_at", "updated_at", "fonte", "last_message_at"],
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
