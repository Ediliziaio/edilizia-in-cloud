/**
 * Il cronoprogramma in Excel (31/10/2026): le stesse righe della tabella a video,
 * con le fasi in grassetto e le sottofasi rientrate. Costi e venduto solo se chi
 * esporta li vede. exceljs si carica solo quando serve.
 */
import type { RigaTabella } from "./tabellaCronoprogramma";

export async function esportaCronoprogrammaExcel(righe: ReadonlyArray<RigaTabella>, titolo: string, vedi: { costi: boolean; venduto: boolean }): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cronoprogramma");
  const colonne: Array<{ header: string; key: keyof RigaTabella | "inizioData" | "fineData"; width: number }> = [
    { header: "N.", key: "numero", width: 7 },
    { header: "Attività", key: "nome", width: 46 },
    { header: "Inizio", key: "inizioData", width: 12 },
    { header: "Fine", key: "fineData", width: 12 },
    { header: "GG previsti", key: "giorni", width: 11 },
    { header: "Persone", key: "risorse", width: 9 },
    { header: "Quantità", key: "quantita", width: 11 },
    { header: "U.M.", key: "unita", width: 8 },
    ...(vedi.costi ? [{ header: "Costo previsto", key: "costoPrevisto" as const, width: 15 }, { header: "Costo consuntivo", key: "costoConsuntivo" as const, width: 16 }] : []),
    ...(vedi.venduto ? [{ header: "Venduto", key: "venduto" as const, width: 14 }] : []),
    { header: "Avanzamento %", key: "avanzamento", width: 13 },
  ];
  ws.columns = colonne.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const data = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`) : null);
  for (const r of righe) {
    const riga = ws.addRow({ ...r, nome: r.livello ? `   ${r.nome}` : r.nome, inizioData: data(r.inizio), fineData: data(r.fine) });
    if (r.livello === 0) riga.font = { bold: true };
  }
  ws.getRow(1).font = { bold: true };
  for (const k of ["inizioData", "fineData"]) ws.getColumn(k).numFmt = "dd/mm/yyyy";
  for (const k of ["costoPrevisto", "costoConsuntivo", "venduto"]) if (colonne.some((c) => c.key === k)) ws.getColumn(k).numFmt = '#,##0.00 "€"';
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.headerFooter.oddHeader = titolo;
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
