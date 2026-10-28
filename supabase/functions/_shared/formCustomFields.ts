/** Public forms accept only destinations declared in the stored form, never in the request. */
export interface CustomContactDefinition {
  id: string; company_id: string; object_type: string; name: string; field_type: string;
  options?: string[] | null; deleted_at?: string | null;
}
export interface MappedFormField { id?: string; name?: string; label?: string; type?: string; mapping?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const customDestinationId = (mapping: unknown): string | null => typeof mapping === "string" && mapping.startsWith("cf:") && UUID.test(mapping.slice(3)) ? mapping.slice(3).toLowerCase() : null;
const COMPATIBLE: Record<string, string[]> = {
  text: ["text", "textarea"], textarea: ["text", "textarea"], email: ["email"], phone: ["phone"],
  number: ["number", "currency", "percent"], date: ["date"], checkbox: ["checkbox"],
  select: ["select", "radio"], radio: ["select", "radio"],
};
export const compatibleFormDestination = (inputType: string, customType: string) => (COMPATIBLE[inputType] ?? []).includes(customType);

export function normalizeMappedCustomValue(def: CustomContactDefinition, value: unknown): string | null {
  if (value == null || value === "") return null; // optional omission never clears an existing contact value
  const type = def.field_type;
  if (type === "checkbox") {
    if (value === true || value === "true" || value === "1" || value === 1) return "true";
    if (value === false || value === "false" || value === "0" || value === 0) return "false";
    throw new Error(`${def.name}: scegli sì o no.`);
  }
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${def.name}: formato non valido.`);
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > 20_000) throw new Error(`${def.name}: testo troppo lungo.`);
  if (["number", "currency", "percent"].includes(type)) {
    if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) throw new Error(`${def.name}: numero non valido.`);
    const n = Number(text.replace(",", "."));
    if (!Number.isFinite(n) || (type === "percent" && (n < 0 || n > 100))) throw new Error(`${def.name}: numero fuori intervallo.`);
    return String(n);
  }
  if (type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text)) throw new Error(`${def.name}: data non valida.`);
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error(`${def.name}: email non valida.`);
  if (["select", "radio"].includes(type) && !(def.options ?? []).includes(text)) throw new Error(`${def.name}: scelta non prevista.`);
  return text;
}

export function mappedCustomRows(companyId: string, fields: MappedFormField[], data: Record<string, unknown>, definitions: CustomContactDefinition[]) {
  const rows: Array<{ field_id: string; value: string }> = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (!field.mapping?.startsWith("cf:")) continue;
    const id = customDestinationId(field.mapping);
    const def = definitions.find(d => d.id.toLowerCase() === id);
    if (!id || !def || def.company_id !== companyId || def.object_type !== "contact" || def.deleted_at) throw new Error("Un campo di destinazione del modulo non è più disponibile. Contatta l’azienda.");
    if (seen.has(id)) throw new Error("Due domande del modulo scrivono nello stesso campo. Contatta l’azienda.");
    seen.add(id);
    if (!compatibleFormDestination(field.type ?? "text", def.field_type)) throw new Error(`${def.name}: tipo di destinazione non compatibile.`);
    const key = field.id || field.name || "";
    // Ignore inherited/prototype keys and request-supplied mapping instructions.
    const value = Object.hasOwn(data, key) ? data[key] : null;
    const normalized = normalizeMappedCustomValue(def, value);
    if (normalized !== null) rows.push({ field_id: id, value: normalized });
  }
  return rows;
}
