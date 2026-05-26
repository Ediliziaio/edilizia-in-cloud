/**
 * Export raster (PNG) e PDF di una planimetria SVG.
 *
 * Usa Canvas API per PNG (no dipendenze extra) e jsPDF per il PDF base
 * con header azienda + footer scala/data.
 */

import jsPDF from "jspdf";
import type { FloorPlanAnalysis } from "./floorPlanAi";

/**
 * Esporta un elemento <svg> come file PNG.
 *
 * Strategia: serializza SVG → image (via Blob) → Canvas drawImage → blob PNG.
 * Funziona offline, nessuna lib esterna.
 *
 * @param svgEl elemento SVG sorgente
 * @param fileName nome file (senza estensione)
 * @param options scale: moltiplicatore risoluzione (default 2 = retina)
 */
export async function exportSvgAsPng(
  svgEl: SVGSVGElement,
  fileName: string,
  options: { scale?: number; backgroundColor?: string } = {},
): Promise<void> {
  const scale = options.scale ?? 2;
  const bg = options.backgroundColor ?? "#0b1220"; // slate-950 background

  const bbox = svgEl.viewBox?.baseVal;
  const width = (bbox?.width || svgEl.clientWidth || 800) * scale;
  const height = (bbox?.height || svgEl.clientHeight || 600) * scale;

  // Clone + add xmlns esplicito (richiesto per blob)
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (bbox) {
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
  }
  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponibile");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png", 0.95),
    );
    if (!pngBlob) throw new Error("Conversione PNG fallita");

    triggerDownload(pngBlob, `${fileName}.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * Esporta una planimetria come PDF A4 landscape con header azienda + footer
 * scala/data. Usa jsPDF (già in dependencies).
 *
 * @param svgEl elemento SVG sorgente (planimetria)
 * @param plan oggetto FloorPlanAnalysis per metadata
 * @param companyName nome azienda da stampare nell'header
 */
export async function exportFloorPlanAsPdf(
  svgEl: SVGSVGElement,
  plan: FloorPlanAnalysis,
  companyName: string,
): Promise<void> {
  // 1. Converti SVG in PNG via canvas (riuso logica)
  const bbox = svgEl.viewBox?.baseVal;
  const scale = 2;
  const imgWidth = (bbox?.width || svgEl.clientWidth || 800) * scale;
  const imgHeight = (bbox?.height || svgEl.clientHeight || 600) * scale;

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (bbox) {
    clone.setAttribute("width", String(imgWidth));
    clone.setAttribute("height", String(imgHeight));
  }
  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = imgWidth;
    canvas.height = imgHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponibile");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, imgWidth, imgHeight);
    ctx.drawImage(img, 0, 0, imgWidth, imgHeight);
    const dataUrl = canvas.toDataURL("image/png", 0.95);

    // 2. Crea PDF A4 landscape
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth(); // 297
    const pageHeight = pdf.internal.pageSize.getHeight(); // 210
    const margin = 12;
    const headerHeight = 14;
    const footerHeight = 10;

    // Header
    pdf.setFillColor(15, 23, 42); // slate-900
    pdf.rect(0, 0, pageWidth, headerHeight, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text(companyName, margin, 9);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("Planimetria — Edilizia in Cloud", pageWidth - margin, 9, { align: "right" });

    // Area planimetria
    const contentY = headerHeight + margin;
    const contentMaxH = pageHeight - headerHeight - footerHeight - margin * 2;
    const contentMaxW = pageWidth - margin * 2;
    // Mantieni aspect ratio
    const aspect = imgWidth / imgHeight;
    let drawW = contentMaxW;
    let drawH = drawW / aspect;
    if (drawH > contentMaxH) {
      drawH = contentMaxH;
      drawW = drawH * aspect;
    }
    const drawX = (pageWidth - drawW) / 2;
    pdf.addImage(dataUrl, "PNG", drawX, contentY, drawW, drawH);

    // Footer
    const footerY = pageHeight - footerHeight + 3;
    pdf.setDrawColor(200);
    pdf.line(margin, footerY - 2, pageWidth - margin, footerY - 2);
    pdf.setTextColor(80);
    pdf.setFontSize(8);
    pdf.text(`Planimetria: ${plan.title || plan.id}`, margin, footerY + 3);
    const meta = [
      `Scala: ${plan.source.scale}`,
      `Stato: ${plan.source.scaleStatus === "confirmed" ? "Calibrata" : "Stimata"}`,
      `Generato: ${new Date().toLocaleString("it-IT")}`,
    ].join("    ");
    pdf.text(meta, pageWidth - margin, footerY + 3, { align: "right" });

    // Salva
    pdf.save(`${plan.id || "planimetria"}.pdf`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossibile caricare immagine: ${src.slice(0, 40)}...`));
    img.src = src;
  });
}

function triggerDownload(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
