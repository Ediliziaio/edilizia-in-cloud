import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";

type JsPdfDoc = InstanceType<typeof import("jspdf").jsPDF>;

export const RENDER_AI_DISCLAIMER =
  "Render generato con intelligenza artificiale a scopo esclusivamente dimostrativo e illustrativo. L'immagine non rappresenta il risultato finale dell'intervento, che potrà variare in base a rilievi tecnici, materiali scelti, misure reali, condizioni dell'ambiente e fattibilità esecutiva.";

export interface RenderPdfMetadataItem {
  label: string;
  value: string | number | null | undefined;
}

export interface DownloadRenderPdfArgs {
  beforeUrl?: string | null;
  afterUrl: string;
  title: string;
  subtitle?: string;
  filename: string;
  metadata?: RenderPdfMetadataItem[];
  companyLogoUrl?: string | null;
  /** @deprecated The platform logo is intentionally not rendered in the PDF footer. */
  platformLogoUrl?: string | null;
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    context: "render-pdf.fetch-image",
  });
  if (!response.ok) {
    throw new Error(`Impossibile caricare immagine PDF (${response.status})`);
  }
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Conversione immagine PDF fallita"));
    reader.readAsDataURL(blob);
  });
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

function fitImage(
  doc: JsPdfDoc,
  dataUrl: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
) {
  const props = doc.getImageProperties(dataUrl);
  const ratio = Math.min(maxW / props.width, maxH / props.height);
  const w = props.width * ratio;
  const h = props.height * ratio;
  const centeredX = x + (maxW - w) / 2;
  const centeredY = y + (maxH - h) / 2;
  doc.addImage(dataUrl, imageFormat(dataUrl), centeredX, centeredY, w, h);
}

function addImageSafe(
  doc: JsPdfDoc,
  dataUrl: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): boolean {
  try {
    fitImage(doc, dataUrl, x, y, maxW, maxH);
    return true;
  } catch {
    return false;
  }
}

function drawRoundedBox(
  doc: JsPdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number],
  stroke?: [number, number, number],
  radius = 3,
) {
  doc.setFillColor(...fill);
  if (stroke) {
    doc.setDrawColor(...stroke);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, radius, radius, "FD");
    return;
  }
  doc.roundedRect(x, y, w, h, radius, radius, "F");
}

async function optionalImage(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    return await imageUrlToDataUrl(url);
  } catch {
    return null;
  }
}

function isPublicMetadata(item: RenderPdfMetadataItem): boolean {
  const value = item.value == null ? "" : String(item.value);
  if (!value.trim()) return false;
  const combined = `${item.label} ${value}`.toLowerCase();
  return !/(provider|openai|gemini|model|modello|costo|cost|addeb|billing|token|api)/.test(combined);
}

export async function downloadRenderBeforeAfterPdf(args: DownloadRenderPdfArgs): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  const headerY = margin;
  const headerH = 27;
  const metaY = headerY + headerH + 5;
  const metaH = 10;
  const imageY = metaY + metaH + 7;
  const footerY = pageH - margin - 17;
  const imageCardH = footerY - imageY - 7;
  const imageLabelH = 11;
  const imageInnerTop = imageY + imageLabelH + 4;
  const imageInnerH = imageCardH - imageLabelH - 8;
  const gap = 8;
  const imageCardW = (contentW - gap) / 2;
  const imageInnerW = imageCardW - 10;

  const [beforeData, afterData, companyLogoData] = await Promise.all([
    args.beforeUrl ? imageUrlToDataUrl(args.beforeUrl) : Promise.resolve(null),
    imageUrlToDataUrl(args.afterUrl),
    optionalImage(args.companyLogoUrl),
  ]);

  doc.setFillColor(236, 244, 253);
  doc.rect(0, 0, pageW, pageH, "F");

  drawRoundedBox(doc, margin, headerY, contentW, headerH, [255, 255, 255], [219, 229, 243], 4);

  const headerX = margin + 9;
  if (companyLogoData) {
    addImageSafe(doc, companyLogoData, pageW - margin - 42, headerY + 5, 34, 13);
  }

  doc.setTextColor(18, 28, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(args.title, headerX, headerY + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(args.subtitle || "Confronto fotografico prima / dopo", headerX, headerY + 19);

  const visibleMeta = (args.metadata ?? []).filter(isPublicMetadata);
  let metaX = margin;
  doc.setFontSize(8);
  for (const item of visibleMeta.slice(0, 6)) {
    const text = `${item.label}: ${item.value}`;
    const chipW = Math.min(doc.getTextWidth(text) + 10, 66);
    drawRoundedBox(doc, metaX, metaY, chipW, metaH, [255, 255, 255], [219, 229, 243], 3);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text(text.substring(0, 50), metaX + 5, metaY + 6.3);
    metaX += chipW + 4;
    if (metaX > pageW - margin - 50) break;
  }

  const beforeX = margin;
  const afterX = beforeX + imageCardW + gap;

  for (const [x, label] of [[beforeX, "PRIMA"], [afterX, "DOPO"]] as const) {
    drawRoundedBox(doc, x, imageY, imageCardW, imageCardH, [255, 255, 255], [219, 229, 243], 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(28, 52, 84);
    doc.text(label, x + 5, imageY + 7);
    doc.setDrawColor(226, 232, 240);
    doc.line(x + 5, imageY + imageLabelH, x + imageCardW - 5, imageY + imageLabelH);
  }

  if (beforeData) {
    fitImage(doc, beforeData, beforeX + 5, imageInnerTop, imageInnerW, imageInnerH);
  } else {
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(11);
    doc.text("Originale non disponibile", beforeX + imageCardW / 2, imageY + imageCardH / 2, { align: "center" });
  }
  fitImage(doc, afterData, afterX + 5, imageInnerTop, imageInnerW, imageInnerH);

  drawRoundedBox(doc, margin, footerY, contentW, 17, [255, 255, 255], [219, 229, 243], 3);
  doc.setFont("helvetica", "normal");
  const disclaimerX = margin + 6;
  const creditReserveW = 62;
  const disclaimerLines = doc.splitTextToSize(
    RENDER_AI_DISCLAIMER,
    contentW - creditReserveW - 12,
  );
  doc.setFontSize(5.9);
  doc.setTextColor(86, 103, 130);
  doc.text(disclaimerLines.slice(0, 3), disclaimerX, footerY + 5.8);

  const creditX = pageW - margin - 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.7);
  doc.setTextColor(100, 116, 139);
  doc.text("Realizzato da", creditX, footerY + 6.2, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(37, 99, 235);
  doc.text("Edilizia in Cloud", creditX, footerY + 11.2, { align: "right" });

  doc.save(args.filename.endsWith(".pdf") ? args.filename : `${args.filename}.pdf`);
}
