import { createElement } from "react";
import { generaPdfDocumento } from "@/lib/pdf/generaPdfDocumento";
import { DocumentoEdilePDF } from "./DocumentoEdilePDF";
import type { DocEdileDati } from "./documentoEdileTipi";
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";
import { validaPreventivo } from "./validaPreventivo";

/** La stessa preparazione immagini nel browser e nel bundle server. */
export async function preparaImmaginiPreventivo(dati: DocEdileDati): Promise<DocEdileDati> {
  const copia = structuredClone(dati);
  const lavori: Array<() => Promise<void>> = [];
  const cache = new Map<string, Promise<string | null>>();
  const visita = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (["immagine", "immagineUrl", "fotoUrl", "logoUrl", "logoChiaroUrl", "timbroUrl", "chiSiamoFotoUrl", "url", "src", "foto"].includes(key) && typeof item === "string" && item) {
        lavori.push(async () => {
          if (!cache.has(item)) cache.set(item, toDataUrl(item).catch((): null => null));
          (value as Record<string, unknown>)[key] = await cache.get(item) ?? null;
        });
      } else if (item && typeof item === "object") visita(item);
    }
  };
  visita(copia);
  // Evita decine di decodifiche simultanee su telefoni e funzioni server.
  for (let i = 0; i < lavori.length; i += 4) await Promise.all(lavori.slice(i, i + 4).map(run => run()));
  const ripulisci = (value: unknown): unknown => {
    if (value && typeof value === "object" && "src" in value && !value.src) return null;
    if (Array.isArray(value)) return value.filter(item => !item || typeof item !== "object" ||
      (!("src" in item) || !!item.src) && (!("url" in item) || !!item.url)).map(ripulisci);
    if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) (value as Record<string, unknown>)[key] = ripulisci(item);
    return value;
  };
  ripulisci(copia);
  return copia;
}

export async function generaPreventivoBlob(dati: DocEdileDati): Promise<Blob> {
  validaPreventivo(dati);
  const pronto = await preparaImmaginiPreventivo(dati);
  return generaPdfDocumento(createElement(DocumentoEdilePDF, { dati: pronto }));
}
