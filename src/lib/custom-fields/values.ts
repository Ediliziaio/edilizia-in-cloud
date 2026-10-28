export function multipleFieldValues(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.filter((v): v is string => typeof v === "string"))];
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed)) return multipleFieldValues(parsed); } catch { /* legacy scalar */ }
    return [value];
  }
  return [];
}

/** Text storage keeps booleans/arrays unambiguous and preserves false and zero. */
export function serializeFieldValue(value: unknown): string {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return JSON.stringify(multipleFieldValues(value));
  return String(value);
}

export function validateFieldValue(type: string, value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value);
  if (["number", "currency", "percent"].includes(type)) {
    const n = Number(text);
    if (!Number.isFinite(n)) return "Inserisci un numero valido.";
    if (type === "percent" && (n < 0 || n > 100)) return "La percentuale deve essere tra 0 e 100.";
  }
  if (type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text)) return "Inserisci una data valida.";
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "Inserisci un’email valida.";
  if (type === "url") { try { if (!["http:", "https:"].includes(new URL(text).protocol)) return "Usa un indirizzo http o https."; } catch { return "Inserisci un indirizzo web completo."; } }
  return null;
}
