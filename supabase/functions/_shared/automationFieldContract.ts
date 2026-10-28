/** Shared editor/worker contract. Never infer a field's entity from a commercial category. */
export const AUTOMATION_NATIVE_FIELDS: Record<string, string[]> = {
  contacts: [
    "first_name",
    "last_name",
    "phone",
    "email",
    "city",
    "province",
    "region",
    "address",
    "postal_code",
    "company_name",
    "notes",
    "source",
  ],
  opportunities: ["name", "notes", "value"],
  tickets: ["subject", "description", "priority"],
  tasks: ["title", "notes", "priority", "due_date"],
  orders: ["description", "internal_notes"],
  invoices: ["notes"],
};
export const AUTOMATION_ENTITY_TYPES: Record<string, string> = {
  contacts: "contact",
  opportunities: "opportunity",
  tickets: "ticket",
  tasks: "task",
  orders: "order",
  invoices: "invoice",
  appointments: "appointment",
  employees: "employee",
  warehouse_stock: "warehouse",
  quotes: "quote",
  ordini_variazione: "ordini_variazione",
  giornale_lavori: "giornale_lavori",
  duvri_documents: "duvri_document",
};
export const customObjectType = (type: string) =>
  type.startsWith("quote_") ? "quote" : type === "stock" ? "warehouse" : type;
export const AUTOMATION_CUSTOM_OBJECTS = new Set([
  "contact",
  "opportunity",
  "appointment",
  "task",
  "employee",
  "warehouse",
  "order",
  "quote",
  "ordini_variazione",
  "giornale_lavori",
  "duvri_document",
]);
export const customFieldId = (field: unknown): string | null => {
  if (typeof field !== "string") return null;
  const match = field.match(
    /^(?:cf:|custom_field\.)([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i,
  );
  return match?.[1].toLowerCase() ?? null;
};
export const customFilterType = (
  type: string,
): "number" | "date" | "boolean" | "select" | "tags" | "text" =>
  ["number", "currency", "percent"].includes(type)
    ? "number"
    : type === "date"
    ? "date"
    : ["boolean", "checkbox"].includes(type)
    ? "boolean"
    : ["select", "radio", "dropdown"].includes(type)
    ? "select"
    : ["multiselect", "multi_select", "tags"].includes(type)
    ? "tags"
    : "text";

export const CUSTOM_TRIGGER_OBJECTS: Record<string, string | null> = {
  contact: "contact",
  opportunity: "opportunity",
  appointment: "appointment",
  order: "order",
  invoice: "invoice",
  quote: "quote",
  ticket: "ticket",
  task: "task",
  employee: "employee",
  warehouse: "warehouse",
  construction: "order",
  maintenance: "contratto_manutenzione",
  ordini_variazione: "ordini_variazione",
  giornale_lavori: "giornale_lavori",
  duvri_document: "duvri_document",
};
