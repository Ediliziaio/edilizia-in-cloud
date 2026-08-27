/**
 * v8.6.56 — Export PDF offerta commerciale "Pacchetto custom".
 *
 * Genera un PDF A4 con:
 *  - Header brand EdiliziaInCloud (logo + tagline)
 *  - Dati cliente target
 *  - Tabella feature attivate (nome + prezzo unitario)
 *  - Totale mensile / annuale / risparmio
 *  - Termini di offerta (validità 30 gg)
 *  - Footer legale
 *
 * Uso: `await exportOfferPdf({ company, features, totals, expiresAt })`
 *      → scarica `Offerta-{company}-{date}.pdf`
 */
 
import jsPDF from "jspdf";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export interface OfferFeature {
  key: string;
  name: string;
  price: number | null;
  description?: string | null;
  category?: string | null;
}

export interface OfferTotals {
  monthly: number;
  yearly: number;
  enabledCount: number;
}

export interface OfferPdfInput {
  companyName: string;
  companyEmail?: string | null;
  features: OfferFeature[];
  totals: OfferTotals;
  expiresAt?: string | null;
  notes?: string;
  bundleName?: string;
}

const BRAND = {
  name: "EdiliziaInCloud",
  legalName: "Domus Group S.r.l.",
  taxId: "P.IVA 13132010961",
  address: "Via Aurelio Saffi 29 — 20123 Milano",
  email: "info@ediliziaincloud.com",
  phone: "+39 02 87198520",
  navy: "#1E3A5F",
  orange: "#F97316",
};

const formatEuro = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);

export function exportOfferPdf(input: OfferPdfInput): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const today = new Date();
  const validUntil = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  // ── HEADER navy con brand ──
  doc.setFillColor(30, 58, 95); // navy
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(BRAND.name, margin, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Il gestionale per imprese edili italiane", margin, 21);

  // Right side: data
  doc.setFontSize(8);
  doc.text(`Offerta del ${format(today, "d MMMM yyyy", { locale: it })}`, pageWidth - margin, 14, { align: "right" });
  doc.text(`Valida fino al ${format(validUntil, "d MMMM yyyy", { locale: it })}`, pageWidth - margin, 19, { align: "right" });

  doc.setTextColor(0, 0, 0);
  let y = 42;

  // ── TITOLO ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Offerta commerciale", margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(
    input.bundleName
      ? `Pacchetto: ${input.bundleName}`
      : "Pacchetto personalizzato di funzionalità",
    margin,
    y,
  );
  y += 12;

  // ── DATI CLIENTE ──
  doc.setFillColor(245, 246, 250);
  doc.rect(margin, y, pageWidth - margin * 2, 18, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("CLIENTE", margin + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(input.companyName, margin + 3, y + 11);
  if (input.companyEmail) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(input.companyEmail, margin + 3, y + 16);
  }
  y += 24;

  // ── TABELLA FEATURE ──
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Funzionalità incluse (${input.features.length})`, margin, y);
  y += 6;

  // Header tabella (riusabile dopo ogni addPage)
  const drawTableHeader = (yPos: number): number => {
    doc.setFillColor(30, 58, 95);
    doc.rect(margin, yPos, pageWidth - margin * 2, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("FUNZIONALITÀ", margin + 2, yPos + 4.5);
    doc.text("CATEGORIA", margin + 95, yPos + 4.5);
    doc.text("PREZZO/MESE", pageWidth - margin - 2, yPos + 4.5, { align: "right" });
    return yPos + 7;
  };
  y = drawTableHeader(y);

  // Righe feature
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let rowEven = false;
  for (const f of input.features) {
    if (y > pageHeight - 60) {
      // Nuova pagina: ridisegna l'intestazione tabella e ripristina lo stile righe
      doc.addPage();
      y = drawTableHeader(margin);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      rowEven = false;
    }
    if (rowEven) {
      doc.setFillColor(248, 249, 251);
      doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
    }
    doc.text(f.name.slice(0, 50), margin + 2, y + 4.5);
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(7.5);
    doc.text((f.category ?? "").slice(0, 20), margin + 95, y + 4.5);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const priceLabel = f.price != null && f.price > 0 ? formatEuro(f.price) : "Incluso";
    doc.text(priceLabel, pageWidth - margin - 2, y + 4.5, { align: "right" });
    y += 7;
    rowEven = !rowEven;
  }

  // ── TOTALI ──
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Totale mensile:", margin, y);
  doc.setTextColor(249, 115, 22); // orange
  doc.setFontSize(14);
  doc.text(formatEuro(input.totals.monthly), pageWidth - margin, y, { align: "right" });
  y += 7;

  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Equivalente annuale:", margin, y);
  doc.text(formatEuro(input.totals.yearly), pageWidth - margin, y, { align: "right" });
  y += 5;

  // Risparmio annuale se pago annuale (-10% indicativo)
  const yearlyDiscounted = input.totals.yearly * 0.9;
  const saved = input.totals.yearly - yearlyDiscounted;
  if (saved > 0) {
    doc.setTextColor(34, 139, 34); // green
    doc.setFontSize(9);
    doc.text(`Con piano annuale: ${formatEuro(yearlyDiscounted)} (risparmi ${formatEuro(saved)})`, margin, y);
    y += 5;
  }

  // ── SCADENZA / NOTE ──
  if (input.expiresAt) {
    y += 4;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    const expDate = format(new Date(input.expiresAt), "d MMMM yyyy", { locale: it });
    doc.text(`Configurazione valida fino al ${expDate}. Dopo questa data le funzionalità si disattivano automaticamente.`, margin, y);
    y += 4;
  }

  if (input.notes) {
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const notes = doc.splitTextToSize(input.notes, pageWidth - margin * 2);
    if (y + notes.length * 4 > pageHeight - 50) {
      doc.addPage();
      y = margin;
    }
    doc.text(notes, margin, y);
    y += notes.length * 4;
  }

  // ── TERMINI ──
  y += 8;
  if (y > pageHeight - 50) {
    doc.addPage();
    y = margin;
  }
  doc.setFillColor(255, 247, 237); // light orange
  doc.rect(margin, y, pageWidth - margin * 2, 28, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("CONDIZIONI", margin + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const terms = [
    `• Offerta valida fino al ${format(validUntil, "d MMMM yyyy", { locale: it })} (30 giorni dalla data di emissione)`,
    "• Fatturazione mensile o annuale (sconto 10% sul piano annuale)",
    "• Attivazione immediata, supporto incluso 8h-20h Lun-Ven",
    "• Cancellazione in qualsiasi momento, no vincoli pluriennali",
    "• Trial gratuito 14 giorni con tutte le funzionalità del pacchetto",
  ];
  let ty = y + 11;
  for (const t of terms) {
    doc.text(t, margin + 3, ty);
    ty += 3.5;
  }

  // ── FOOTER (su tutte le pagine) ──
  const totalPages = doc.getNumberOfPages();
  const footerY = pageHeight - 14;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, footerY, pageWidth - margin, footerY);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`${BRAND.legalName} — ${BRAND.taxId} — ${BRAND.address}`, margin, footerY + 4);
    doc.text(`${BRAND.email} · ${BRAND.phone}`, pageWidth - margin, footerY + 4, { align: "right" });
    doc.text("Offerta generata da Edilizia in Cloud", margin, footerY + 8);
    doc.text(`Pagina ${p} di ${totalPages}`, pageWidth - margin, footerY + 8, { align: "right" });
  }

  // ── SAVE ──
  const safeName = input.companyName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const dateStr = format(today, "yyyy-MM-dd");
  doc.save(`Offerta-${safeName}-${dateStr}.pdf`);
}
