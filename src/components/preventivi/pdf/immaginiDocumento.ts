/**
 * Le immagini del modello, pronte per il PDF.
 *
 * Il motore PDF scarica le immagini remote senza un tempo massimo e legge solo
 * JPG e PNG: un WEBP esce vuoto, un indirizzo che non risponde blocca la
 * generazione per sempre. Per questo ogni immagine passa da `toDataUrl`, che la
 * converte nel browser e la scarta se non arriva. Fino al 20/09/2026 gli otto
 * moduli lo facevano solo per la foto «storica» di copertina: quella scelta
 * dalla galleria, il logo di copertina e le foto dei lavori andavano al motore
 * così com'erano.
 */
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";
import { copertinaInTinta } from "./temaDocumento";
import { leggiOrdine, leggiPagineLibere, ordineEffettivo } from "./ordineCapitoli";
import { BLOCCHI, eFotoDiSerie, leggiBlocco, settoreBlocchi } from "../../../../supabase/functions/_shared/blocchiPreventivo";

/** Le foto di serie sono indirizzi del sito («/pdf-stock/…»): si completano con l'origine della pagina. */
const conOrigine = (url: string): string => {
  const origine = (globalThis as { location?: { origin?: string } }).location?.origin;
  return url.startsWith("/") && origine ? `${origine}${url}` : url;
};

/**
 * La copertina di chi non ha ancora toccato il modello: una foto del mestiere,
 * nostra (servita dall'app, nessun sito terzo). Chi ha salvato il modello senza
 * foto l'ha scelto, e resta senza: qui si guarda `template.id`.
 */
export const COPERTINA_DI_SERIE: Record<string, string | undefined> = {
  ristrutturazione: "/cover-stock/ristrutturazione/2.jpg",
  bagni: "/cover-stock/bagni/2.jpg",
  piscine: "/cover-stock/ristrutturazione/3.jpg",
};

type Grezzo = Record<string, unknown>;
const stringa = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

async function aGruppi<T, R>(voci: T[], quanti: number, fn: (v: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < voci.length; i += quanti) {
    out.push(...(await Promise.all(voci.slice(i, i + quanti).map(fn))));
  }
  return out;
}

/** I campi immagine del modello già convertiti: da fondere sopra il modello. */
export async function immaginiDelModello(modulo: string, template: Grezzo, logoChiaroAzienda: string | null = null): Promise<Grezzo> {
  const mai = !stringa(template.id);
  const copertina = stringa(template.pdf_cover_image_url) ?? stringa(template.cover_image_url)
    ?? (mai ? COPERTINA_DI_SERIE[modulo] ?? null : null);
  const velo = (() => {
    const v = template.pdf_cover_overlay_opacity ?? template.cover_overlay_opacity;
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return v > 1 ? v / 100 : v;
  })();
  const logoCopertina = stringa(template.pdf_cover_logo_url) ?? stringa(template.cover_logo_url);
  const galleria = Array.isArray(template.gallery_lavori) ? (template.gallery_lavori as Grezzo[]) : [];
  // Le foto dei blocchi si caricano solo per quelli che escono: al massimo due per pagina.
  const ordine = ordineEffettivo(leggiOrdine(template.pdf_ordine_capitoli), leggiPagineLibere(template.pdf_pagine_libere));
  const blocchiAccesi = BLOCCHI.filter((b) => ordine.some((v) => v.chiave === b.chiave && v.visibile));
  const pagineLibere = Array.isArray(template.pdf_pagine_libere) ? (template.pdf_pagine_libere as Grezzo[]) : [];

  const [copertinaPronta, logoPronto, logoChiaroPronto, galleriaPronta, pagineLiberePronte, fotoBlocchi] = await Promise.all([
    toDataUrl(copertina, { scalaDiGrigi: copertinaInTinta(velo) }),
    toDataUrl(logoCopertina),
    toDataUrl(logoChiaroAzienda),
    aGruppi(galleria, 4, async (g) => ({ ...g, url: await toDataUrl(stringa(g.url)) })),
    // Le foto delle pagine libere: una che non si carica lascia la pagina senza
    // foto, non il documento senza pagina.
    aGruppi(pagineLibere, 4, async (p) => ({ ...p, fotoUrl: await toDataUrl(stringa(p.fotoUrl ?? p.foto_url)) })),
    // Una foto che non arriva lascia il blocco senza quella foto, non il documento senza blocco.
    Promise.all(blocchiAccesi.map(async ({ chiave }) => {
      const indirizzi = leggiBlocco(chiave, settoreBlocchi(modulo), template.pdf_blocchi).foto.slice(0, 2);
      const pronte = await Promise.all(indirizzi.map(async (u) => ({ src: await toDataUrl(conOrigine(u)), diSerie: eFotoDiSerie(u) })));
      return [chiave, pronte.filter((f) => Boolean(f.src))] as const;
    })),
  ]);

  return {
    // Una foto che non si è caricata NON va al motore: meglio la copertina a tinta piena.
    pdf_cover_image_url: copertinaPronta,
    cover_image_url: copertinaPronta,
    pdf_cover_logo_url: logoPronto,
    cover_logo_url: logoPronto,
    gallery_lavori: galleriaPronta.filter((g) => Boolean(g.url)),
    pdf_pagine_libere: pagineLiberePronte,
    // Non è un campo del modello: le foto dei blocchi accesi, già convertite (le legge l'adattatore).
    pdf_blocchi_foto: Object.fromEntries(fotoBlocchi),
    // Non è un campo del modello: torna qui per comodità di chi chiama (il logo chiaro
    // del kit del marchio, per la copertina su fondo scuro).
    logo_chiaro_url: logoChiaroPronto,
  };
}
