/**
 * Helpers per l'export Excel dei prospetti del Controllo di Gestione.
 *
 * Uso ExcelJS (già installato per altri import) — generazione lazy import
 * per non gonfiare il bundle iniziale.
 */
import { neutralizeXlsxCell } from "@/lib/csvExport";

export interface ExportColumn<T> {
  header: string;
  key: keyof T | string;
  width?: number;
  /** "number" → tabular numeric format con €, "percent" → %, default text */
  type?: "text" | "number" | "percent";
  /** Custom value extractor (overrides key). */
  getValue?: (row: T) => string | number | null;
}

export interface ExportSheet<T> {
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Optional preheader rows — array of strings, one per row */
  preheader?: string[][];
  /** Conditional row formatter: returns row index style class (e.g. "subtot", "total") */
  rowStyle?: (row: T) => "subtot" | "total" | "normal" | "header";
}

interface ExportXlsxOptions {
  filename: string;          // es. "ce_riclassificato_2026.xlsx"
  sheets: ExportSheet<unknown>[];
  /** Documento intestato per CFO/banca */
  brand?: {
    company_name?: string;
    title?: string;            // "Conto Economico Riclassificato"
    subtitle?: string;         // "Esercizio 2026"
  };
}

/** Genera un file Excel e lo scarica nel browser. */
export async function exportXlsx(opts: ExportXlsxOptions): Promise<void> {
  // Lazy import per non gonfiare il bundle iniziale
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Edilizia In Cloud";
  wb.created = new Date();
  wb.title = opts.brand?.title ?? "Controllo di Gestione";

  for (const sheet of opts.sheets) {
    const ws = wb.addWorksheet(sheet.name);

    // Brand header
    let rowIdx = 1;
    if (opts.brand) {
      if (opts.brand.company_name) {
        const r = ws.getRow(rowIdx++);
        r.getCell(1).value = opts.brand.company_name;
        r.getCell(1).font = { size: 14, bold: true, color: { argb: "FF1f2937" } };
        ws.mergeCells(rowIdx - 1, 1, rowIdx - 1, sheet.columns.length);
      }
      if (opts.brand.title) {
        const r = ws.getRow(rowIdx++);
        r.getCell(1).value = opts.brand.title;
        r.getCell(1).font = { size: 12, bold: true };
        ws.mergeCells(rowIdx - 1, 1, rowIdx - 1, sheet.columns.length);
      }
      if (opts.brand.subtitle) {
        const r = ws.getRow(rowIdx++);
        r.getCell(1).value = opts.brand.subtitle;
        r.getCell(1).font = { size: 10, italic: true, color: { argb: "FF6b7280" } };
        ws.mergeCells(rowIdx - 1, 1, rowIdx - 1, sheet.columns.length);
      }
      rowIdx++; // empty separator row
    }

    // Preheader rows (if any)
    if (sheet.preheader) {
      for (const ph of sheet.preheader) {
        const r = ws.getRow(rowIdx++);
        ph.forEach((v, i) => {
          r.getCell(i + 1).value = neutralizeXlsxCell(v);
          r.getCell(i + 1).font = { italic: true, color: { argb: "FF6b7280" } };
        });
      }
      rowIdx++; // separator
    }

    // Column headers
    const headerRow = ws.getRow(rowIdx++);
    sheet.columns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFffffff" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1f2937" } };
      cell.alignment = { horizontal: c.type === "number" || c.type === "percent" ? "right" : "left" };
      if (c.width) ws.getColumn(i + 1).width = c.width;
    });

    // Data rows
    for (const row of sheet.rows) {
      const r = ws.getRow(rowIdx++);
      const style = sheet.rowStyle?.(row) ?? "normal";

      sheet.columns.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value = c.getValue ? c.getValue(row) : (row as any)[c.key];

        if (c.type === "number") {
          cell.value = value === null || value === undefined ? null : Number(value);
          cell.numFmt = '#,##0.00 "€"';
          cell.alignment = { horizontal: "right" };
        } else if (c.type === "percent") {
          cell.value = value === null || value === undefined ? null : Number(value) / 100;
          cell.numFmt = "0.0%";
          cell.alignment = { horizontal: "right" };
        } else {
          cell.value = neutralizeXlsxCell(value) as string | number | null;
        }

        // Style per riga subtot/total
        if (style === "subtot") {
          cell.font = { bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFf3f4f6" } };
        } else if (style === "total") {
          cell.font = { bold: true, size: 11 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFdbeafe" } };
        }
      });
    }

    // Footer
    rowIdx++;
    const footer = ws.getRow(rowIdx++);
    footer.getCell(1).value = `Generato il ${new Date().toLocaleString("it-IT")} · Edilizia In Cloud`;
    footer.getCell(1).font = { italic: true, size: 9, color: { argb: "FF9ca3af" } };
    ws.mergeCells(rowIdx - 1, 1, rowIdx - 1, sheet.columns.length);
  }

  // Genera buffer e scarica
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
