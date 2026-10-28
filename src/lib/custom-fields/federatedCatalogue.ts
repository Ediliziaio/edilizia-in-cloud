import { campiContratto } from "../../../supabase/functions/_shared/campiContratto";
import { RECRUITMENT_FIELDS } from "./hrCatalogue";

export const CATALOGUE_SOURCES = [
  { id: "catalogue", label: "Schede tecniche", href: "/azienda/impostazioni/listino" },
  { id: "documents", label: "Modelli documentali", href: "/azienda/firma-elettronica" },
  { id: "surveys", label: "Sopralluoghi", href: "/azienda/impostazioni/sopralluoghi" },
  { id: "contracts", label: "Contratti dei preventivi", href: "/azienda/impostazioni/template-preventivi" },
  { id: "forms", label: "Moduli di contatto", href: "/azienda/impostazioni/form-builder" },
  { id: "recruitment", label: "Moduli candidature (HR)", href: "/azienda/personale?tab=candidati" },
] as const;
export type CatalogueSource = typeof CATALOGUE_SOURCES[number]["id"];
export interface CatalogueField {
  id: string;
  source: CatalogueSource;
  scope: string;
  scopeId: string;
  name: string;
  key: string;
  type: string;
  required: boolean;
  unit?: string;
  path?: string;
  mapping?: string;
  pdf?: boolean;
  visibility?: string;
}
export interface CatalogueScope { id: string; name: string; count: number }
export interface CatalogueDataset { fields: CatalogueField[]; scopes: CatalogueScope[] }
export type DefinitionRow = Record<string, unknown>;
const obj = (v: unknown): DefinitionRow => v && typeof v === "object" && !Array.isArray(v) ? v as DefinitionRow : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const related = (v: unknown) => obj(Array.isArray(v) ? v[0] : v);

/** Definitions only. Never inspect customer answers, defaults, attachments or original files. */
export function catalogueFields(source: CatalogueSource, rows: DefinitionRow[]): CatalogueField[] {
  const result: CatalogueField[] = [];
  const add = (row: CatalogueField) => {
    if (result.length >= 20_000) throw new Error("Troppi campi in questa origine. Restringi i modelli prima di riprovare.");
    result.push(row);
  };
  for (const row of rows) {
    const id = str(row.id);
    if (!id) continue;
    if (source === "catalogue") {
      const macro = related(row.listino_macrocategorie);
      add({ id: `catalogue:${id}`, source, scope: str(macro.nome) || "Scheda tecnica", scopeId: str(row.macrocategoria_id),
        name: str(row.field_label) || str(row.field_key), key: str(row.field_key), type: str(row.field_type),
        required: row.required === true, unit: str(row.field_unit), pdf: row.show_in_pdf === true });
    } else if (source === "documents") {
      const template = related(row.documento_templates);
      add({ id: `documents:${id}`, source, scope: str(template.nome) || "Modello documento", scopeId: str(row.template_id),
        name: str(row.etichetta) || str(row.nome), key: str(row.segnaposto) || str(row.nome), type: str(row.tipo),
        required: row.obbligatorio === true, pdf: true });
    } else if (source === "contracts") {
      for (const field of campiContratto(str(row.contractual_terms_text), str(row.legal_terms_text))) {
        add({ id: `contracts:${id}:${field.nome}`, source, scope: str(row.name) || "Modello preventivo", scopeId: id,
          name: field.etichetta, key: `{{ contratto.${field.nome} }}`, type: field.tipo, required: true, pdf: true });
      }
    } else if (source === "forms") {
      for (const [index, raw] of (Array.isArray(row.fields) ? row.fields : []).entries()) {
        const field = obj(raw);
        if (["heading", "paragraph", "divider", "html", "button", "submit"].includes(str(field.type))) continue;
        const key = str(field.id) || str(field.name);
        if (!key) continue;
        add({ id: `forms:${id}:${index}:${key}`, source, scope: str(row.name) || "Modulo contatto", scopeId: id,
          name: str(field.label) || str(field.name) || key, key, type: str(field.type), required: field.required === true,
          mapping: str(field.mapping) });
      }
    } else if (source === "recruitment") {
      const config = obj(row.campi);
      for (const native of RECRUITMENT_FIELDS) {
        const configured = config[native.key];
        const state = native.key === "nome" ? "obbligatorio" : ["obbligatorio", "facoltativo", "nascosto"].includes(str(configured)) ? str(configured) : native.state;
        add({ id: `recruitment:${id}:${native.key}`, source, scope: str(row.titolo) || "Modulo candidature", scopeId: id,
          key: native.key, name: native.label, type: native.type, required: state === "obbligatorio", visibility: state });
      }
    } else {
      const walk = (node: unknown, path: string, depth: number) => {
        if (depth > 18) throw new Error("Il modello contiene troppi livelli: verifica la sua struttura.");
        if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1)); return; }
        const field = obj(node);
        if (typeof field.key === "string" && typeof field.type === "string" && typeof field.label === "string") {
          add({ id: `surveys:${id}:${path}`, source, scope: str(row.name) || "Modello sopralluogo", scopeId: id,
            name: field.label, key: field.key, path, type: field.type, unit: str(field.unit), required: field.required === true });
        }
        // Only schema containers; not options, sample values, mappings or answers.
        for (const key of ["header_schema", "area_definition", "element_types", "sections", "fields", "nested_fields"]) {
          if (field[key] != null) walk(field[key], path ? `${path}.${key}` : key, depth + 1);
        }
      };
      walk(row.schema, "", 0);
    }
  }
  return result;
}

export function catalogueScopes(source: CatalogueSource, rows: DefinitionRow[], fields: CatalogueField[]): CatalogueScope[] {
  const scopes = new Map<string, CatalogueScope>();
  // These sources are model rows, including models without configurable fields.
  if (["surveys", "contracts", "forms", "recruitment"].includes(source)) for (const row of rows) {
    const id = str(row.id);
    if (id) scopes.set(id, { id, name: str(row.name) || str(row.titolo) || "Modello senza nome", count: 0 });
  }
  for (const field of fields) {
    const scope = scopes.get(field.scopeId) ?? { id: field.scopeId, name: field.scope, count: 0 };
    scope.count++; scopes.set(field.scopeId, scope);
  }
  return [...scopes.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
}

const TYPE_LABELS: Record<string, string> = { text: "Testo", testo: "Testo", textarea: "Testo lungo", number: "Numero", numero: "Numero", currency: "Importo", valuta: "Importo", percent: "Percentuale", date: "Data", data: "Data", time: "Ora", email: "Email", phone: "Telefono", telefono: "Telefono", url: "Indirizzo web", file: "Allegato", select: "Scelta singola", scelta: "Scelta singola", radio: "Scelta singola", multiselect: "Scelta multipla", checkbox: "Sì / No", boolean: "Sì / No", consent: "Consenso", hidden: "Dato nascosto", dimension: "Misura" };
export const catalogueTypeLabel = (type: string) => TYPE_LABELS[type] ?? type;

export async function readDefinitionPages(
  read: (from: number, to: number) => Promise<DefinitionRow[]>,
  signal?: AbortSignal,
): Promise<DefinitionRow[]> {
  const rows: DefinitionRow[] = [];
  const pageSize = 200;
  for (let page = 0; page < 50; page++) {
    signal?.throwIfAborted();
    const batch = await read(page * pageSize, (page + 1) * pageSize - 1);
    signal?.throwIfAborted();
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error("Questa origine supera 10.000 definizioni: l’elenco non viene mostrato incompleto.");
}
