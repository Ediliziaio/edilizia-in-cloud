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
import { conOrigine, fotoDeiBlocchi } from "@/lib/pdf/fotoBlocchi";
import { votiOnlineAzienda } from "@/lib/pdf/votiOnline";
import { BLOCCHI, leggiFotoPagina, RIEMPIMENTI_EDILI, settoreBlocchi } from "../../../../supabase/functions/_shared/blocchiPreventivo";

/**
 * La copertina di chi non ha ancora toccato il modello: una foto del mestiere,
 * nostra (servita dall'app, nessun sito terzo). Chi ha salvato il modello senza
 * foto l'ha scelto, e resta senza: qui si guarda `template.id`.
 */
export const COPERTINA_DI_SERIE: Record<string, string | undefined> = {
  ristrutturazione: "/cover-stock/ristrutturazione/2.jpg",
  bagni: "/cover-stock/bagni/2.jpg",
  // Dal 22/09/2026 ogni mestiere ha la sua copertina verticale: prima questi sei
  // prendevano in prestito una foto orizzontale (tagliata) o quella di un altro settore.
  piscine: "/cover-stock/piscine/1.jpg",
  tetti: "/cover-stock/tetti/1.jpg",
  climatizzazione: "/cover-stock/climatizzazione/1.jpg",
  elettrico: "/cover-stock/elettrico/1.jpg",
  termoidraulico: "/cover-stock/termoidraulico/1.jpg",
  pavimenti: "/cover-stock/pavimenti/1.jpg",
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

/**
 * I campi immagine del modello già convertiti: da fondere sopra il modello. Porta
 * anche il voto online dell'azienda: non è un'immagine, ma questo è l'unico passo
 * che tutti gli otto moduli fanno sul modello prima del PDF.
 */
export async function immaginiDelModello(
  modulo: string, template: Grezzo, logoChiaroAzienda: string | null = null, companyId: string | null = null,
): Promise<Grezzo> {
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

  const fotoChiusura = leggiFotoPagina("chiusura", settoreBlocchi(modulo), template.pdf_blocchi);
  // Le foto che riempiono le pagine: solo per i capitoli che escono (vedi DocumentoEdilePDF).
  const riempimenti = Object.entries(RIEMPIMENTI_EDILI)
    .filter(([capitolo]) => ordine.some((v) => v.chiave === capitolo && v.visibile))
    .map(([, chiave]) => [chiave, leggiFotoPagina(chiave, settoreBlocchi(modulo), template.pdf_blocchi)] as const)
    .filter((x): x is readonly [typeof x[0], string] => Boolean(x[1]));
  const riempimentiInCorso = Promise.all(riempimenti.map(async ([k, url]) => [k, await toDataUrl(conOrigine(url))] as const));
  const votiInCorso = votiOnlineAzienda(companyId ?? stringa(template.company_id));
  const [copertinaPronta, logoPronto, logoChiaroPronto, galleriaPronta, pagineLiberePronte, fotoBlocchi, chiusuraPronta] = await Promise.all([
    toDataUrl(copertina ? conOrigine(copertina) : null, { scalaDiGrigi: copertinaInTinta(velo) }),
    toDataUrl(logoCopertina),
    toDataUrl(logoChiaroAzienda),
    aGruppi(galleria, 4, async (g) => ({ ...g, url: await toDataUrl(stringa(g.url)) })),
    // Le foto delle pagine libere: una che non si carica lascia la pagina senza
    // foto, non il documento senza pagina.
    aGruppi(pagineLibere, 4, async (p) => ({ ...p, fotoUrl: await toDataUrl(stringa(p.fotoUrl ?? p.foto_url)) })),
    fotoDeiBlocchi(settoreBlocchi(modulo), template.pdf_blocchi, blocchiAccesi.map((b) => b.chiave)),
    fotoChiusura ? toDataUrl(conOrigine(fotoChiusura)) : Promise.resolve(null),
  ]);
  const riempimentiPronti = await riempimentiInCorso;
  const votiOnline = await votiInCorso;

  return {
    // Una foto che non si è caricata NON va al motore: meglio la copertina a tinta piena.
    pdf_cover_image_url: copertinaPronta,
    cover_image_url: copertinaPronta,
    pdf_cover_logo_url: logoPronto,
    cover_logo_url: logoPronto,
    gallery_lavori: galleriaPronta.filter((g) => Boolean(g.url)),
    pdf_pagine_libere: pagineLiberePronte,
    // Non è un campo del modello: le foto dei blocchi accesi, già convertite (le legge l'adattatore).
    pdf_blocchi_foto: fotoBlocchi,
    // Non è un campo del modello: le foto delle pagine già convertite (la chiusura e quelle che riempiono).
    pdf_pagine_foto: { chiusura: chiusuraPronta, ...Object.fromEntries(riempimentiPronti) },
    // Non è un campo del modello: torna qui per comodità di chi chiama (il logo chiaro
    // del kit del marchio, per la copertina su fondo scuro).
    logo_chiaro_url: logoChiaroPronto,
    // Non è un campo del modello: il voto su Google, Trustpilot… (lo legge l'adattatore).
    pdf_voti_online: votiOnline,
  };
}
