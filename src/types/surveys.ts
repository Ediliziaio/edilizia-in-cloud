// ============================================================================
// types/surveys.ts
// Tipi TypeScript per il modulo Sopralluoghi / Rilievi Tecnici
// Edilizia in Cloud — React 18 + TypeScript + Supabase
// ============================================================================

// ----------------------------------------------------------------------------
// FIELD TYPES — definizione di un campo all'interno di un template
// ----------------------------------------------------------------------------

export type FieldType =
  | 'text'              // input testo singola riga
  | 'textarea'          // testo multi-riga
  | 'number'            // numero
  | 'dimension'         // numero con unità di misura
  | 'select'            // scelta singola (radio o dropdown)
  | 'multiselect'       // scelta multipla (checkbox)
  | 'boolean'           // toggle sì/no
  | 'compound_boolean'  // boolean che, se true, mostra sotto-campi
  | 'date'              // data
  | 'color'             // RAL o HEX
  | 'currency';         // valore monetario in EUR

export type DimensionUnit =
  | 'cm' | 'mm' | 'm'   // lunghezza
  | 'mq' | 'ml'         // superficie / metri lineari
  | 'kw' | 'kwh'        // energia
  | 'kg' | 'l'          // massa / volume
  | 'gradi'             // gradi (inclinazione, azimut)
  | '°C';               // temperatura

export interface SelectOption {
  value: string;
  label: string;
  /** Etichetta tecnica per il preventivo automatico (opzionale) */
  estimate_code?: string;
  /** Icona o colore per UI (opzionale) */
  icon?: string;
}

export interface ConditionalRule {
  /** Mostra il campo solo se questa condizione è vera */
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'truthy' | 'falsy';
  value?: string | number | boolean | string[];
}

export interface FieldDefinition {
  /** Chiave univoca all'interno del suo scope (header / element type) */
  key: string;
  /** Etichetta visibile in italiano */
  label: string;
  /** Testo di aiuto sotto al campo */
  help?: string;
  /** Tipo di campo */
  type: FieldType;
  /** Obbligatorio per considerare l'elemento "completo" */
  required?: boolean;

  // --- Per type = number / dimension / currency ---
  unit?: DimensionUnit;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;

  // --- Per type = select / multiselect ---
  options?: SelectOption[];

  // --- Per type = compound_boolean ---
  /** Campi mostrati se il boolean è true */
  nested_fields?: FieldDefinition[];
  /** Etichetta del toggle (default: label) */
  toggle_label?: string;

  // --- Visibilità condizionata ---
  show_if?: ConditionalRule | ConditionalRule[];

  // --- Validazione ---
  pattern?: string;       // regex per text
  max_length?: number;

  // --- UI hints ---
  placeholder?: string;
  default_value?: unknown;
  /** Larghezza colonna in griglia 12-col Tailwind (es. 6 = mezza riga) */
  width?: 3 | 4 | 6 | 8 | 12;
}

export interface FieldSection {
  /** Chiave univoca della sezione */
  key: string;
  /** Titolo sezione mostrato come header */
  label: string;
  /** Descrizione opzionale */
  description?: string;
  /** Icona Lucide (es. 'home', 'window', 'settings') */
  icon?: string;
  /** Campi della sezione */
  fields: FieldDefinition[];
  /** Sezione collassabile (default: true) */
  collapsible?: boolean;
  /** Aperta di default */
  default_open?: boolean;
}

// ----------------------------------------------------------------------------
// PHOTO CHECKLIST — foto richieste per elemento o per sopralluogo
// ----------------------------------------------------------------------------

export interface PhotoChecklistItem {
  /** Chiave univoca (es. 'frontale_interna', 'cassonetto_aperto') */
  key: string;
  /** Etichetta visibile */
  label: string;
  /** Descrizione/istruzione per il tecnico */
  hint?: string;
  /** Foto obbligatoria per considerare l'elemento "completo" */
  required?: boolean;
  /** Permetti più di una foto per questa voce */
  multiple?: boolean;
}

// ----------------------------------------------------------------------------
// ELEMENT TYPE — tipologia di elemento rilevabile (infisso, sanitario, falda...)
// ----------------------------------------------------------------------------

export interface ElementTypeDefinition {
  /** Chiave univoca (usata in survey_elements.element_type) */
  key: string;
  /** Etichetta singolare */
  label: string;
  /** Etichetta plurale */
  label_plural: string;
  /** Icona Lucide */
  icon?: string;
  /** Descrizione/istruzione */
  description?: string;
  /** Sezioni di campi (gruppi logici) */
  sections: FieldSection[];
  /** Foto richieste per questo elemento */
  required_photos: PhotoChecklistItem[];
  /** Permetti quantità > 1 per elementi identici (default: true) */
  allow_quantity?: boolean;
  /** Categoria estimato per generazione preventivo automatico */
  estimate_category?: string;
}

// ----------------------------------------------------------------------------
// AREA DEFINITION — campi della singola area (stanza/falda/facciata)
// ----------------------------------------------------------------------------

export interface AreaDefinition {
  /** Etichetta singolare (es. "Stanza", "Falda", "Facciata") */
  label: string;
  /** Etichetta plurale (es. "Stanze", "Falde", "Facciate") */
  label_plural: string;
  /** Suggerimenti pre-compilati per il nome (es. ["Soggiorno", "Cucina", ...]) */
  name_suggestions?: string[];
  /** Campi propri dell'area (oltre al nome) */
  fields: FieldDefinition[];
  /** Foto richieste a livello di area */
  required_photos?: PhotoChecklistItem[];
}

// ----------------------------------------------------------------------------
// TEMPLATE SCHEMA — definizione completa di un template
// ----------------------------------------------------------------------------

export interface TemplateSchema {
  /** Versione schema (per migrazioni future) */
  version: 1;
  /** Definizione header sopralluogo (sezioni di campi) */
  header_schema: FieldSection[];
  /** Definizione area */
  area_definition: AreaDefinition;
  /** Tipologie di elementi disponibili */
  element_types: ElementTypeDefinition[];
  /** Foto richieste a livello di sopralluogo (panoramiche, ecc.) */
  general_required_photos: PhotoChecklistItem[];
  /** Mapping per generazione output (preventivo, ordine fornitore) */
  output_mapping?: {
    /** Per ogni element_type, come trasformarlo in voce di preventivo */
    estimate_lines?: Record<string, EstimateLineMapping>;
    /** Per ogni element_type, come trasformarlo in riga ordine fornitore */
    supplier_order_lines?: Record<string, SupplierOrderLineMapping>;
  };
}

export interface EstimateLineMapping {
  description_template: string;  // es. "Finestra {tipologia} {larghezza_foro}x{altezza_foro} cm"
  unit: string;                  // 'pz', 'mq', 'ml'
  quantity_field?: string;       // chiave campo per quantità (default: 'quantity')
}

export interface SupplierOrderLineMapping {
  product_code_field?: string;   // se l'azienda mappa i campi a codici prodotto
  description_template: string;
  unit: string;
}

// ----------------------------------------------------------------------------
// DB ROW TYPES — tipi che corrispondono alle tabelle Supabase
// ----------------------------------------------------------------------------

export type SurveyCategory =
  | 'infissi'
  | 'fotovoltaico'
  | 'ristrutturazione'
  | 'bagno'
  | 'cucina'
  | 'cappotto'
  | 'tetto'
  | 'impianti'
  | 'pavimentazioni'
  | 'porte_interne'
  | 'climatizzazione'
  | 'custom';

export type SurveyMode = 'structured' | 'express';

export type SurveyStatus =
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'reviewed'
  | 'signed'
  | 'converted'
  | 'archived'
  | 'cancelled';

export interface SurveyTemplateRow {
  id: string;
  company_id: string | null;
  category: SurveyCategory;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  area_label: string;
  area_label_plural: string;
  element_label: string;
  schema: TemplateSchema;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SurveyRow {
  id: string;
  company_id: string;
  template_id: string;
  client_id: string | null;
  technician_id: string | null;
  code: string;
  mode: SurveyMode;
  status: SurveyStatus;
  header_data: Record<string, unknown>;
  address: string | null;
  address_number: string | null;
  city: string | null;
  zip: string | null;
  province: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  general_audio_url: string | null;
  general_audio_transcription: string | null;
  client_signature_url: string | null;
  client_signature_name: string | null;
  client_signature_at: string | null;
  estimate_id: string | null;
  supplier_order_id: string | null;
  project_id: string | null;
  pdf_report_url: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  signed_at: string | null;
  duration_minutes: number | null;
  weather_conditions: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

export interface SurveyAreaRow {
  id: string;
  survey_id: string;
  name: string;
  position: number;
  area_data: Record<string, unknown>;
  notes: string | null;
  audio_url: string | null;
  audio_transcription: string | null;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface SurveyElementRow {
  id: string;
  survey_id: string;
  area_id: string;
  element_type: string;
  element_label: string | null;
  position: number;
  values: Record<string, unknown>;
  quantity: number;
  notes: string | null;
  audio_url: string | null;
  audio_transcription: string | null;
  is_complete: boolean;
  missing_required_fields: string[];
  created_at: string;
  updated_at: string;
}

export type SurveyMediaType =
  | 'photo'
  | 'annotated_photo'
  | 'sketch'
  | 'audio'
  | 'signature'
  | 'document';

export interface SurveyMediaRow {
  id: string;
  survey_id: string;
  area_id: string | null;
  element_id: string | null;
  type: SurveyMediaType;
  url: string;
  thumbnail_url: string | null;
  storage_path: string | null;
  checklist_key: string | null;
  checklist_label: string | null;
  annotations: Record<string, unknown> | null;
  duration_seconds: number | null;
  transcription: string | null;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  taken_at: string | null;
  taken_latitude: number | null;
  taken_longitude: number | null;
  position: number;
  created_at: string;
  created_by: string | null;
}
