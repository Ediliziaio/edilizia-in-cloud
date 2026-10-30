/**
 * La pianta in PNG: l'SVG in scala passato su un canvas del browser.
 *
 * La risoluzione si chiede in punti per pollice sul foglio (300 = stampa):
 * a 1:50 e 300 dpi un centimetro della pianta sono 23,6 pixel. Il lato lungo
 * resta sotto i 12.000 pixel, oltre i quali i browser rifiutano il canvas.
 */
import { esportaSvg, type OpzioniSvg } from "./svg";
import type { VistaPianta } from "./tipi";

export const LATO_MASSIMO_PX = 12_000;

export interface OpzioniPng extends OpzioniSvg {
  dpi?: number;
}

export interface RisultatoPng {
  blob: Blob;
  larghezzaPx: number;
  altezzaPx: number;
  /** I dpi davvero usati: meno di quelli chiesti se il disegno era troppo grande. */
  dpi: number;
}

export function dimensioniPng(larghezzaMm: number, altezzaMm: number, dpiChiesti: number) {
  const lato = Math.max(larghezzaMm, altezzaMm) / 25.4;
  const dpi = Math.min(dpiChiesti, LATO_MASSIMO_PX / lato);
  return {
    dpi,
    larghezzaPx: Math.max(1, Math.round((larghezzaMm / 25.4) * dpi)),
    altezzaPx: Math.max(1, Math.round((altezzaMm / 25.4) * dpi)),
  };
}

/** Da un SVG a un PNG delle dimensioni date. Solo nel browser. */
export async function svgInPng(svg: string, larghezzaPx: number, altezzaPx: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error("Il disegno non si è potuto trasformare in immagine."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = larghezzaPx;
    canvas.height = altezzaPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Il browser non ha concesso il canvas per l'immagine.");
    ctx.drawImage(img, 0, 0, larghezzaPx, altezzaPx);
    return await new Promise<Blob>((ok, ko) =>
      canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Immagine troppo grande per questo browser."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function esportaPng(vista: VistaPianta, opzioni: OpzioniPng = {}): Promise<RisultatoPng> {
  const { svg, larghezzaMm, altezzaMm } = esportaSvg(vista, opzioni);
  const d = dimensioniPng(larghezzaMm, altezzaMm, opzioni.dpi ?? 300);
  const blob = await svgInPng(svg, d.larghezzaPx, d.altezzaPx);
  return { blob, ...d };
}
