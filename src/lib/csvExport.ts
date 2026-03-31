/**
 * Utility per esportazione CSV/XLSX con supporto UTF-8 BOM e separatore punto e virgola.
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
  downloadFile(csv, filename, "text/csv");
}

/** Download a string as a file with BOM for Excel compatibility */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(["\ufeff" + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportToXLSX(
  rows: Record<string, string>[],
  columns: CsvColumn[],
  filename: string
) {
  const ExcelJS = (await import("exceljs")).default;
  const headerRow = columns.map((c) => c.label);
  const dataRows = rows.map((row) => columns.map((c) => row[c.key] || ""));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contatti");

  ws.columns = columns.map((c, i) => {
    const maxLen = Math.max(
      headerRow[i].length,
      ...dataRows.map((r) => (r[i] || "").length)
    );
    return { header: c.label, key: c.key, width: Math.min(maxLen + 2, 50) };
  });

  dataRows.forEach((row) => {
    const rowObj: Record<string, string> = {};
    columns.forEach((c, i) => { rowObj[c.key] = row[i]; });
    ws.addRow(rowObj);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
