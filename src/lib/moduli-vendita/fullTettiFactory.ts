import { completeModulePhotography } from "./modulePhotography";
import type { TetTemplatePdf } from "@/types/tetti";
import type { ContenutoBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";

export type TetEditorialPair = readonly [string, string];
export interface TetEditorialContent {
  title: string; subtitle: string; eyebrow: string; cover: string;
  journeyPhoto?: string;
  timelinePhoto?: string | null;
  closingPhoto?: string | null;
  images: readonly { url: string; name: string }[];
  needs: readonly TetEditorialPair[]; solution: readonly TetEditorialPair[]; usp: readonly TetEditorialPair[];
  journey: readonly TetEditorialPair[]; guarantees: readonly TetEditorialPair[]; faq: readonly TetEditorialPair[];
  schedule: readonly TetEditorialPair[];
  blocks: Record<"comeFunziona" | "compreso" | "protezione" | "controlli" | "documenti" | "diario", {
    title: string; intro: string; items: readonly TetEditorialPair[]; excluded?: readonly TetEditorialPair[]; photo?: string;
  }>;
}

/** Original document schema and renderer; all intervention content must be authored. */
export function completeTettiEdition(seed: TetTemplatePdf, base: TetTemplatePdf, content: TetEditorialContent): TetTemplatePdf {
  const items = (values: readonly TetEditorialPair[]) => values.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const entries = (values: readonly TetEditorialPair[]) => values.map(([titolo, testo], i) => ({ titolo, testo, icona: (["verifica", "strati", "installazione", "documenti"] as const)[i % 4] }));
  const blocks = Object.fromEntries(Object.entries(content.blocks).map(([key, b]): [string, ContenutoBlocco & { senzaFoto: boolean }] => [key, {
    occhiello: content.eyebrow, titolo: b.title, intro: b.intro, voci: entries(b.items), escluse: entries(b.excluded || []),
    foto: b.photo ? [b.photo] : [], senzaFoto: !b.photo,
    nota: b.photo ? "Immagine illustrativa, non un rilievo del tuo immobile né un dettaglio esecutivo. Le opere incluse sono quelle del computo confermato." : null,
  }]));
  const result: TetTemplatePdf = {
    ...seed, cover_title: content.title, cover_subtitle: content.subtitle, cover_eyebrow: content.eyebrow,
    cover_image_url: content.cover, cover_bg_color: "#263638", cover_overlay_opacity: 0.74,
    cover_title_size: 36, cover_subtitle_size: 13,
    color_primary: base.color_primary || "#31565a", color_accent: base.color_accent || "#b0794e",
    show_chi_siamo: !!base.chi_siamo?.trim(),
    condizioni_legali_testo: null, condizioni_legali_attivo: false, modulo_recesso_attivo: false,
    esigenze: items(content.needs), soluzione: items(content.solution), usp: items(content.usp),
    percorso: items(content.journey), garanzie: items(content.guarantees),
    cronoprogramma: content.schedule.map(([fase, descrizione]) => ({ fase, durata: "Da concordare", descrizione })),
    faq: content.faq.map(([domanda, risposta]) => ({ domanda, risposta })),
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(c => ({ chiave: c.chiave, visibile: true })),
    pdf_blocchi: {
      ...seed.pdf_blocchi, ...blocks, modulo_edizione: 2,
      modulo_foto: [...new Map([{ url: content.cover, nome: `${content.eyebrow} · copertina illustrativa` }, ...content.images.map(i => ({ url: i.url, nome: `${i.name} · illustrativa` }))].map(i => [i.url, i])).values()],
      pagina_computo: { senzaFoto: true }, pagina_compreso: { senzaFoto: true },
      pagina_percorso: content.journeyPhoto ? { foto: [content.journeyPhoto] } : { senzaFoto: true },
      ...(content.timelinePhoto === null ? { pagina_tempi: { senzaFoto: true } }
        : content.timelinePhoto ? { pagina_tempi: { foto: [content.timelinePhoto] } } : {}),
      pagina_domande: { senzaFoto: true },
      pagina_chiusura: content.closingPhoto === null ? { senzaFoto: true } : { foto: [content.closingPhoto || content.cover] },
    },
  };
  result.pdf_blocchi = completeModulePhotography(result.pdf_blocchi, "tetti");
  result.pdf_blocchi = { ...result.pdf_blocchi, modulo_defaults: structuredClone(result.pdf_blocchi) };
  return result;
}
