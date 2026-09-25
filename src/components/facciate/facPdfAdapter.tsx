import React from "react";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import type { DocEdileDati } from "@/components/preventivi/pdf/documentoEdileTipi";
import { buildFacModulePreview, isFacLocalImage, type FullFacModuleId, type FullFacTemplate } from "@/lib/moduli-vendita/fullFacModules";

export function FacciatePDF({ dati }: { dati: DocEdileDati }) { return <DocumentoEdilePDF dati={dati} />; }
export type FacImageResolver = (source: string) => Promise<string>;

/** Also converts inline WebP uploads: react-pdf cannot decode WebP itself. Fail visibly. */
export const resolveFacImage: FacImageResolver = async source => {
  if (!isFacLocalImage(source)) throw new Error("Il PDF locale accetta solo immagini della libreria locale o caricate nel browser.");
  if (/^data:image\/(png|jpeg);base64,/.test(source)) return source;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => finish(new Error("Immagine non disponibile. Sostituiscila o rimuovila prima di generare il PDF.")), 12000);
    let settled = false;
    function finish(result: string | Error) {
      if (settled) return;
      settled = true; window.clearTimeout(timer); img.onload = null; img.onerror = null;
      if (result instanceof Error) reject(result); else resolve(result);
    }
    img.onload = () => {
      try {
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Conversione immagine non disponibile.");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/png"));
      } catch { finish(new Error("Immagine non convertibile per il PDF locale.")); }
    };
    img.onerror = () => finish(new Error("Immagine locale non leggibile. Sostituiscila o rimuovila."));
    img.src = source;
  });
};

/** Walk the original renderer's image slots, never a database hook or remote image fallback. */
export async function inlineFacPdfImages(data: DocEdileDati, resolveImage: FacImageResolver = resolveFacImage): Promise<DocEdileDati> {
  const out = structuredClone(data);
  const cache = new Map<string, Promise<string>>();
  const image = async (source: string | null) => {
    if (!source) return null;
    // The shared adapter expands local paths to location.origin. Normalize ONLY our own origin.
    const origin = typeof location !== "undefined" ? location.origin : null;
    const local = origin && source.startsWith(`${origin}/`) ? source.slice(origin.length) : source;
    if (!isFacLocalImage(local)) throw new Error("Immagine remota non consentita nel modulo locale.");
    if (!cache.has(local)) cache.set(local, resolveImage(local).then(value => {
      if (!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(value)) throw new Error("Il convertitore non ha restituito un'immagine PNG o JPEG.");
      return value;
    }));
    return cache.get(local)!;
  };
  const m = out.modello;
  [out.azienda.logoUrl, out.azienda.logoChiaroUrl, m.copertina.immagineUrl, m.copertina.logoUrl, m.chiSiamoFotoUrl] = await Promise.all([
    image(out.azienda.logoUrl), image(out.azienda.logoChiaroUrl), image(m.copertina.immagineUrl), image(m.copertina.logoUrl), image(m.chiSiamoFotoUrl),
  ]);
  for (const block of Object.values(m.blocchi)) for (const photo of block.foto) photo.src = (await image(photo.src))!;
  if (m.fotoChiusura) m.fotoChiusura.src = (await image(m.fotoChiusura.src))!;
  for (const photo of Object.values(m.fotoRiempimento)) photo.src = (await image(photo.src))!;
  for (const page of m.pagineLibere) page.fotoUrl = await image(page.fotoUrl);
  for (const photo of [...m.galleriaLavori, ...out.fotoProgetto]) photo.url = (await image(photo.url))!;
  return out;
}

export async function renderFacPreviewBlobUrl(companyId: string, template: FullFacTemplate, id: FullFacModuleId): Promise<string> {
  const dati = await inlineFacPdfImages(buildFacModulePreview(companyId, template, id));
  const { pdf } = await import("@react-pdf/renderer");
  const blob = await pdf(<FacciatePDF dati={dati} />).toBlob();
  return URL.createObjectURL(blob);
}
