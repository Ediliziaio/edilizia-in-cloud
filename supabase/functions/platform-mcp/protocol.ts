/** Pure protocol checks, shared by the server and offline regression tests. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validRpcMessage(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.jsonrpc === "2.0" && typeof value.method === "string"
    && value.method.length > 0 && (value.params === undefined || isRecord(value.params))
    && (value.method.startsWith("notifications/") ? !Object.hasOwn(value, "id") : Object.hasOwn(value, "id"))
    && (!Object.hasOwn(value, "id") || value.id === null || typeof value.id === "string"
      || (typeof value.id === "number" && Number.isFinite(value.id)));
}

export function argumentError(value: unknown, schema: Record<string, unknown>, path = "arguments"): string | null {
  const type = schema.type;
  if ((type === "object" && !isRecord(value)) || (type === "array" && !Array.isArray(value))
    || (type === "string" && typeof value !== "string") || (type === "boolean" && typeof value !== "boolean")
    || ((type === "number" || type === "integer") && (typeof value !== "number" || !Number.isFinite(value)
      || (type === "integer" && !Number.isInteger(value))))) return `${path}: tipo ${type} richiesto`;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return `${path}: valore non consentito`;
  if (typeof value === "number" && ((typeof schema.minimum === "number" && value < schema.minimum)
    || (typeof schema.maximum === "number" && value > schema.maximum))) return `${path}: valore fuori intervallo`;
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.trim().length < schema.minLength) return `${path}: testo vuoto`;
    if (schema.format === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return `${path}: UUID non valido`;
    if (schema.format === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return `${path}: data non valida`;
    if (schema.format === "date-time" && !Number.isFinite(Date.parse(value))) return `${path}: data/ora non valida`;
    if (schema.pattern && !new RegExp(String(schema.pattern)).test(value)) return `${path}: formato non valido`;
  }
  if (isRecord(value)) {
    const props = isRecord(schema.properties) ? schema.properties : {};
    for (const key of (Array.isArray(schema.required) ? schema.required : []) as string[]) {
      if (!Object.hasOwn(value, key)) return `${path}.${key}: obbligatorio`;
    }
    for (const [key, v] of Object.entries(value)) {
      if (schema.additionalProperties === false && !Object.hasOwn(props, key)) return `${path}.${key}: parametro sconosciuto`;
      if (isRecord(props[key])) { const error = argumentError(v, props[key], `${path}.${key}`); if (error) return error; }
    }
  }
  if (Array.isArray(value) && isRecord(schema.items)) {
    for (let i = 0; i < value.length; i++) { const error = argumentError(value[i], schema.items, `${path}[${i}]`); if (error) return error; }
  }
  return null;
}

export function domainError(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (value.ok === false || value.success === false || value.error) {
    const error = value.error;
    return typeof error === "string" ? error : isRecord(error) && typeof error.message === "string"
      ? error.message : typeof value.message === "string" ? value.message : "Operazione non riuscita";
  }
  return null;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Supabase verifies the signature; additionally bind issuer, expiry and audience. */
export function validOAuthClaims(claims: Record<string, unknown>, userId: string, issuer: string, audience: string): boolean {
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return claims.sub === userId && claims.iss === issuer && audiences.includes(audience)
    && typeof claims.exp === "number" && claims.exp > Date.now() / 1000
    && typeof claims.client_id === "string" && claims.client_id.length > 0;
}
