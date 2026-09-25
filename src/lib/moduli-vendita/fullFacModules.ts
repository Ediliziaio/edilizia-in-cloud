import type { RstTemplatePdf } from "@/types/ristrutturazione";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import { costruisciDatiEdile, type VoceComune } from "@/components/preventivi/pdf/adattatoreEdile";
import type { DocEdileDati } from "@/components/preventivi/pdf/documentoEdileTipi";
import { calcTotaliComputo, type ComputoRigaInput } from "@/lib/ristrutturazione/calcoli";
import { FAC_EDITORIAL, type FacEditorialContent, type FacPair } from "./facEditorialContent";
import type { ContenutoBlocco, VoceBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";

export const FULL_FAC_MODULES = ["cappotto", "rifacimento", "balconi", "tinteggiatura", "interno", "riparazioni"] as const;
export type FullFacModuleId = typeof FULL_FAC_MODULES[number];
export const FAC_MODULE_TITLES: Record<FullFacModuleId, string> = {
  cappotto: "Cappotto termico esterno", rifacimento: "Rifacimento facciata", balconi: "Balconi e frontalini",
  tinteggiatura: "Tinteggiatura esterna", interno: "Isolamento interno", riparazioni: "Riparazioni localizzate",
};
export const FAC_MODULE_COVERS = Object.fromEntries(FULL_FAC_MODULES.map(id => [id, FAC_EDITORIAL[id].cover])) as Record<FullFacModuleId, string>;
export const isFullFacModuleId = (id: string): id is FullFacModuleId => (FULL_FAC_MODULES as readonly string[]).includes(id);
export const FAC_FIXTURE_NOTICE = "Dati, quantità e prezzi dimostrativi, non un'offerta. IVA di esempio, da verificare per il singolo intervento.";
export const FAC_IMAGE_NOTICE = "Immagine illustrativa generata con AI: non documenta lavori aziendali e non sostituisce il progetto o la specifica tecnica dell'intervento.";
export type FacBranding = Partial<Pick<RstTemplatePdf, "company_id" | "ragione_sociale" | "indirizzo_completo" | "telefono" | "email" | "partita_iva" | "logo_url" | "cover_logo_url" | "color_primary" | "color_secondary" | "color_accent" | "font_family" | "chi_siamo">>;
export type FullFacTemplate = RstTemplatePdf & {
  pdf_cover_eyebrow: string | null;
  pdf_cover_image_url: string | null;
  pdf_cover_bg_color: string;
  pdf_cover_text_color: string;
  pdf_cover_title_size: number;
  pdf_cover_eyebrow_size?: number | null;
  pdf_cover_subtitle_size: number;
  pdf_cover_overlay_opacity: number;
  pdf_cover_overlay_style: "flat" | "gradient" | "gradient_diag" | "vignette";
  pdf_cover_text_align: "left" | "center";
  pdf_cover_text_vertical: "top" | "center" | "bottom";
  pdf_cover_show_decoration: boolean;
  pdf_cover_decoration_style: "none";
  pdf_cover_show_client_card: boolean;
  pdf_blocchi: Record<string, unknown>;
};
/** Only app-bundled images and inline uploads. No remote storage or signed URL fallback. */
export function isFacLocalImage(url: string): boolean {
  return /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(url)
    || /^\/(?:module-art|pdf-stock|cover-stock|render-references)\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp)$/.test(url);
}
const localLogo = (url?: string | null) => url && isFacLocalImage(url) ? url : null;
const items = (pairs: readonly FacPair[]) => pairs.map(([titolo, descrizione]) => ({ titolo, descrizione }));
const entries = (pairs: readonly FacPair[]): VoceBlocco[] => pairs.map(([titolo, testo]): VoceBlocco => ({ titolo, testo, icona: null }));

/** Whitelist branding only: never inherit renovation copy, incentives or legal promises. */
export function createFullFacTemplate(base: FacBranding & { company_id: string }, id: FullFacModuleId): FullFacTemplate {
  if (!base.company_id?.trim() || !isFullFacModuleId(id)) throw new Error("Azienda o modulo Facciate non valido.");
  const c: FacEditorialContent = FAC_EDITORIAL[id];
  const block = (titolo: string, intro: string, pairs: readonly FacPair[], excluded: readonly FacPair[] = []): ContenutoBlocco & { senzaFoto: boolean } => ({
    occhiello: FAC_MODULE_TITLES[id], titolo, intro, voci: entries(pairs), escluse: entries(excluded), foto: [], senzaFoto: true, nota: null,
  });
  const blocks: Record<string, unknown> = {
    comeFunziona: block("La specifica dell'intervento", "Materiali, dettagli e quantità da confermare dopo il rilievo. Le immagini non rappresentano una stratigrafia tecnica.", c.specs),
    compreso: block("Il perimetro della proposta", "Sono comprese soltanto le lavorazioni descritte e quantificate nell'offerta confermata.", c.included, c.excluded),
    protezione: block("Accessi e parti da proteggere", "Modalità e oneri da concordare per le condizioni reali del cantiere.", c.protection),
    controlli: block("I riscontri da concordare", "Controlli pertinenti alle opere effettivamente eseguite; prove e incarichi specialistici solo se previsti.", c.checks),
    documenti: block("Le informazioni a fine lavori", "Contenuti da definire nell'offerta. Nessuna certificazione è promessa in automatico.", c.documents),
    diario: block("Le fasi da documentare", "La documentazione fotografica è da concordare. Questo modello non contiene fotografie di un cantiere reale.", [
      ["Prima", `Zone interessate da ${FAC_MODULE_TITLES[id].toLowerCase()} e parti conservate.`],
      ["Durante", `Preparazioni e dettagli previsti: ${c.specs[1][0].toLowerCase()}.`],
      ["Dopo", "Porzioni eseguite, eventuali riserve e riferimenti alle varianti approvate."],
    ]),
    testata_garanzie: { occhiello: "Condizioni da verificare", titolo: "Materiali, impegni e limiti", intro: "Riferimenti da completare con i documenti dell'offerta effettiva." },
    testata_domande: { occhiello: FAC_MODULE_TITLES[id], titolo: "Prima di decidere", intro: "Otto risposte per chiarire il perimetro dell'intervento." },
    modulo_edizione: 1, modulo_intervento: id, modulo_foto_revisione: 1,
    // Material textures are not page photographs and are rejected by the shared chooser.
    // Keep only the cover plus actual assigned photos below; saved choices are untouched.
    modulo_foto: [{ url: c.cover, nome: `${FAC_MODULE_TITLES[id]} - illustrativa` }],
  };
  // Override every shared image fallback, including pages not enabled by default.
  for (const key of ["chiSiamo", "percorso", "recensioni", "computo", "compreso", "investimento", "garanzie", "tempi", "domande", "chiusura"]) blocks[`pagina_${key}`] = { senzaFoto: true };
  // Assign images to the native slots; the library alone does not put photographs in the PDF.
  const illustrated = (key: string, url: string, caption = FAC_IMAGE_NOTICE) => {
    blocks[key] = { ...(blocks[key] as ContenutoBlocco), foto: [url], senzaFoto: false, nota: caption };
  };
  const detailPhoto = id === "rifacimento" ? "/module-art/facciate-tinteggiatura-dettaglio.jpg"
    : id === "riparazioni" ? "/module-art/facciate-balconi-dettaglio.jpg" : c.cover;
  illustrated("comeFunziona", detailPhoto, id === "rifacimento"
    ? "Fase illustrativa di finitura esterna; non rappresenta tutte le preparazioni e i ripristini previsti. " + FAC_IMAGE_NOTICE
    : id === "riparazioni" ? "Ripristino illustrativo di una porzione intonacata; posizione, estensione e ciclo dipendono dal rilievo. " + FAC_IMAGE_NOTICE : FAC_IMAGE_NOTICE);
  illustrated("documenti", "/pdf-stock/comune/consegna-documenti.jpg");
  if (id === "interno") {
    illustrated("protezione", "/pdf-stock/comune/protezione-ambienti.jpg");
    illustrated("controlli", "/pdf-stock/comune/controllo-finale.jpg");
    illustrated("diario", "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg");
  } else {
    illustrated("protezione", "/module-art/serramenti-persiane-protezione.jpg", "Esempio illustrativo di protezione di davanzale e pavimento esterno; non rappresenta l'allestimento completo o il piano di sicurezza. " + FAC_IMAGE_NOTICE);
    illustrated("controlli", detailPhoto, "Dettaglio illustrativo delle superfici e dei raccordi da esaminare, non documentazione di prove o controlli eseguiti. " + FAC_IMAGE_NOTICE);
    illustrated("diario", detailPhoto, "Esempio illustrativo di una fase pertinente all'intervento; non è un prima/dopo né il diario di un lavoro aziendale. " + FAC_IMAGE_NOTICE);
  }
  blocks.pagina_percorso = { foto: ["/pdf-stock/comune/domande.jpg"], senzaFoto: false };
  blocks.pagina_chiusura = { foto: [id === "interno" ? "/pdf-stock/ristrutturazione/risultato.jpg" : "/module-art/facciate.jpg"], senzaFoto: false };
  // Include assigned images in the original editors' per-intervention chooser too.
  blocks.modulo_foto = [
    ...(blocks.modulo_foto as Array<{ url: string; nome: string }>),
    ...Object.values(blocks).flatMap(value => value && typeof value === "object" && "foto" in value
      ? ((value as { foto: string[] }).foto || []).map(url => ({ url, nome: `${url.split("/").pop()?.replace(/[-.]/g, " ")} - illustrativa` })) : []),
  ].filter((item, index, all) => all.findIndex(other => other.url === item.url) === index);
  blocks.modulo_defaults = structuredClone(blocks);
  return {
    id: `local-facciate-${id}`, company_id: base.company_id,
    ragione_sociale: base.ragione_sociale ?? null, indirizzo_completo: base.indirizzo_completo ?? null,
    telefono: base.telefono ?? null, email: base.email ?? null, partita_iva: base.partita_iva ?? null,
    logo_url: localLogo(base.logo_url), cover_logo_url: localLogo(base.cover_logo_url),
    color_primary: base.color_primary || "#465b50", color_secondary: base.color_secondary ?? null,
    color_accent: base.color_accent || "#99734d", color_text: "#24302b", font_family: base.font_family || "helvetica",
    chi_siamo: base.chi_siamo ?? null, chi_siamo_foto_url: null, show_chi_siamo: !!base.chi_siamo?.trim(),
    cover_title: c.title, cover_subtitle: c.subtitle, cover_image_url: c.cover,
    pdf_cover_eyebrow: "Facciate e isolamento · Esempio dimostrativo", pdf_cover_image_url: c.cover,
    pdf_cover_bg_color: "#34483e", pdf_cover_text_color: "#ffffff", pdf_cover_title_size: 34, pdf_cover_subtitle_size: 12,
    pdf_cover_overlay_opacity: 78, pdf_cover_overlay_style: "gradient", pdf_cover_text_align: "left", pdf_cover_text_vertical: "bottom",
    pdf_cover_show_decoration: false, pdf_cover_decoration_style: "none", pdf_cover_show_client_card: true,
    cover_logo_position: "top_left", cover_text_color: "#ffffff", cover_overlay_opacity: 78, cover_title_size: 34, cover_text_align: "left",
    esigenze: items(c.needs), soluzione: items(c.solution), usp: items([["Perimetro leggibile", "Quantità, esclusioni e varianti esplicitate prima della conferma."]]),
    percorso: items(c.stages), show_percorso: true,
    cronoprogramma: c.stages.map(([fase, descrizione]) => ({ fase, descrizione, durata: "Da concordare" })), show_cronoprogramma: true,
    garanzie: items([["Prodotti identificati", "Condizioni del produttore da verificare sui materiali effettivamente forniti."], ["Ambito definito", "Obblighi e limiti dell'intervento da riportare nell'offerta confermata, senza durate aggiuntive presunte."]]),
    faq: c.faq.map(([domanda, risposta]) => ({ domanda, risposta })), show_garanzie: true,
    testimonianze: [], gallery_lavori: [], show_margine: false, finanziamento_promo: null,
    payment_terms_text: "Modalità, importi e scadenze da concordare prima della conferma dell'offerta.", validity_text: FAC_FIXTURE_NOTICE,
    footer_text: "Esempio dimostrativo - non un'offerta", show_footer_version: false, show_footer_legal: false,
    default_iva_pct: 22, default_detrazione_pct: 0, default_validita_giorni: null,
    condizioni_legali_testo: null, condizioni_legali_attivo: false, modulo_recesso_attivo: false,
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(p => ({ chiave: p.chiave, visibile: !["recensioni", "lavori", "foto"].includes(p.chiave) })),
    pdf_pagine_libere: [], pdf_blocchi: blocks,
  };
}

/** Explicit opt-in update for early local drafts; never replace custom pictures or edited text. */
export function prepareFacPhotoRefresh(template: FullFacTemplate, id: FullFacModuleId) {
  const fresh = createFullFacTemplate({ company_id: template.company_id }, id).pdf_blocchi;
  const blocks = structuredClone(template.pdf_blocchi);
  const defaults = blocks.modulo_defaults as Record<string, unknown>;
  let added = 0;
  for (const key of ["comeFunziona", "protezione", "controlli", "documenti", "diario", "pagina_chiusura"]) {
    const previous = defaults?.[key] as ContenutoBlocco & { senzaFoto?: boolean } | undefined;
    const current = (blocks[key] ?? previous) as typeof previous;
    const candidate = fresh[key] as ContenutoBlocco;
    if (!previous || !current || current.foto?.length || previous.foto?.length) continue;
    if (JSON.stringify(current.foto ?? []) !== JSON.stringify(previous.foto ?? []) || current.senzaFoto !== previous.senzaFoto) continue;
    const photoFields = { foto: candidate.foto, senzaFoto: false, ...(!key.startsWith("pagina_") ? { nota: candidate.nota } : {}) };
    blocks[key] = { ...current, ...photoFields };
    defaults[key] = { ...previous, ...photoFields };
    added++;
  }
  if (added) {
    const library = (blocks.modulo_foto ?? []) as Array<{ url: string; nome: string }>;
    const available = fresh.modulo_foto as typeof library;
    blocks.modulo_foto = [...new Map([...available, ...library].map(photo => [photo.url, photo])).values()];
    blocks.modulo_foto_revisione = 1;
  }
  return { blocks, added };
}

export type FacPreviewRow = VoceComune & ComputoRigaInput;
export interface FacFixtureOptions { rows?: FacPreviewRow[]; discountPct?: number; manualPrice?: number }
export function facPriceFixture(id: FullFacModuleId): FacPreviewRow[] {
  return FAC_EDITORIAL[id].prices.map(([capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario], i) => ({
    id: `${id}-${i}`, capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario, importo: quantita * prezzo_unitario,
    sconto_pct: 0, costo_materiali: 0, costo_manodopera: 0,
  }));
}

/** Pure original adapter, explicit Facciate identity. No existing PDF hook (or network). */
export function buildFacModulePreview(companyId: string, template: FullFacTemplate, id: FullFacModuleId, options: FacFixtureOptions = {}): DocEdileDati {
  if (!isFullFacModuleId(id) || template.company_id !== companyId || template.id !== `local-facciate-${id}`) throw new Error("Azienda o modulo della bozza non corrispondente.");
  const rows = options.rows ?? facPriceFixture(id);
  const discount = Math.min(100, Math.max(0, options.discountPct ?? 0));
  const ivaPct = template.default_iva_pct ?? 22;
  const totals = calcTotaliComputo(rows, { sconto_pct: discount, iva_pct: ivaPct, prezzo_manuale: options.manualPrice });
  const chapters = [...new Set(rows.map(row => row.capitolo_nome))].map(nome => {
    const voci = rows.filter(row => row.capitolo_nome === nome);
    return { nome, voci, subtotale: calcTotaliComputo(voci, { sconto_pct: 0, iva_pct: 0 }).imponibile };
  });
  const data = costruisciDatiEdile({
    modulo: { chiave: "facciate", etichetta: "Facciate e isolamento", titoloCopertina: FAC_EDITORIAL[id].title, sottotitoloCopertina: FAC_EDITORIAL[id].subtitle, titoloComputo: "Lavorazioni e prezzi di esempio" },
    progetto: { code: "ESEMPIO", tipo_intervento: FAC_MODULE_TITLES[id], cliente_nome: "Cliente", cliente_cognome: "dimostrativo",
      cantiere_indirizzo: "Immobile dimostrativo", cantiere_citta: null, cantiere_provincia: null, cantiere_cap: null,
      immobile_tipo: id === "interno" ? "Ambiente interno" : "Prospetto esterno", immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null,
      mostra_finanziamento: false },
    template: { ...template, validity_text: `${FAC_FIXTURE_NOTICE}\n${template.validity_text === FAC_FIXTURE_NOTICE ? "" : template.validity_text || ""}`, default_validita_giorni: null,
      // Preview always remains illustrative, even if editable copy removes its notice.
      footer_text: "Esempio dimostrativo - non un'offerta", show_footer_version: false, show_footer_legal: false,
      condizioni_legali_attivo: !!template.condizioni_legali_attivo && !!template.condizioni_legali_testo?.trim() },
    azienda: null, capitoli: chapters, media: [],
    totali: { ...totals, ivaPct, scontoPct: discount, scontoEur: totals.imponibileLordo - totals.imponibile, detrazionePct: 0, detrazioneEur: 0 },
    schedaModulo: [{ etichetta: "Valori", valore: "Quantità e prezzi dimostrativi" }],
  });
  return data;
}
