/**
 * Sprint C — Catalogo Esteso
 * Template generator per l'import listini (Excel + CSV).
 *
 * Espone:
 *  - buildListinoTemplateWorkbook: ritorna un Workbook exceljs pronto per il download
 *  - downloadListinoTemplateXlsx: trigger diretto del download dal browser
 *  - buildListinoTemplateCsv: versione CSV (papaparse-compatible)
 *
 * Le colonne variabili (campi personalizzati) vengono accodate dopo quelle fisse.
 */
import Papa from "papaparse";
import type { CompanyCustomFieldDef, CatalogObjectType } from "@/hooks/useCompanyCustomFields";

/** Colonne fisse per ogni object_type */
export const FIXED_COLUMNS: Record<CatalogObjectType, { key: string; label: string; required?: boolean; hint?: string }[]> = {
  product: [
    { key: "code", label: "Codice", required: true, hint: "Univoco articolo" },
    { key: "name", label: "Descrizione", required: true },
    { key: "category", label: "Categoria" },
    { key: "family", label: "Famiglia" },
    { key: "supplier", label: "Fornitore" },
    { key: "unit", label: "UM", hint: "es. pz, kg, m" },
    { key: "base_price", label: "Prezzo Base" },
    { key: "list_price", label: "Prezzo Listino" },
    { key: "cost", label: "Costo" },
    { key: "margin_pct", label: "Margine %" },
    { key: "vat_rate", label: "IVA %" },
    { key: "barcode", label: "Barcode" },
    { key: "notes", label: "Note" },
  ],
  family: [
    { key: "name", label: "Nome Famiglia", required: true },
    { key: "code", label: "Codice" },
    { key: "parent", label: "Famiglia Padre" },
    { key: "supplier", label: "Fornitore" },
    { key: "default_margin_pct", label: "Margine Default %" },
    { key: "default_markup_pct", label: "Ricarico Default %" },
    { key: "description", label: "Descrizione" },
  ],
  tariffa: [
    { key: "nome", label: "Nome", required: true },
    { key: "codice", label: "Codice" },
    { key: "categoria", label: "Categoria" },
    { key: "qualifica", label: "Qualifica" },
    { key: "costo_orario", label: "Costo Orario" },
    { key: "prezzo_orario", label: "Prezzo Orario" },
    { key: "margine_pct", label: "Margine %" },
    { key: "ore_giornaliere", label: "Ore/Giorno" },
    { key: "ccnl", label: "CCNL" },
    { key: "valida_dal", label: "Valida Dal (AAAA-MM-GG)" },
    { key: "valida_al", label: "Valida Al (AAAA-MM-GG)" },
  ],
};

export interface BuildTemplateOpts {
  objectType: CatalogObjectType;
  customFields?: CompanyCustomFieldDef[];
  /** Eventuali righe esempio */
  sampleRows?: Record<string, unknown>[];
}

const TYPE_HINT: Record<string, string> = {
  text: "(testo)",
  number: "(numero)",
  date: "(data AAAA-MM-GG)",
  select: "(select)",
};

/** Costruisce un Workbook exceljs con foglio principale + foglio istruzioni. */
export async function buildListinoTemplateWorkbook(opts: BuildTemplateOpts) {
  const ExcelJS = (await import("exceljs")).default;
  const { objectType, customFields = [], sampleRows = [] } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Edilizia in Cloud";
  wb.created = new Date();

  const fixed = FIXED_COLUMNS[objectType];
  const headers = [
    ...fixed.map((c) => c.label + (c.required ? " *" : "")),
    ...customFields.map((f) => `${f.name} ${TYPE_HINT[f.field_type] ?? ""}`.trim()),
  ];
  const keys = [
    ...fixed.map((c) => c.key),
    ...customFields.map((f) => `cf:${f.id}`),
  ];

  // Sheet 1 — Dati
  const sheet = wb.addWorksheet("Dati", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E7FF" },
  };

  // Auto-width basato sul header
  sheet.columns = headers.map((h) => ({
    header: h,
    width: Math.max(14, Math.min(40, h.length + 4)),
  }));

  // Sample rows
  for (const row of sampleRows) {
    sheet.addRow(keys.map((k) => row[k] ?? ""));
  }

  // Sheet 2 — Istruzioni
  const help = wb.addWorksheet("Istruzioni");
  help.addRow(["Istruzioni per la compilazione"]).font = { bold: true, size: 14 };
  help.addRow([]);
  help.addRow(["Colonna", "Obbligatoria", "Note"]).font = { bold: true };
  for (const c of fixed) {
    help.addRow([c.label, c.required ? "SÌ" : "NO", c.hint ?? ""]);
  }
  for (const f of customFields) {
    help.addRow([
      f.name,
      "NO",
      `${TYPE_HINT[f.field_type] ?? ""}${f.field_type === "select" && f.options?.length ? ` — valori ammessi: ${f.options.join(", ")}` : ""}`,
    ]);
  }
  help.getColumn(1).width = 30;
  help.getColumn(2).width = 14;
  help.getColumn(3).width = 60;

  return wb;
}

/** Download xlsx nel browser. */
export async function downloadListinoTemplateXlsx(opts: BuildTemplateOpts, filename?: string): Promise<void> {
  const wb = await buildListinoTemplateWorkbook(opts);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `listino-template-${opts.objectType}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Versione CSV (papaparse). */
export function buildListinoTemplateCsv(opts: BuildTemplateOpts): string {
  const { objectType, customFields = [], sampleRows = [] } = opts;
  const fixed = FIXED_COLUMNS[objectType];
  const headers = [
    ...fixed.map((c) => c.label + (c.required ? " *" : "")),
    ...customFields.map((f) => `${f.name} ${TYPE_HINT[f.field_type] ?? ""}`.trim()),
  ];
  const keys = [
    ...fixed.map((c) => c.key),
    ...customFields.map((f) => `cf:${f.id}`),
  ];
  const rows = sampleRows.map((r) => keys.map((k) => r[k] ?? ""));
  return Papa.unparse({ fields: headers, data: rows });
}

/** Download CSV nel browser. */
export function downloadListinoTemplateCsv(opts: BuildTemplateOpts, filename?: string): void {
  const csv = buildListinoTemplateCsv(opts);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `listino-template-${opts.objectType}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
