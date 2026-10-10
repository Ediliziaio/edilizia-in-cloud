/** Keep trigger data intact while exposing objects explicitly created by a step. */
export function automationNextContext(context: Record<string, any> = {}, output: Record<string, any> = {}): Record<string, any> {
  context = context && typeof context === "object" ? context : {};
  output = output && typeof output === "object" && !Array.isArray(output) ? output : {};
  const payload = { ...(context.payload ?? {}) };
  // Latest-result values must not silently leak from an older step.
  for (const key of Object.keys(payload)) if (key.startsWith("risultato.")) delete payload[key];
  for (const [key, value] of Object.entries(output).slice(0, 64)) {
    if (/^[a-zA-Z_]\w*$/.test(key) && !/password|secret|token|authorization|api_?key/i.test(key) && value != null && ["string", "number", "boolean"].includes(typeof value)) payload[`risultato.${key}`] = value;
  }
  const ids: Record<string, string> = {
    appuntamento_id: "appointment_id", ordine_id: "order_id", cantiere_id: "order_id",
    preventivo_id: "quote_id", fattura_id: "invoice_id", opportunity_id: "opportunity_id", ticket_id: "ticket_id",
  };
  for (const [key, target] of Object.entries(ids)) {
    if (typeof output[key] === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(output[key])) payload[target] = output[key];
  }
  // Explicit platform outputs only: never flatten credentials or arbitrary
  // dotted keys, and never confuse a subscription invoice with a tenant invoice.
  for (const key of ["nuovo_account.id", "cs_task.id", "fattura.id", "onboarding.id"]) {
    if (typeof output[key] === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(output[key])) payload[key] = output[key];
  }
  for (const key of ["nuovo_account.email_admin", "fattura.numero"]) {
    if (typeof output[key] === "string") payload[key] = output[key];
  }
  if (typeof output["nuovo_account.id"] === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(output["nuovo_account.id"])) {
    payload["azienda.id"] = output["nuovo_account.id"];
    if (output["nuovo_account.email_admin"]) payload["azienda.email"] = output["nuovo_account.email_admin"];
  }
  return { ...context, payload, prev_result: output };
}
