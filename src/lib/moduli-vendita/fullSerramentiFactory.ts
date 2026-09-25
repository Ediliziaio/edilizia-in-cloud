import { completeModulePhotography } from "./modulePhotography";
import { SR_PDF_PAGES_META, type SrTemplatePdfRow } from "@/types/serramenti";
import type { ContenutoBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import type { SerramentiTemplateModuleId } from "./serramentiTemplateModules";

export type SrEditorialPair = readonly [string, string];
export interface SrEditorialContent {
  id: SerramentiTemplateModuleId;
  cover: string;
  hero: string;
  subtitle: string;
  eyebrow: string;
  images?: readonly { url: string; name: string }[];
  needs: readonly SrEditorialPair[];
  solution: readonly SrEditorialPair[];
  usp: string[];
  phases: readonly [string, string[]][];
  guarantees: readonly SrEditorialPair[];
  faq: readonly SrEditorialPair[];
  blocks: Record<"comeFunziona" | "protezione" | "controlli" | "documenti" | "diario", { title: string; intro: string; items: readonly SrEditorialPair[]; photo?: string }>;
}

/** Shares original document/editor structure only. All editorial sections are required per intervention. */
export function completeSerramentiEdition(seed: Partial<SrTemplatePdfRow>, base: Partial<SrTemplatePdfRow>, content: SrEditorialContent): Partial<SrTemplatePdfRow> {
  const enabled = new Set(["chi_siamo", "proposta", "come_funziona", "macro_dedicate", "linee_dedicate", "render", "articoli_dedicati", "allegato_tecnico", "investimento", "percorso", "protezione", "controlli", "documenti", "diario", "garanzie", "gallery_lavori", "recensioni", "faq", "cta", "condizioni"]);
  const items = (values: readonly SrEditorialPair[]) => values.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const blocks = Object.fromEntries(Object.entries(content.blocks).map(([key, b]): [string, ContenutoBlocco & { senzaFoto: boolean }] => [key, {
    occhiello: content.eyebrow, titolo: b.title, intro: b.intro, senzaFoto: !b.photo, foto: b.photo ? [b.photo] : [], escluse: [], nota: b.photo ? "Immagine illustrativa. Modello, finiture e componenti sono quelli confermati nell'offerta." : null,
    voci: b.items.map(([titolo, testo], i) => ({ titolo, testo, icona: (["verifica", "strati", "installazione", "documenti"] as const)[i % 4] })),
  }]));
  const result: Partial<SrTemplatePdfRow> = {
    ...seed, pdf_font_family: base.pdf_font_family || "helvetica",
    pdf_cover_hero: content.hero, pdf_cover_subhero: content.subtitle, pdf_cover_eyebrow: content.eyebrow,
    pdf_cover_image_url: content.cover, pdf_cover_text_vertical: "bottom", pdf_cover_overlay_opacity: 75,
    chi_siamo_attivo: !!base.chi_siamo_testo?.trim(), chi_siamo_testo: base.chi_siamo_testo || "", chi_siamo_foto_url: base.chi_siamo_foto_url || null,
    esigenze_default: items(content.needs), soluzione_default: items(content.solution), perche_noi_default: content.usp,
    percorso_cliente: { attivo: true, titolo: "Dalle scelte alla consegna", sottotitolo: "Le fasi del tuo intervento. Date e disponibilità si concordano nell'offerta.", fasi: content.phases.map(([nome, step], i) => ({ nome, step, icona: (["chiamata", "proposta", "produzione", "montaggio"] as const)[i % 4] })) },
    garanzie: content.guarantees.map(([titolo, descrizione], i) => ({ titolo, descrizione, icona: (["shield", "tools", "refresh", "clock"] as const)[i % 4] })),
    faq_items: content.faq.map(([domanda, risposta]) => ({ domanda, risposta })),
    pdf_pagine_articolo_dedicate: true, recensioni_attivo: true,
    render_disclaimer: "Immagini illustrative, anche generate con AI. Non sostituiscono rilievo, schede prodotto e campioni confermati; non documentano un lavoro eseguito dall'azienda.",
    pdf_pages_order: SR_PDF_PAGES_META.map(p => ({ id: p.id, visible: p.obbligatoria || enabled.has(p.id) })),
    pdf_blocchi: {
      ...seed.pdf_blocchi, ...blocks, modulo_edizione: 2, modulo_intervento: content.id, copertina_layout: "editoriale-v1",
      modulo_foto: [...new Map([
        { url: content.cover, nome: `${content.eyebrow} · copertina illustrativa` },
        ...(content.images || []).map(image => ({ url: image.url, nome: `${image.name} · illustrativa` })),
        ...Object.values(content.blocks).filter(block => !!block.photo).map(block => ({ url: block.photo!, nome: `${block.title.replace(/\*/g, "")} · illustrativa` })),
      ].map(image => [image.url, image])).values()],
      testata_domande: { occhiello: "PRIMA DI CONFERMARE", titolo: "Le risposte\nper scegliere bene.", intro: "I dettagli da chiarire sui prodotti e sulle lavorazioni di questa proposta." },
      testata_garanzie: { occhiello: "GARANZIE E ASSISTENZA", titolo: "Riferimenti chiari.\nAnche dopo la posa.", intro: "Controlli e documenti per i prodotti effettivamente forniti." },
      // Avoid repeating the cover four times. The closing detail remains illustrative.
      pagina_percorso: { senzaFoto: true },
      // Explicit subject for Avvolgibili: the renderer frames its upper detail
      // (cassonetto + telo), never an arbitrary unused photo from the library.
      pagina_cta: { foto: [content.id === "avvolgibili"
        ? "/module-art/serramenti-avvolgibili-cover.jpg"
        : content.images?.[0]?.url ?? content.cover] },
    },
  };
  result.pdf_blocchi = completeModulePhotography(result.pdf_blocchi, "serramenti");
  result.pdf_blocchi = { ...result.pdf_blocchi, modulo_defaults: structuredClone(result.pdf_blocchi) };
  return result;
}
