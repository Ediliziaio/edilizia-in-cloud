import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { calcolaDistanzaTotaleKm } from './geofenceCheck';

export interface GpsPositionExport {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string;
}

/**
 * Esporta il percorso giornaliero di un tecnico in formato .xlsx
 * con due fogli: "Percorso Dettaglio" e "Riepilogo".
 */
export async function esportaPercorsoExcel(
  posizioni: GpsPositionExport[],
  nomeFile: string,
  nomeTecnico: string,
  data: string
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Edilizia in Cloud';
  wb.created = new Date();

  // ── Foglio 1: Percorso Dettaglio ──────────────────────────────────────────
  const wsDettaglio = wb.addWorksheet('Percorso Dettaglio');

  wsDettaglio.columns = [
    { header: 'N°', key: 'num', width: 6 },
    { header: 'Data/Ora', key: 'datetime', width: 22 },
    { header: 'Latitudine', key: 'lat', width: 14 },
    { header: 'Longitudine', key: 'lng', width: 14 },
    { header: 'Velocità (km/h)', key: 'speed', width: 16 },
    { header: 'Accuratezza (m)', key: 'accuracy', width: 16 },
  ];

  // Stile intestazione
  const headerRow = wsDettaglio.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  headerRow.alignment = { horizontal: 'center' };

  posizioni.forEach((p, idx) => {
    wsDettaglio.addRow({
      num: idx + 1,
      datetime: format(new Date(p.recorded_at), 'dd/MM/yyyy HH:mm:ss', { locale: it }),
      lat: p.lat,
      lng: p.lng,
      speed: p.speed !== null ? p.speed : '',
      accuracy: p.accuracy !== null ? p.accuracy : '',
    });
  });

  // Bordi su tutte le celle dati
  wsDettaglio.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
      if (rowNumber % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F7FA' },
        };
      }
    });
  });

  // ── Foglio 2: Riepilogo ───────────────────────────────────────────────────
  const wsRiepilogo = wb.addWorksheet('Riepilogo');

  const distanzaKm = calcolaDistanzaTotaleKm(posizioni.map((p) => ({ lat: p.lat, lng: p.lng })));

  let durataMin = 0;
  let orarioInizio = '';
  let orarioFine = '';
  if (posizioni.length >= 2) {
    const inizio = new Date(posizioni[0].recorded_at);
    const fine = new Date(posizioni[posizioni.length - 1].recorded_at);
    durataMin = Math.round((fine.getTime() - inizio.getTime()) / 60000);
    orarioInizio = format(inizio, 'HH:mm:ss', { locale: it });
    orarioFine = format(fine, 'HH:mm:ss', { locale: it });
  }

  const righeRiepilogo = [
    ['Tecnico', nomeTecnico],
    ['Data percorso', data],
    ['Numero punti', posizioni.length],
    ['Distanza totale (km)', distanzaKm],
    ['Durata (min)', durataMin],
    ['Orario inizio', orarioInizio],
    ['Orario fine', orarioFine],
    ['Generato il', format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: it })],
  ];

  wsRiepilogo.columns = [
    { key: 'label', width: 24 },
    { key: 'value', width: 30 },
  ];

  righeRiepilogo.forEach(([label, value]) => {
    const row = wsRiepilogo.addRow({ label, value });
    row.getCell(1).font = { bold: true };
    row.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EFF7' },
    };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    });
  });

  // ── Download ──────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile + '.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
