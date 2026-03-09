/**
 * Utility per esportazione CSV/XLSX con supporto UTF-8 BOM e separatore punto e virgola.
 */
import * as XLSX from "xlsx";

export interface CsvColumn {
  key: string;
  label: string;
}

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV(
  rows: Record<string, string>[],
  columns: CsvColumn[],
  filename: string
) {
  const header = columns.map((c) => escapeCSV(c.label)).join(";");
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCSV(row[c.key])).join(";")
  );
  const csv = [header, ...dataLines].join("\r\n");

  // BOM UTF-8 for Excel compatibility
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToXLSX(
  rows: Record<string, string>[],
  columns: CsvColumn[],
  filename: string
) {
  const headerRow = columns.map((c) => c.label);
  const dataRows = rows.map((row) => columns.map((c) => row[c.key] || ""));
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);

  // Auto-width columns
  ws["!cols"] = columns.map((_, i) => {
    const maxLen = Math.max(
      headerRow[i].length,
      ...dataRows.map((r) => (r[i] || "").length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contatti");
  XLSX.writeFile(wb, filename);
}
