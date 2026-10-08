export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function quoteDraftIssue(args: Record<string, unknown>): string | null {
  if (typeof args.client_name !== "string" || args.client_name.trim().length < 2 || args.client_name.length > 200) return "Indica il nome completo del cliente (2–200 caratteri).";
  if (!Array.isArray(args.items) || args.items.length < 1 || args.items.length > 200) return "Inserisci da 1 a 200 voci verificate per creare il preventivo.";
  if (args.validity_days != null && (!Number.isInteger(args.validity_days) || Number(args.validity_days) < 1 || Number(args.validity_days) > 3650)) return "Verifica i giorni di validità del preventivo (1–3650).";
  for (const [index, raw] of args.items.entries()) {
    const prefix = `Voce ${index + 1}: `;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return prefix + "dati non validi.";
    const item = raw as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name.trim()) return prefix + "manca la descrizione.";
    if (typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity <= 0) return prefix + "indica una quantità positiva, senza dedurla automaticamente.";
    if (typeof item.unit_price !== "number" || !Number.isFinite(item.unit_price) || item.unit_price < 0) return prefix + "manca un prezzo verificato. Consulta il listino e conferma la scelta; zero solo per una voce gratuita.";
    const vat = item.vat_rate ?? args.default_vat_rate;
    if (typeof vat !== "number" || !Number.isFinite(vat) || vat < 0 || vat > 100) return prefix + "indica l'aliquota IVA verificata, anche zero. Non la deduco dal tipo di lavoro.";
    if (item.item_type != null && !["material", "labor", "subcontract", "service", "other"].includes(String(item.item_type))) return prefix + "tipo di voce non valido.";
    if (item.unit_of_measure != null && (typeof item.unit_of_measure !== "string" || !item.unit_of_measure.trim() || item.unit_of_measure.length > 20)) return prefix + "unità di misura non valida.";
  }
  return null;
}

export function legacyQuoteDraftInput(args: Record<string, unknown>): Record<string, unknown> {
  const lines = Array.isArray(args.righe) ? args.righe : [];
  return { client_name: args.cliente_nome, client_email: args.cliente_email,
    client_phone: args.cliente_telefono, client_address: args.cliente_indirizzo,
    title: args.titolo, description: args.note, default_vat_rate: args.iva,
    items: lines.map(raw => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const r = raw as Record<string, unknown>;
      return { name: r.descrizione, description: r.descrizione, quantity: r.quantita,
        unit_price: r.prezzo_unitario, unit_of_measure: r.unita,
        item_type: r.tipo === "product" || r.tipo == null ? "material" : r.tipo };
    }) };
}

/** Ordinary and overtime hours are separate, never rounded or clamped silently. */
export function workHoursIssue(ordinary: unknown, overtime: unknown, maxOrdinary = 16): string | null {
  if (ordinary != null && (typeof ordinary !== "number" || !Number.isFinite(ordinary) || ordinary < 0 || ordinary > maxOrdinary)) return `Ore ordinarie non valide (0–${maxOrdinary}).`;
  if (overtime != null && (typeof overtime !== "number" || !Number.isFinite(overtime) || overtime < 0 || overtime > 8)) return "Straordinario non valido (0–8 ore).";
  if (Number(ordinary ?? 0) + Number(overtime ?? 0) > 24) return "Il totale di ore ordinarie e straordinarie non può superare 24 ore al giorno.";
  return null;
}

export function rapportinoContentIssue(args: { data_lavoro?: unknown; attivita?: unknown; materiali_usati?: unknown; note?: unknown }): string | null {
  if (args.data_lavoro != null && !isCalendarDate(args.data_lavoro)) return "Data lavoro non valida: usa una data reale YYYY-MM-DD.";
  if (args.attivita != null && (!Array.isArray(args.attivita) || args.attivita.length > 100 || args.attivita.some(v => typeof v !== "string" || !v.trim() || v.length > 1000))) return "Descrivi le attività senza righe vuote (massimo 100).";
  if (args.materiali_usati != null) {
    if (!Array.isArray(args.materiali_usati) || args.materiali_usati.length > 100) return "Elenco materiali non valido (massimo 100).";
    for (const raw of args.materiali_usati) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Materiale non valido.";
      const material = raw as Record<string, unknown>;
      if (typeof material.descrizione !== "string" || !material.descrizione.trim()) return "Indica la descrizione di ogni materiale.";
      if (material.quantita != null && (typeof material.quantita !== "number" || !Number.isFinite(material.quantita) || material.quantita <= 0)) return "La quantità del materiale deve essere positiva.";
      if (material.unita_misura != null && (typeof material.unita_misura !== "string" || !material.unita_misura.trim())) return "Indica l'unità di misura del materiale.";
    }
  }
  if (args.note != null && (typeof args.note !== "string" || args.note.length > 5000)) return "Nota non valida (massimo 5000 caratteri).";
  return null;
}
