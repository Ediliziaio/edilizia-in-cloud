export const COLUMNS = [
  { key: "name", label: "Nome del Contatto", sortField: "first_name", fixed: true, group: "Contatto" },
  { key: "temperature", label: "Temp.", group: "Contatto" },
  { key: "phone", label: "Telefono", sortField: "phone", group: "Contatto" },
  { key: "email", label: "Email", sortField: "email", group: "Contatto" },
  { key: "company_name", label: "Azienda", sortField: "company_name", group: "Contatto" },
  { key: "city", label: "Città", group: "Contatto" },
  { key: "province", label: "Provincia", group: "Contatto" },
  { key: "address", label: "Indirizzo", group: "Contatto" },
  { key: "postal_code", label: "CAP", group: "Contatto" },
  { key: "country", label: "Paese", group: "Contatto" },
  { key: "contact_type", label: "Tipo contatto", group: "Contatto" },
  { key: "website", label: "Sito web", group: "Contatto" },
  { key: "notes_col", label: "Note", group: "Contatto" },
  { key: "source", label: "Fonte", group: "Contatto" },
  { key: "created_at", label: "Creato", sortField: "created_at", group: "Date" },
  { key: "last_activity_at", label: "Ultima Attività", sortField: "last_activity_at", group: "Date" },
  { key: "date_of_birth", label: "Data di nascita", group: "Date" },
  { key: "tags", label: "Tag", group: "Tag" },
  { key: "opp_name", label: "Opportunità", group: "Opportunità" },
  { key: "opp_value", label: "Valore opp.", group: "Opportunità" },
  { key: "opp_status", label: "Stato opp.", group: "Opportunità" },
  { key: "opp_pipeline", label: "Pipeline", group: "Opportunità" },
  { key: "opp_stage", label: "Fase pipeline", group: "Opportunità" },
  { key: "call_center", label: "Call Center", group: "Assegnazione" },
  { key: "attr_source", label: "Sorgente", group: "Attribuzione" },
  { key: "attr_campaign", label: "Campagna", group: "Attribuzione" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];

export const DEFAULT_VISIBLE: ColumnKey[] = ["name", "phone", "email", "company_name", "created_at", "last_activity_at", "tags"];
