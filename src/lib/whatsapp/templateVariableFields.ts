// Catalogo campi per le variabili dei template WhatsApp.
//
// I template WhatsApp usano variabili POSIZIONALI ({{1}}, {{2}}, …). In EiC, alla
// creazione del template, ogni posizione può essere MAPPATA a un campo del
// contatto (Nome, Telefono, …) o a un campo personalizzato dell'azienda.
// La mappa (posizione → chiave campo) è salvata in wa_meta_templates.variable_mapping
// e usata al momento dell'invio per auto-compilare i valori dal contatto.
//
// Chiavi:
//  - campi standard: "nome", "cognome", "nome_completo", "telefono", …
//  - campi personalizzati: "cf:<id>"  (id = marketing_custom_fields.id)
//  - testo fisso (nessuna mappatura): la posizione NON è presente in variable_mapping.

export interface TemplateFieldOption {
  key: string;
  label: string;
  group: string;
  /** Valore di esempio inviato a Meta per l'approvazione. */
  sample: string;
}

/** Campi standard del contatto, con esempio per l'approvazione Meta. */
export const STANDARD_TEMPLATE_FIELDS: TemplateFieldOption[] = [
  { key: "nome", label: "Nome", group: "Contatto", sample: "Mario" },
  { key: "cognome", label: "Cognome", group: "Contatto", sample: "Rossi" },
  { key: "nome_completo", label: "Nome completo", group: "Contatto", sample: "Mario Rossi" },
  { key: "telefono", label: "Telefono", group: "Contatto", sample: "+39 333 1234567" },
  { key: "email", label: "Email", group: "Contatto", sample: "mario.rossi@email.it" },
  { key: "azienda", label: "Azienda", group: "Contatto", sample: "Edilizia Rossi Srl" },
  { key: "citta", label: "Città", group: "Indirizzo", sample: "Milano" },
  { key: "provincia", label: "Provincia", group: "Indirizzo", sample: "MI" },
  { key: "indirizzo", label: "Indirizzo", group: "Indirizzo", sample: "Via Roma 1" },
  { key: "cap", label: "CAP", group: "Indirizzo", sample: "20100" },
];

const STANDARD_BY_KEY = new Map(STANDARD_TEMPLATE_FIELDS.map((f) => [f.key, f]));

export interface CustomFieldLike {
  id: string;
  name: string;
}

/** Costruisce l'elenco completo (standard + personalizzati) per il picker. */
export function buildTemplateFieldOptions(customFields: CustomFieldLike[] = []): TemplateFieldOption[] {
  const cf = customFields.map<TemplateFieldOption>((f) => ({
    key: `cf:${f.id}`,
    label: f.name,
    group: "Campi personalizzati",
    sample: f.name,
  }));
  return [...STANDARD_TEMPLATE_FIELDS, ...cf];
}

/** Valore di esempio per Meta a partire dalla chiave campo. */
export function fieldSample(key: string, customFields: CustomFieldLike[] = []): string {
  if (key.startsWith("cf:")) {
    const id = key.slice(3);
    return customFields.find((f) => f.id === id)?.name ?? "Esempio";
  }
  return STANDARD_BY_KEY.get(key)?.sample ?? "Esempio";
}
