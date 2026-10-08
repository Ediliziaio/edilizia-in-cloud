/** Validate the JSON-schema subset used by operational tools before approval/execution. */
export function validateToolArguments(schema: Record<string, unknown>, value: unknown, path = "dati", depth = 0): void {
  if (depth > 24) throw new Error(`${path}: struttura troppo complessa`);
  if (Object.hasOwn(schema, "const") && !Object.is(schema.const, value)) throw new Error(`${path}: valore richiesto non confermato`);
  const type = schema.type;
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: oggetto richiesto`);
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const key of (schema.required ?? []) as string[]) {
      if (record[key] == null || record[key] === "") throw new Error(`${path}: manca ${key}`);
    }
    for (const [key, field] of Object.entries(record)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error(`${path}: campo non previsto ${key}`);
      if (Object.hasOwn(properties, key)) validateToolArguments(properties[key], field, `${path}.${key}`, depth + 1);
      else if (schema.additionalProperties === false) throw new Error(`${path}: campo non previsto ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateToolArguments(schema.additionalProperties as Record<string, unknown>, field, `${path}.${key}`, depth + 1);
      }
    }
  } else if (type === "array") {
    if (!Array.isArray(value)) throw new Error(`${path}: elenco richiesto`);
    if (typeof schema.minItems === "number" && value.length < schema.minItems) throw new Error(`${path}: elenco incompleto`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) throw new Error(`${path}: elenco troppo lungo`);
    if (schema.items) for (const item of value) validateToolArguments(schema.items as Record<string, unknown>, item, path, depth + 1);
  } else if (type === "number" || type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (type === "integer" && !Number.isInteger(value))) throw new Error(`${path}: numero valido richiesto`);
    if (typeof schema.minimum === "number" && value < schema.minimum) throw new Error(`${path}: numero troppo basso`);
    if (typeof schema.maximum === "number" && value > schema.maximum) throw new Error(`${path}: numero troppo alto`);
  } else if (type === "string") {
    if (typeof value !== "string") throw new Error(`${path}: testo richiesto`);
    if (typeof schema.minLength === "number" && value.length < schema.minLength) throw new Error(`${path}: testo incompleto`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) throw new Error(`${path}: testo troppo lungo`);
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) throw new Error(`${path}: formato non valido`);
  }
  else if (type === "boolean" && typeof value !== "boolean") throw new Error(`${path}: valore sì/no richiesto`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new Error(`${path}: valore non previsto`);
}
