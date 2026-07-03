/**
 * CustomersList — constants
 * Estratto da CustomersList.tsx (MP-CAN-001 Fase 2).
 */
import type { CustomerImportField } from "@/components/clients/CustomerImportDialog";

export const PAGE_SIZES = [25, 50, 100, 200];

export const CUSTOMER_IMPORT_FIELDS: CustomerImportField[] = [
  // Per i clienti persona: first_name + last_name obbligatori.
  // Per i clienti azienda: business_name obbligatorio (ma CSV non può sapere a priori
  // il tipo, quindi mappiamo entrambi come opzionali e validiamo a valle: se
  // business_name è valorizzato → cliente azienda; altrimenti first+last obbligatori).
  { key: "business_name", label: "Ragione Sociale", required: false },
  { key: "first_name", label: "Nome", required: false },
  { key: "last_name", label: "Cognome", required: false },
  { key: "email", label: "Email", required: true, type: "email" },
  { key: "phone", label: "Telefono", required: false, type: "phone" },
  { key: "fiscal_code", label: "Codice Fiscale / P.IVA", required: false, type: "fiscal_code" },
  { key: "address", label: "Indirizzo (via + civico)", required: false },
  { key: "postal_code", label: "CAP", required: false },
  { key: "city", label: "Città", required: false },
  { key: "province", label: "Provincia (sigla)", required: false },
  { key: "site_address", label: "Indirizzo Cantiere", required: false },
  { key: "site_postal_code", label: "CAP Cantiere", required: false },
  { key: "site_city", label: "Città Cantiere", required: false },
  { key: "site_province", label: "Provincia Cantiere", required: false },
  { key: "notes", label: "Note", required: false },
];

/* ─── Column visibility ─────────────────────────────────────────── */
export const ALL_COLUMNS = [
  { key: "avatar", label: "Avatar", defaultVisible: true, required: true },
  { key: "name", label: "Nome", defaultVisible: true, required: true },
  { key: "health", label: "Salute", defaultVisible: true },
  { key: "email", label: "Email", defaultVisible: true },
  { key: "phone", label: "Telefono", defaultVisible: true },
  { key: "fiscal_code", label: "CF / P.IVA", defaultVisible: false },
  { key: "address", label: "Indirizzo", defaultVisible: false },
  { key: "site_address", label: "Cantiere", defaultVisible: false },
  { key: "notes", label: "Note", defaultVisible: false },
  { key: "created_at", label: "Data inserimento", defaultVisible: true },
  { key: "salesperson", label: "Venditore", defaultVisible: true },
  { key: "orders", label: "Ordini", defaultVisible: true },
  { key: "portal", label: "Portale", defaultVisible: false },
  { key: "actions", label: "Azioni", defaultVisible: true, required: true },
] as const;

export type ColumnKey = typeof ALL_COLUMNS[number]["key"];

export const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = ALL_COLUMNS.reduce(
  (acc, c) => {
    acc[c.key as ColumnKey] = c.defaultVisible;
    return acc;
  },
  {} as Record<ColumnKey, boolean>,
);

export const COLUMN_STORAGE_KEY = "customers-list-columns-v1";
export const INTERNAL_NO_EMAIL_DOMAIN = "@no-email.ediliziaincloud.local";
