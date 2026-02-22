/**
 * Utility per esportazione CSV con supporto UTF-8 BOM e separatore punto e virgola.
 */

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
