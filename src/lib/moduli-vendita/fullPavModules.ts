import type { PavTemplatePdf, PavProgetto, PavComputoVoce, PavProgettoMedia } from "@/types/pavimenti";
import type { CoverPresetPatch } from "@/components/pavimenti/coverPresets";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import { PAV_EDITORIAL, PAV_OPERATIONAL_IMAGES, type PavEditorialPair } from "./pavEditorialContent";
export { PAV_EDITORIAL } from "./pavEditorialContent";

export const FULL_PAV_MODULES = ["sovrapposizione", "rifacimento", "resina", "parquet", "pareti", "esterni"] as const;
export type FullPavModuleId = typeof FULL_PAV_MODULES[number];
export const isFullPavModuleId = (id: string): id is FullPavModuleId => FULL_PAV_MODULES.some(value => value === id);
export const PAV_MODULE_TITLES = Object.fromEntries(FULL_PAV_MODULES.map(id => [id, PAV_EDITORIAL[id].title])) as Record<FullPavModuleId, string>;
export const PAV_MODULE_COVERS = Object.fromEntries(FULL_PAV_MODULES.map(id => [id, PAV_EDITORIAL[id].cover])) as Record<FullPavModuleId, string>;

export function createFullPavTemplate(base: Partial<PavTemplatePdf> & Pick<PavTemplatePdf, "company_id">, id: FullPavModuleId): PavTemplatePdf {
  const c = PAV_EDITORIAL[id];
  const items = (pairs: readonly PavEditorialPair[]) => pairs.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const illustration = "Immagine illustrativa: non documenta un lavoro aziendale. Materiali, lavorazioni e risultato sono quelli concordati nell'offerta.";
  const block = (titolo: string, intro: string, pairs: readonly PavEditorialPair[], photo: string, excluded: readonly PavEditorialPair[] = []) => ({
    occhiello: c.title, titolo, intro, voci: pairs.map(([titolo, testo]) => ({ titolo, testo, icona: "verifica" })),
    escluse: excluded.map(([titolo, testo]) => ({ titolo, testo })), foto: [photo], senzaFoto: false,
    nota: Object.values(PAV_OPERATIONAL_IMAGES).some(url => url === photo) ? illustration.replace("Immagine illustrativa:", "Immagine illustrativa generata con AI:") : illustration,
  });
  const protection = "/pdf-stock/comune/protezione-ambienti.jpg";
  const checks = id === "esterni" ? PAV_OPERATIONAL_IMAGES.esterni : "/pdf-stock/comune/giro-consegna.jpg";
  const documents = "/pdf-stock/comune/consegna-documenti.jpg";
  const closing = "/pdf-stock/comune/pulizia-consegna.jpg";
  const materials = id === "parquet" ? "/module-art/pavimenti.jpg" : id === "resina" || id === "pareti" ? c.detail : "/pdf-stock/pavimenti/materiali.jpg";
  const blocks: Record<string, unknown> = {
    modulo_edizione: 1, modulo_intervento: id,
    modulo_foto: [...new Set([c.cover, c.detail, materials, protection, checks, documents, closing])].map(url => ({ url, nome: `${c.title} · illustrativa` })),
    comeFunziona: block("La superficie. *Dal supporto alla finitura*.", c.subtitle, c.specs, c.detail),
    compreso: block("Il perimetro. *Voce per voce*.", c.scope, c.rows.map(([title, text]) => [title, text.replace(/dimostrativa/g, "concordata").replace(/dimostrativo/g, "concordato")] as const), materials, [["Lavorazioni aggiuntive", c.scope], ["Quantità e varianti", "Superfici, riparazioni e opere emerse dopo l'apertura si verificano e si concordano prima dell'esecuzione."]]),
    protezione: block("Preparare gli spazi. *Proteggere ciò che resta*.", "Prima dell'avvio concordiamo aree disponibili, accessi e protezioni in funzione delle lavorazioni previste.", c.protection, protection),
    controlli: block("Il risultato. *Da verificare insieme*.", "I riscontri riguardano le superfici e le lavorazioni effettivamente comprese nella proposta.", c.checks, checks),
    documenti: block("Le scelte. *Da conservare*.", "Raccogliamo i riferimenti dei materiali impiegati e le indicazioni utili alla cura della superficie.", c.documents, documents),
    diario: block("Le fasi. *Da documentare*.", "Se concordato, il diario raccoglierà foto reali del tuo intervento. L'immagine di questa pagina illustra una lavorazione, non un cantiere aziendale.", [["Prima", c.stages[0][1]], ["Durante", c.stages[2][1]], ["Alla consegna", c.stages[3][1]]], c.detail),
    ...Object.fromEntries(["computo", "percorso", "tempi", "garanzie", "domande", "chiSiamo"].map(page => [`pagina_${page}`, { senzaFoto: true }])),
    pagina_investimento: { foto: [c.cover], senzaFoto: false },
    pagina_chiusura: { foto: [closing], senzaFoto: false },
  };
  blocks.modulo_defaults = structuredClone(blocks);
  const result: PavTemplatePdf & CoverPresetPatch & { pdf_cover_hero: string | null; pdf_cover_subhero: string | null; pdf_cover_subhero_template: string | null; pdf_cover_eyebrow: string } = {
    logo_url: null, cover_logo_url: null, chi_siamo: null, chi_siamo_foto_url: null,
    ragione_sociale: null, indirizzo_completo: null, telefono: null, email: null, partita_iva: null,
    font_family: "helvetica", show_footer_version: false, show_footer_legal: false,
    payment_terms_text: "Modalità e scadenze da concordare nella proposta prima della conferma.",
    validity_text: "La validità dell'offerta è quella indicata nella proposta personalizzata.", footer_text: null,
    ...structuredClone(base), id: `local-pavimenti-${id}`,
    color_primary: base.color_primary || "#563e32", color_secondary: base.color_secondary || "#b66b42", color_accent: base.color_accent || "#94724e", color_text: base.color_text || "#292524",
    cover_title: c.hero, cover_subtitle: c.subtitle, cover_image_url: c.cover,
    cover_text_color: "#ffffff", cover_overlay_opacity: 0.65, cover_title_size: 35, cover_text_align: "left", cover_logo_position: "top_left",
    pdf_cover_hero: null, pdf_cover_subhero: null, pdf_cover_subhero_template: null,
    pdf_cover_image_url: c.cover, pdf_cover_eyebrow: c.title.toUpperCase(), pdf_cover_bg_color: "#563e32", pdf_cover_text_color: "#ffffff",
    pdf_cover_overlay_opacity: 65, pdf_cover_overlay_style: "gradient", pdf_cover_text_vertical: "bottom", pdf_cover_text_align: "left",
    pdf_cover_title_size: 35, pdf_cover_subtitle_size: 13, pdf_cover_eyebrow_size: 10, pdf_cover_decoration_style: "none", pdf_cover_logo_position: "top_left", pdf_cover_show_decoration: false, pdf_cover_show_client_card: true,
    condizioni_legali_attivo: false, condizioni_legali_testo: null, modulo_recesso_attivo: false,
    default_iva_pct: 22, default_detrazione_pct: 0, default_validita_giorni: 30,
    show_chi_siamo: !!base.chi_siamo?.trim(), show_margine: false, show_garanzie: true, show_percorso: true, show_cronoprogramma: true,
    esigenze: items(c.specs.slice(0, 3)), soluzione: items(c.specs.slice(1)),
    usp: items([["Scelte su campione", c.specs[2][1]], ["Perimetro definito", c.scope], ["Cura dopo la posa", c.stages[3][1]]]),
    percorso: items(c.stages), cronoprogramma: c.stages.map(([fase, descrizione]) => ({ fase, descrizione, durata: "Da concordare" })),
    garanzie: items([["Materiali identificati", c.documents[0][1]], ["Supporto valutato", c.specs[0][1]], ["Riscontro alla consegna", c.checks[1][1]], ["Cura della superficie", c.documents[3][1]]]),
    faq: c.faq.map(([domanda, risposta]) => ({ domanda, risposta })), testimonianze: [], gallery_lavori: [], finanziamento_promo: null, pdf_pagine_libere: [],
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(p => ({ chiave: p.chiave, visibile: true })), pdf_blocchi: blocks,
  };
  return result;
}

/** Same payload for tab preview, live preview, dialog and offline PDF QA. */
export function buildPavModulePreview(companyId: string, template: PavTemplatePdf, id: FullPavModuleId) {
  const c = PAV_EDITORIAL[id];
  const progetto: PavProgetto = { id: "preview", company_id: companyId, code: "PAV-DEMO", stato: "bozza", tipo_intervento: c.title,
    tipo_materiale: c.material, numero_ambienti: null, cliente_nome: "Cliente", cliente_cognome: "dimostrativo", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: null, cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null,
    immobile_tipo: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null, massimale_detrazione: null,
    opportunita_id: null, cliente_id: null, template_id: null, sconto_pct: 0, iva_pct: template.default_iva_pct ?? 22, detrazione_pct: 0, totale_imponibile: 0, totale: 0,
    note: "ANTEPRIMA DIMOSTRATIVA: quantità, materiali, prezzi e IVA sono esempi da confermare. Non è un'offerta da inviare." };
  const computo = c.rows.map(([capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario], i): PavComputoVoce => ({ id: `demo-${i}`, progetto_id: "preview", company_id: companyId, ordine: i, capitolo_nome, descrizione, unita_misura, quantita, prezzo_unitario, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: quantita * prezzo_unitario, margine_eur: 0, margine_pct: 0, listino_voce_id: null }));
  return { progetto, computo, media: [] as PavProgettoMedia[],
    template: { ...template, validity_text: `ANTEPRIMA DIMOSTRATIVA: quantità, materiali, prezzi e IVA sono esempi, non un'offerta. ${template.validity_text ?? ""}`.trim() },
    localOnly: true as const };
}
