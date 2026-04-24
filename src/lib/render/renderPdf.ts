import { jsPDF } from "jspdf";

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
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
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
  doc: jsPDF,
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

export async function downloadRenderBeforeAfterPdf(args: DownloadRenderPdfArgs): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const gap = 8;
  const headerH = 26;
  const footerH = 18;
  const metaH = 18;
  const imageTop = margin + headerH + metaH;
  const imageH = pageH - imageTop - footerH - margin;
  const imageW = (pageW - margin * 2 - gap) / 2;

  const [beforeData, afterData] = await Promise.all([
    args.beforeUrl ? imageUrlToDataUrl(args.beforeUrl) : Promise.resolve(null),
    imageUrlToDataUrl(args.afterUrl),
  ]);

  doc.setFillColor(246, 248, 251);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, margin, pageW - margin * 2, pageH - margin * 2, 3, 3, "F");

  doc.setTextColor(18, 28, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(args.title, margin + 8, margin + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(86, 103, 130);
  doc.text(args.subtitle || "Confronto prima / dopo render AI", margin + 8, margin + 18);

  const visibleMeta = (args.metadata ?? []).filter((item) => item.value != null && String(item.value).trim());
  let metaX = margin + 8;
  const metaY = margin + 31;
  doc.setFontSize(8);
  for (const item of visibleMeta.slice(0, 5)) {
    const text = `${item.label}: ${item.value}`;
    const chipW = Math.min(doc.getTextWidth(text) + 8, 62);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(metaX, metaY - 5, chipW, 8, 2, 2, "F");
    doc.setTextColor(51, 65, 85);
    doc.text(text.substring(0, 48), metaX + 4, metaY);
    metaX += chipW + 4;
  }

  const beforeX = margin + 8;
  const afterX = beforeX + imageW + gap;
  const cardY = imageTop - 2;
  const cardH = imageH + 12;

  for (const [x, label] of [[beforeX, "PRIMA"], [afterX, "DOPO"]] as const) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, cardY, imageW, cardH, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(label, x + 4, cardY + 6);
  }

  if (beforeData) {
    fitImage(doc, beforeData, beforeX + 4, cardY + 9, imageW - 8, imageH);
  } else {
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(11);
    doc.text("Originale non disponibile", beforeX + imageW / 2, cardY + cardH / 2, { align: "center" });
  }
  fitImage(doc, afterData, afterX + 4, cardY + 9, imageW - 8, imageH);

  doc.setDrawColor(226, 232, 240);
  doc.line(margin + 8, pageH - margin - 13, pageW - margin - 8, pageH - margin - 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  const disclaimerLines = doc.splitTextToSize(RENDER_AI_DISCLAIMER, pageW - margin * 2 - 16);
  doc.text(disclaimerLines, margin + 8, pageH - margin - 8);

  doc.save(args.filename.endsWith(".pdf") ? args.filename : `${args.filename}.pdf`);
}
