/**
 * Il disegno del serramento come immagine per il PDF. Si disegna con lo stesso componente della schermata
 * (legni, vetri, ombre compresi) e si rasterizza: react-pdf non conosce pattern e filtri SVG, e una seconda
 * definizione del disegno andrebbe tenuta uguale alla prima. Solo nel browser, come il resto del PDF.
 */
import type { ReactElement } from "react";

export interface ImmagineDisegno {
  src: string;
  larghezza: number;
  altezza: number;
}

/** Larghezza dell'immagine, in pixel: a 250 pt di pagina sono circa 230 dpi. */
const PIXEL_LARGHEZZA = 800;

export async function rasterizzaDisegno(elemento: ReactElement, pixelLarghezza = PIXEL_LARGHEZZA): Promise<ImmagineDisegno | null> {
  if (typeof document === "undefined") return null;
  try {
    const { renderToStaticMarkup } = await import("react-dom/server");
    let svg = renderToStaticMarkup(elemento);
    const vb = /viewBox="([-\d.\s]+)"/.exec(svg)?.[1].trim().split(/\s+/).map(Number);
    if (!vb || vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0)) return null;
    const larghezza = pixelLarghezza;
    const altezza = Math.round((pixelLarghezza * vb[3]) / vb[2]);
    svg = svg
      .replace(/ style="[^"]*"/, "")
      .replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg" width="${larghezza}" height="${altezza}"`);
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error("disegno non caricato"));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = larghezza;
    canvas.height = altezza;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, larghezza, altezza);
    ctx.drawImage(img, 0, 0, larghezza, altezza);
    // JPEG: con ombre e sfumature un PNG pesa quasi 1 MB a disegno, e un preventivo ne ha decine.
    return { src: canvas.toDataURL("image/jpeg", 0.9), larghezza, altezza };
  } catch {
    // Un disegno che non si rasterizza non deve fermare il PDF: manca solo la pagina dei disegni per quella riga.
    return null;
  }
}

