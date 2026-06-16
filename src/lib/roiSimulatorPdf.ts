/**
 * Simulatore ROI di vendita — Round 2: report PDF brandizzato per il cliente.
 *
 * Genera un PDF A4 pulito e persuasivo da lasciare al prospect dopo la
 * trattativa. Riusa il pattern jsPDF di `pacchetto-custom/exportOfferPdf.ts`
 * (stesso oggetto BRAND, header navy + accento orange, footer legale con
 * Domus Group S.r.l. SOLO nel footer). Nelle pagine il brand è EdiliziaInCloud.
 *
 * Layout:
 *  - Header brand EdiliziaInCloud + cliente/data
 *  - "I tuoi numeri oggi" (software, ore perse per voce, costo orario, errori)
 *  - Confronto "Ti costa oggi €X/anno  vs  Con EdiliziaInCloud €Y/anno"
 *  - Risparmio annuo in grande + "si ripaga in N giorni"
 *  - Riga di chiusura persuasiva
 *  - Footer legale (Domus Group S.r.l. solo qui)
 *
 * Uso:  generateRoiPdf(inputs, results, clientName)        → scarica il file
 *       generateRoiPdf(inputs, results, clientName, { output: "datauristring" })
 *                                                          → base64 per l'allegato email
 *
 * NB: niente claim su localizzazione server (UE/Italia/Europa) — vietati.
 */

import jsPDF from "jspdf";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { RoiInputs, RoiResults } from "@/lib/roiSimulator";

const BRAND = {
  name: "EdiliziaInCloud",
  tagline: "Il gestionale per imprese edili italiane",
  legalName: "Domus Group S.r.l.",
  taxId: "P.IVA 13132010961",
  address: "Via Aurelio Saffi 29 — 20123 Milano",
  email: "info@ediliziaincloud.com",
  phone: "+39 02 87198520",
  navy: [30, 58, 95] as const,
  orange: [249, 115, 22] as const,
  green: [22, 163, 74] as const,
  grey: [100, 100, 100] as const,
};

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

/** Voci di tempo perso, etichette leggibili (ordine = colonna input). */
const HOUR_LABELS: ReadonlyArray<readonly [keyof RoiInputs["hours"], string]> = [
  ["fatturazione", "Fatturazione & DDT"],
  ["preventivi", "Preventivi"],
  ["cantieri", "Gestione cantieri"],
  ["ricercaDocumenti", "Ricerca documenti"],
  ["doppieImmissioni", "Doppie immissioni"],
];

export interface GenerateRoiPdfOptions {
  /**
   * "save" (default) scarica il file; "datauristring" ritorna il PDF come
   * data-URI base64 (usato per allegarlo all'email). "blob" ritorna un Blob.
   */
  output?: "save" | "datauristring" | "blob";
  /** Sovrascrive il nome file (default `<cliente>-ROI-EdiliziaInCloud.pdf`). */
  fileName?: string;
}

/** Nome file sicuro per il download del report. */
export function roiPdfFileName(clientName: string): string {
  const safe = (clientName || "cliente").trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cliente";
  return `${safe}-ROI-EdiliziaInCloud.pdf`;
}

/**
 * Genera il report ROI. Di default scarica il PDF; con `output:"datauristring"`
 * ritorna la stringa data-URI (per l'allegato email), con `output:"blob"` un Blob.
 */
export function generateRoiPdf(
  inputs: RoiInputs,
  results: RoiResults,
  clientName: string,
  opts: GenerateRoiPdfOptions = {},
): string | Blob | void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageWidth - margin * 2;
  const today = new Date();
  const cliente = (clientName || "").trim() || "Gentile cliente";
  const guadagna = results.risparmioAnnuo > 0;

  // ── HEADER navy con brand ──
  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(BRAND.name, margin, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(BRAND.tagline, margin, 21);
  doc.setFontSize(8);
  doc.text(`Analisi del ${format(today, "d MMMM yyyy", { locale: it })}`, pageWidth - margin, 14, {
    align: "right",
  });
  doc.text("Simulazione ROI personalizzata", pageWidth - margin, 19, { align: "right" });

  doc.setTextColor(0, 0, 0);
  let y = 42;

  // ── TITOLO ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Quanto ti costa non cambiare", margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.grey);
  doc.text("Analisi di ritorno sull'investimento", margin, y);
  y += 12;

  // ── DESTINATARIO ──
  doc.setFillColor(245, 246, 250);
  doc.rect(margin, y, contentW, 16, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PREPARATA PER", margin + 3, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text(cliente, margin + 3, y + 12);
  y += 24;

  // ── SEZIONE: I tuoi numeri oggi ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("I tuoi numeri oggi", margin, y);
  y += 6;

  const rowsOggi: Array<[string, string]> = [
    ["Software / gestionali", `${eur(inputs.softwareMensile)}/mese (${eur(results.softwareAnnuo)}/anno)`],
    ...HOUR_LABELS.map(
      ([key, label]) => [`Ore perse — ${label}`, `${(inputs.hours[key] ?? 0).toLocaleString("it-IT")} h/sett.`] as [string, string],
    ),
    ["Totale ore perse", `${results.oreSettimanaTotali.toLocaleString("it-IT")} h/settimana`],
    ["Costo orario medio", `${eur(inputs.costoOrario)}/h`],
    ["Errori e ritardi", `${eur(results.costoErroriAnnuo)}/anno`],
  ];

  doc.setFontSize(9.5);
  let rowEven = false;
  for (const [label, val] of rowsOggi) {
    const bold = label === "Totale ore perse";
    if (rowEven) {
      doc.setFillColor(248, 249, 251);
      doc.rect(margin, y - 4, contentW, 6.5, "F");
    }
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, margin + 2, y);
    doc.setTextColor(0, 0, 0);
    doc.text(val, pageWidth - margin - 2, y, { align: "right" });
    y += 6.5;
    rowEven = !rowEven;
  }
  y += 6;

  // ── CONFRONTO: oggi vs con EdiliziaInCloud (due card affiancate) ──
  const cardW = (contentW - 6) / 2;
  const cardH = 30;
  // Card "Ti costa oggi" (rosso tenue)
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(252, 165, 165);
  doc.rect(margin, y, cardW, cardH, "FD");
  doc.setTextColor(...BRAND.grey);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("TI COSTA OGGI", margin + 4, y + 7);
  doc.setTextColor(185, 28, 28);
  doc.setFontSize(18);
  doc.text(eur(results.costoAttualeAnnuo), margin + 4, y + 18);
  doc.setTextColor(...BRAND.grey);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("all'anno, senza cambiare nulla", margin + 4, y + 25);

  // Card "Con EdiliziaInCloud" (verde tenue)
  const card2X = margin + cardW + 6;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(134, 239, 172);
  doc.rect(card2X, y, cardW, cardH, "FD");
  doc.setTextColor(...BRAND.grey);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("CON EDILIZIAINCLOUD", card2X + 4, y + 7);
  doc.setTextColor(...BRAND.green);
  doc.setFontSize(18);
  doc.text(eur(results.costoConEicAnnuo), card2X + 4, y + 18);
  doc.setTextColor(...BRAND.grey);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("abbonamento + tempo ed errori ridotti", card2X + 4, y + 25);
  y += cardH + 12;

  // ── RISPARMIO ANNUO (hero) ──
  if (guadagna) {
    const heroH = 34;
    doc.setFillColor(...BRAND.navy);
    doc.rect(margin, y, contentW, heroH, "F");
    doc.setTextColor(190, 210, 235);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("CON EDILIZIAINCLOUD GUADAGNI", margin + 5, y + 9);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.text(`${eur(results.risparmioAnnuo)}`, margin + 5, y + 22);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("/ anno", margin + 6 + doc.getTextWidth(eur(results.risparmioAnnuo)), y + 22);
    doc.setFontSize(9);
    doc.setTextColor(190, 210, 235);
    doc.text(
      `Pari a ${eur(results.risparmioMensile)}/mese che torna nelle tue tasche.`,
      margin + 5,
      y + 30,
    );
    // Badge payback (orange) a destra
    if (results.paybackGiorni > 0) {
      const badge = `Si ripaga in ${results.paybackGiorni.toLocaleString("it-IT")} ${results.paybackGiorni === 1 ? "giorno" : "giorni"}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const bw = doc.getTextWidth(badge) + 8;
      doc.setFillColor(...BRAND.orange);
      doc.rect(pageWidth - margin - bw - 5, y + 6, bw, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(badge, pageWidth - margin - bw - 1, y + 11.5);
    }
    y += heroH + 10;
  } else {
    // Scenario senza guadagno: tono neutro, niente promesse.
    doc.setFillColor(245, 246, 250);
    doc.rect(margin, y, contentW, 18, "F");
    doc.setTextColor(...BRAND.grey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      "Con i valori attuali il risparmio stimato è marginale: aggiorna i dati di tempo e costi per la stima reale.",
      margin + 4,
      y + 11,
      { maxWidth: contentW - 8 },
    );
    y += 26;
  }

  // ── CHIUSURA persuasiva ──
  if (guadagna) {
    doc.setTextColor(...BRAND.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const closing = `EdiliziaInCloud non ti costa: ti fa guadagnare ${eur(results.risparmioAnnuo)} all'anno.`;
    const lines = doc.splitTextToSize(closing, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 6 + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BRAND.grey);
    doc.text(
      "Attivazione immediata, supporto incluso, nessun vincolo pluriennale.",
      margin,
      y,
    );
  }

  // ── FOOTER legale (Domus Group SOLO qui) ──
  const footerY = pageHeight - 14;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  doc.setTextColor(...BRAND.grey);
  doc.setFontSize(7);
  doc.text(`${BRAND.legalName} — ${BRAND.taxId} — ${BRAND.address}`, margin, footerY + 4);
  doc.text(`${BRAND.email} · ${BRAND.phone}`, pageWidth - margin, footerY + 4, { align: "right" });
  doc.text("Stima indicativa basata sui dati forniti. Report generato da EdiliziaInCloud.", margin, footerY + 8);

  // ── OUTPUT ──
  const output = opts.output ?? "save";
  if (output === "datauristring") {
    return doc.output("datauristring");
  }
  if (output === "blob") {
    return doc.output("blob");
  }
  doc.save(opts.fileName ?? roiPdfFileName(clientName));
}

/**
 * Estrae il payload base64 puro (senza prefisso `data:...;base64,`) dal data-URI
 * prodotto da jsPDF, pronto per `sendEmailUnified({ attachments: [{ content }] })`.
 */
export function roiPdfBase64(inputs: RoiInputs, results: RoiResults, clientName: string): string {
  const dataUri = generateRoiPdf(inputs, results, clientName, { output: "datauristring" }) as string;
  const comma = dataUri.indexOf(",");
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}
