/**
 * Applica un watermark con data/ora/cantiere/GPS/operaio alla foto.
 * Utilizza canvas: banda semi-trasparente in basso, testo bianco.
 * NON modifica i pixel della foto originale sopra il watermark.
 */

import type { GeoTag } from "@/lib/campo/foto-geotag-validator";

export interface WatermarkData {
  dataOra: Date;
  nomeCantiere?: string;
  operaio?: string;
  geo: GeoTag;
}

const BAND_HEIGHT_RATIO = 0.14; // 14% dell'altezza
const MIN_BAND_HEIGHT = 80;
const BAND_OPACITY = 0.6;
const FONT_FAMILY = "Arial, sans-serif";
const TEXT_COLOR = "#FFFFFF";
const OUTPUT_QUALITY = 0.85;

function formatDataOra(d: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile caricare l'immagine per watermark"));
    };
    img.src = url;
  });
}

/**
 * Applica il watermark a un blob immagine e restituisce il nuovo blob JPEG.
 */
export async function applyWatermark(
  imageBlob: Blob,
  data: WatermarkData,
): Promise<Blob> {
  const img = await loadImageFromBlob(imageBlob);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non disponibile");

  // 1. Disegna la foto originale
  ctx.drawImage(img, 0, 0);

  // 2. Banda inferiore semi-trasparente
  const bandH = Math.max(MIN_BAND_HEIGHT, Math.round(h * BAND_HEIGHT_RATIO));
  const bandY = h - bandH;
  ctx.fillStyle = `rgba(0,0,0,${BAND_OPACITY})`;
  ctx.fillRect(0, bandY, w, bandH);

  // 3. Testo watermark
  const fontSize = Math.max(14, Math.round(bandH / 5));
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = TEXT_COLOR;
  ctx.textBaseline = "top";

  const padX = Math.round(w * 0.02);
  const lineHeight = Math.round(fontSize * 1.25);
  let lineY = bandY + Math.round((bandH - lineHeight * 3) / 2);

  const line1 = formatDataOra(data.dataOra);
  const line2 = data.nomeCantiere
    ? `${data.nomeCantiere}${data.operaio ? ` · ${data.operaio}` : ""}`
    : data.operaio
      ? data.operaio
      : "";
  const line3 = `GPS ${data.geo.lat.toFixed(4)}, ${data.geo.lng.toFixed(4)} (±${Math.round(data.geo.accuracy)}m)`;

  ctx.fillText(line1, padX, lineY);
  lineY += lineHeight;
  if (line2) {
    ctx.fillText(line2, padX, lineY);
  }
  lineY += lineHeight;
  ctx.fillText(line3, padX, lineY);

  // 4. Esporta JPEG
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export watermark fallito"))),
      "image/jpeg",
      OUTPUT_QUALITY,
    );
  });
}
