import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { calcolaDistanzaTotaleKm } from './geofenceCheck';
import type { GpsPositionExport } from './exportExcel';

const NAVY = '#1e3a5f';
const MAX_RIGHE_TABELLA = 50;

/**
 * Esporta il percorso giornaliero di un tecnico in formato PDF con jsPDF.
 * Include header, riepilogo e tabella punti GPS (prime 50 righe).
 */
export async function esportaPercorsoPdf(
  posizioni: GpsPositionExport[],
  nomeFile: string,
  nomeTecnico: string,
  data: string
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginL = 14;
  const marginR = 14;
  const contentWidth = pageWidth - marginL - marginR;

  // ── Header navy ──────────────────────────────────────────────────────────
  doc.setFillColor(NAVY);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setTextColor('#FFFFFF');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Edilizia in Cloud — Storico Percorso', marginL, 14);

  // ── Riepilogo ────────────────────────────────────────────────────────────
  doc.setTextColor('#1a1a1a');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

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

  const riepilogo = [
    ['Tecnico', nomeTecnico],
    ['Data', data],
    ['Distanza totale', `${distanzaKm} km`],
    ['Durata', `${durataMin} min`],
    ['Punti GPS', String(posizioni.length)],
    orarioInizio ? ['Orario inizio', orarioInizio] : null,
    orarioFine ? ['Orario fine', orarioFine] : null,
  ].filter((r): r is [string, string] => r !== null);

  let yPos = 30;
  const colLabelX = marginL;
  const colValueX = marginL + 45;

  riepilogo.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(NAVY);
    doc.text(label + ':', colLabelX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#1a1a1a');
    doc.text(value, colValueX, yPos);
    yPos += 6;
  });

  yPos += 4;

  // ── Linea separatrice ─────────────────────────────────────────────────────
  doc.setDrawColor('#CBD5E1');
  doc.line(marginL, yPos, pageWidth - marginR, yPos);
  yPos += 6;

  // ── Titolo tabella ────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(NAVY);
  doc.setFontSize(9);
  doc.text(
    `Dettaglio punti GPS${posizioni.length > MAX_RIGHE_TABELLA ? ` (prime ${MAX_RIGHE_TABELLA} di ${posizioni.length})` : ''}`,
    marginL,
    yPos
  );
  yPos += 5;

  // ── Intestazione tabella ──────────────────────────────────────────────────
  const colWidths = [10, 40, 22, 22, 20, 20];
  const colHeaders = ['N°', 'Data/Ora', 'Latitudine', 'Longitudine', 'Vel. (km/h)', 'Acc. (m)'];
  const rowHeight = 6;

  doc.setFillColor(NAVY);
  doc.rect(marginL, yPos, contentWidth, rowHeight, 'F');
  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  let xPos = marginL + 1;
  colHeaders.forEach((header, i) => {
    doc.text(header, xPos, yPos + 4);
    xPos += colWidths[i];
  });
  yPos += rowHeight;

  // ── Righe dati ────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  const righe = posizioni.slice(0, MAX_RIGHE_TABELLA);
  righe.forEach((p, idx) => {
    // Controllo fine pagina
    if (yPos + rowHeight > pageHeight - 15) {
      aggiungiFooter(doc, pageWidth, pageHeight);
      doc.addPage();
      yPos = 15;
    }

    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.setFillColor('#F5F7FA');
      doc.rect(marginL, yPos, contentWidth, rowHeight, 'F');
    }

    doc.setTextColor('#1a1a1a');
    const celle = [
      String(idx + 1),
      format(new Date(p.recorded_at), 'dd/MM/yyyy HH:mm:ss', { locale: it }),
      p.lat.toFixed(6),
      p.lng.toFixed(6),
      p.speed !== null ? String(Math.round(p.speed)) : '—',
      p.accuracy !== null ? String(Math.round(p.accuracy)) : '—',
    ];

    xPos = marginL + 1;
    celle.forEach((val, i) => {
      doc.text(val, xPos, yPos + 4);
      xPos += colWidths[i];
    });

    // Bordo riga
    doc.setDrawColor('#E2E8F0');
    doc.rect(marginL, yPos, contentWidth, rowHeight, 'S');

    yPos += rowHeight;
  });

  // ── Footer ultima pagina ──────────────────────────────────────────────────
  aggiungiFooter(doc, pageWidth, pageHeight);

  doc.save(nomeFile + '.pdf');
}

function aggiungiFooter(doc: InstanceType<typeof import('jspdf').default>, pageWidth: number, pageHeight: number): void {
  doc.setFontSize(7);
  doc.setTextColor('#94A3B8');
  doc.setFont('helvetica', 'normal');
  const pageCount = (doc.internal as { getNumberOfPages: () => number }).getNumberOfPages();
  doc.text(
    `Pagina ${pageCount} — Generato da Edilizia in Cloud`,
    pageWidth / 2,
    pageHeight - 6,
    { align: 'center' }
  );
}
