/** Stable identities. Labels are presentation only, never filter or storage keys. */
export const CUSTOM_FIELD_OBJECTS = [
  ["contact", "Contatto"], ["opportunity", "Opportunità"], ["appointment", "Appuntamento"],
  ["order", "Ordine"], ["invoice", "Fattura"], ["quote", "Preventivo"], ["ticket", "Ticket"],
  ["task", "Task"], ["employee", "Dipendente"], ["candidato", "Candidato (Selezione)"],
  ["colloquio", "Colloquio Candidato"], ["warehouse", "Magazzino"], ["user", "Utente"],
  ["salesperson", "Venditore"], ["external_team", "Squadra Esterna"], ["supplier", "Fornitore"],
  ["ordini_variazione", "Ordine di Variazione"], ["giornale_lavori", "Giornale dei Lavori"],
  ["pos_document", "POS – Sicurezza"], ["duvri_document", "DUVRI – Sicurezza"],
  ["intervento", "Intervento / Assistenza"], ["rapportino", "Rapportino Intervento"],
  ["impianto", "Impianto Cliente"], ["contratto_manutenzione", "Contratto Manutenzione"],
  ["piano_manutenzione", "Piano Manutenzione"], ["subappaltatore", "Subappaltatore"],
  ["contratto_subappalto", "Contratto Subappalto"], ["sal_subappaltatore", "SAL Subappaltatore"],
  ["ordine_acquisto", "Ordine Acquisto (OdA)"], ["ddt_ricezione", "DDT Ricezione Merce"],
  ["costo_aziendale", "Costo Aziendale"], ["company", "Azienda / Profilo"],
  ["product", "Prodotto (Articolo)"], ["family", "Famiglia Prodotto"],
  ["tariffa", "Tariffa / Manodopera"], ["catalog_category", "Categoria Listino"],
] as const;

export const OBJECT_NAME_MAP: Record<string, string> = Object.fromEntries(CUSTOM_FIELD_OBJECTS);
export const GROUP_OPTIONS = [{ value: "all", label: "Tutto" }, ...CUSTOM_FIELD_OBJECTS.map(([value, label]) => ({ value, label }))];
export const RENDERED_OBJECT_TYPES = new Set<string>([
  "contact", "opportunity", "appointment", "task", "employee", "warehouse",
  "ordini_variazione", "giornale_lavori", "duvri_document", "quote", "order",
]);
export const isObjectRendered = (type: string) => RENDERED_OBJECT_TYPES.has(type);

export function customFieldCapabilities(type: string) {
  return {
    editor: type === "quote" ? "Testata interna dei preventivi salvati: classico e moduli nativi" : isObjectRendered(type) ? "Scheda del record" : "Da collegare alla scheda nativa",
    email: type === "contact" ? "Variabile contatto tramite ID stabile" : "Non disponibile automaticamente nei testi",
    automation: isObjectRendered(type) && type !== "quote" ? "Filtri per ID del campo nel contesto previsto dal flusso" : "Richiede un adattatore del contesto",
    pdf: "Solo con mappatura esplicita nel modello: non viene stampato automaticamente",
    ai: "Nessuna lettura automatica: serve un contesto autorizzato e confermato",
  };
}

export function fieldObjectType(field: { objectType?: string; uniqueKey: string }): string {
  return field.objectType ?? field.uniqueKey.match(/^\{\{\s*([a-z_]+)\./)?.[1] ?? "";
}

export function toSnakeCase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** The contact resolver already understands this identity across label changes. */
export function customFieldKey(field: { id: string; name: string; object_type: string }): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const key = field.object_type === "contact" && uuid.test(field.id)
    ? `custom_${field.id.replace(/-/g, "")}` : toSnakeCase(field.name);
  return `{{ ${field.object_type}.${key} }}`;
}
