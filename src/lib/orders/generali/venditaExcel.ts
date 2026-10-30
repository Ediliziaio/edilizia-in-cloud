// src/lib/orders/generali/venditaExcel.ts
// Il listino disponibilità in Excel: una riga per unità, m² e prezzi come numeri veri, per
// l'agenzia che lo vuole filtrare o incollare altrove. Stesse righe del PDF (DatiListino):
// niente acquirenti né importi incassati, perché in DatiListino non ci sono.
import { neutralizeCsvFormula } from "@/lib/csvExport";
import { giornoIt } from "@/lib/orders/generali/rendiconto";
import { NOMI_STATO_LISTINO, contattiAzienda, type DatiListino } from "@/lib/orders/generali/vendita";

export { TIPO_XLSX } from "@/lib/orders/generali/rendicontoExcel";

const testo = (v: string | null) => (v === null ? null : neutralizeCsvFormula(v));

export async function creaExcelListino(d: DatiListino): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = d.azienda.nome;
  wb.title = `Listino ${d.operazione}`;
  wb.created = new Date();
  const ws = wb.addWorksheet("Listino");

  ws.getCell("A1").value = testo(`${d.operazione} · listino disponibilità`);
  ws.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
  ws.getCell("A2").value = testo(`${d.azienda.nome} · aggiornato al ${giornoIt(d.data)}`);
  ws.getCell("A2").font = { size: 9, color: { argb: "FF6B7280" } };
  const contatti = contattiAzienda(d.azienda);
  if (contatti) {
    ws.getCell("A3").value = testo(contatti);
    ws.getCell("A3").font = { size: 9, color: { argb: "FF6B7280" } };
  }

  const colonne: { titolo: string; larghezza: number; formato?: string }[] = [
    ...(d.conEdifici ? [{ titolo: "Edificio", larghezza: 14 }] : []),
    { titolo: "Piano", larghezza: 14 },
    { titolo: "Unità", larghezza: 10 },
    { titolo: "Tipologia", larghezza: 16 },
    { titolo: "m² commerciali", larghezza: 14, formato: "#,##0.##" },
    ...(d.conPrezzi ? [{ titolo: "Prezzo di listino", larghezza: 18, formato: '#,##0 "€"' }] : []),
    { titolo: "Stato", larghezza: 12 },
  ];
  const inizio = 5;
  const intestazione = ws.getRow(inizio);
  colonne.forEach((c, i) => {
    const cella = intestazione.getCell(i + 1);
    cella.value = c.titolo;
    cella.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cella.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    ws.getColumn(i + 1).width = c.larghezza;
    if (c.formato) ws.getColumn(i + 1).numFmt = c.formato;
  });

  d.righe.forEach((r, n) => {
    const valori: (string | number | null)[] = [
      ...(d.conEdifici ? [testo(r.edificio)] : []),
      testo(r.piano),
      testo(r.sigla),
      testo(r.tipologia),
      r.mq,
      ...(d.conPrezzi ? [r.prezzo] : []),
      NOMI_STATO_LISTINO[r.stato],
    ];
    const riga = ws.getRow(inizio + 1 + n);
    valori.forEach((v, i) => { riga.getCell(i + 1).value = v; });
  });

  const fine = inizio + d.righe.length + 2;
  ws.getCell(fine, 1).value = `Libere ${d.conteggi.libera} · prenotate ${d.conteggi.prenotata} · vendute ${d.conteggi.venduta}`;
  ws.getCell(fine, 1).font = { bold: true };
  if (d.conPrezzi) {
    ws.getCell(fine + 1, 1).value = "Il listino non è un'offerta: disponibilità e prezzi si confermano alla prenotazione.";
    ws.getCell(fine + 1, 1).font = { size: 9, color: { argb: "FF6B7280" } };
  }
  ws.views = [{ state: "frozen", ySplit: inizio }];
  ws.autoFilter = { from: { row: inizio, column: 1 }, to: { row: inizio + Math.max(1, d.righe.length), column: colonne.length } };
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
