/**
 * Template HTML del preventivo Fotovoltaico v2 — pagine A4 configurabili.
 * Replica fedele del riferimento /Users/florinandriciuc/Downloads/preventivo-fv-mario-rossi-v2.html
 *
 * L'output è un singolo HTML self-contained (CSS inline, SVG inline)
 * stampabile direttamente come PDF dal browser via window.print() / Ctrl+P
 * grazie a @page A4 + print-color-adjust: exact.
 */

import { MODULO_RECESSO } from "./condizioniStandard.ts";
import { eFotoDiSerie, leggiBlocco, leggiFotoPagina, PAGINE_BLOCCO, type PaginaBlocco } from "./blocchiPreventivo.ts";
import { iconaSvg } from "./iconePreventivo.ts";
import {
  ORO_STELLE, PUNTI_STELLA, indirizzoDaLeggere, leggiVotiOnline, recensioniScritte, stellePiene, votoScritto, type VotoOnline,
} from "./recensioniOnline.ts";
import { normalizeFvPdfPagesOrder, type FvPdfPageOrderItem } from "./fvPagine.ts";
export {
  FV_PDF_PAGES_DEFAULT, FV_PDF_PAGES_META, normalizeFvPdfPagesOrder,
  type FvPdfPageId, type FvPdfPageMeta, type FvPdfPageOrderItem,
} from "./fvPagine.ts";
import {
  fmtEur,
  fmtNum,
  fmtPct,
  fmtData,
  escHtml,
  calcolaProducibilitaMensile,
  calcolaCO2Equivalenze,
  calcolaCosti20Anni,
  calcolaBollettaPrimaDopo,
  type FvFlows,
} from "./fvCalcoli.ts";
import { normalizzaHex, fondoPerTestoBianco, scurisci, schiarisci, testoSuChiaro, testoSuScuro, rgbElenco } from "./temaColori.ts";
import {
  svgProducibilitaMensile,
  svgSankeyDoveVa,
  svgSankeyDaDoveViene,
  svgCosti20Anni,
  svgCassaCumulata,
  svgForbice,
  svgRataRisparmio,
  svgVistaSatellitareMock,
  svgVistaLayoutReale,
  svgProdottoIcona,
} from "./fvSvgCharts.ts";

// ─── Tipi del data context ────────────────────────────────────────────────

/** Le foto di serie del documento: file in public/pdf-stock/fotovoltaico del sito. */
export const FOTO_DI_SERIE_FV = {
  alberi: "co2-alberi.jpg",
  voli: "co2-voli.jpg",
  auto: "co2-auto.jpg",
  bosco: "co2-bosco.jpg",
  installatori: "fasi-installatori.jpg",
  impianto: "investimento-impianto.jpg",
} as const;

/**
 * I badge delle garanzie, uno per l'icona scelta nel modello: file in
 * public/pdf-stock/badge del sito. Prendono il posto delle sigle di testo
 * («PV», «kWh», «FER», «★») che facevano da icona.
 */
export const BADGE_GARANZIE_FV = {
  sun: "energia-solare.png",
  award: "durata-nel-tempo.png",
  clock: "tempi-rapidi.png",
  tools: "installatori-qualificati.png",
  battery: "energia-elettrica.png",
  shield: "qualita-verificata.png",
} as const;

/** Gli indirizzi dei badge a partire dall'origine del sito (anteprime dell'editor). */
export function badgeGaranzieDalSito(origine: string): Record<keyof typeof BADGE_GARANZIE_FV, string> {
  const base = `${origine.replace(/\/+$/, "")}/pdf-stock/badge`;
  return Object.fromEntries(
    Object.entries(BADGE_GARANZIE_FV).map(([icona, file]) => [icona, `${base}/${file}`]),
  ) as Record<keyof typeof BADGE_GARANZIE_FV, string>;
}

/** Gli indirizzi delle foto di serie a partire dall'origine del sito (anteprime dell'editor). */
export function fotoDiSerieDalSito(origine: string): Record<keyof typeof FOTO_DI_SERIE_FV, string> {
  const base = `${origine.replace(/\/+$/, "")}/pdf-stock/fotovoltaico`;
  return Object.fromEntries(
    Object.entries(FOTO_DI_SERIE_FV).map(([chiave, file]) => [chiave, `${base}/${file}`]),
  ) as Record<keyof typeof FOTO_DI_SERIE_FV, string>;
}

/**
 * Le foto dei blocchi accesi nell'ordine delle pagine, così come stanno nel
 * modello (foto di serie «/pdf-stock/…» o foto dell'azienda già firmate):
 * al massimo due per blocco. Il generatore le incorpora, le anteprime le
 * completano con l'origine del sito.
 */
export function fotoDeiBlocchiFv(template: FvPdfTemplateData["template"] | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const page of normalizeFvPdfPagesOrder(template?.pdf_pages_order)) {
    if (!page.visible || !(page.id in PAGINE_BLOCCO)) continue;
    const chiave = PAGINE_BLOCCO[page.id as PaginaBlocco];
    out[chiave] = leggiBlocco(chiave, "fotovoltaico", template?.pdf_blocchi).foto.slice(0, 2);
  }
  return out;
}

/** Le pagine del documento che hanno una foto loro (di serie, cambiabile dall'azienda). */
export const PAGINE_CON_FOTO_FV = ["garanzie", "bollette", "decisione", "componenti", "costi", "cassa", "piano", "faq", "risparmio", "produzione", "recensioni"] as const;
export type PaginaConFotoFv = (typeof PAGINE_CON_FOTO_FV)[number];

/**
 * La foto di ogni pagina così come sta nel modello (foto di serie «/pdf-stock/…» o
 * foto dell'azienda già firmata), o null se l'azienda l'ha tolta.
 */
export function fotoDellePagineFv(template: FvPdfTemplateData["template"] | null | undefined): Record<PaginaConFotoFv, string | null> {
  return Object.fromEntries(
    PAGINE_CON_FOTO_FV.map((pagina) => [pagina, leggiFotoPagina(pagina, "fotovoltaico", template?.pdf_blocchi)]),
  ) as Record<PaginaConFotoFv, string | null>;
}

/** Le foto delle pagine con l'indirizzo completo del sito (anteprime dell'editor). */
export function fotoPagineDalSito(
  origine: string,
  template: FvPdfTemplateData["template"] | null | undefined,
): NonNullable<FvPdfTemplateData["foto_pagine"]> {
  const base = origine.replace(/\/+$/, "");
  return Object.fromEntries(
    Object.entries(fotoDellePagineFv(template)).map(([pagina, u]) => [pagina, u && u.startsWith("/") ? `${base}${u}` : u]),
  );
}

/** Le foto dei blocchi con l'indirizzo completo del sito (anteprime dell'editor). */
export function fotoBlocchiDalSito(
  origine: string,
  template: FvPdfTemplateData["template"] | null | undefined,
): NonNullable<FvPdfTemplateData["blocchi_foto"]> {
  const base = origine.replace(/\/+$/, "");
  return Object.fromEntries(
    Object.entries(fotoDeiBlocchiFv(template)).map(([chiave, foto]) => [
      chiave,
      foto.map((u) => ({ src: u.startsWith("/") ? `${base}${u}` : u, diSerie: eFotoDiSerie(u) })),
    ]),
  );
}

export interface FvPdfTemplateData {
  azienda: {
    name: string;
    tagline?: string;
    pec?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    vat_number?: string | null;
  };
  cliente: {
    nome: string;
    cognome: string;
    cf?: string | null;
    indirizzo: string;
    comune?: string | null;
    cap?: string | null;
    provincia?: string | null;
    tipologia_immobile?: string | null;
  };
  progetto: {
    numero: string;
    titolo: string;
    creato_il: string;
    valido_giorni: number;
    venditore?: string | null;
    potenza_kwp: number;
    numero_pannelli: number;
    has_accumulo: boolean;
    capacita_accumulo_kwh: number;
    consumo_annuo_kwh: number;
    costo_kwh_attuale: number;
    profilo_consumo?: string | null;
    ore_sole_annue?: number | null;
    superficie_tetto_disponibile_mq?: number | null;
    azimut?: string | null; // es. "SE 28°"
    inclinazione_tetto?: number | null;
    fonte_dati_tetto?: string | null;
    qualita_dati_tetto?: string | null;
    imagery_date?: string | null;
    tetto_mock?: boolean | null;
    /** Layout reale pannelli (coordinate Google Solar API) — opzionale; se presente
     *  abilita la vista zenitale REALE al posto del mock. Da popolare in
     *  fv-genera-pdf quando il layout è persistito. */
    layout_pannelli?: Array<{
      centro_lat: number;
      centro_lng: number;
      orientamento?: "LANDSCAPE" | "PORTRAIT";
      segment_index?: number;
    }> | null;
  };
  /** Immagini satellitari reali come data:image/png;base64 — opzionale.
   *  Se presenti sostituiscono gli SVG mock nella pagina "Anteprima impianto". */
  map_images?: {
    close?: string;    // zoom 20 — zenitale ravvicinata
    medium?: string;   // zoom 18 — vista aerea
    overview?: string; // zoom 17 — via/strada
    wide?: string;     // zoom 15 — panoramica zona
  } | null;
  /** Foto cantieri installati (da cantieri_galleria del template) come data:image/...;base64 */
  cantieri_foto?: string[];
  /** Il voto su Google, Trustpilot… del Profilo azienda (companies.recensioni_online), com'è salvato. */
  voti_online?: unknown;
  /** Bundle/kit scelto — popolato quando kit_bundle_id è impostato sul progetto */
  bundle?: {
    nome: string;
    descrizione?: string | null;
    fv_kwp?: number | null;
    fv_accumulo_kwh?: number | null;
    cover_b64?: string | null;
    voci?: Array<{ descrizione: string; quantita: number; foto?: string | null }>;
  } | null;
  costi: {
    prezzo_vendita_iva_inclusa: number;
    iva_perc: number;
    /** Prezzo scritto a mano o del kit: nel PDF le righe non portano importi. */
    prezzo_a_corpo?: boolean;
    /** Sconto sul totale: i prezzi delle righe sarebbero quelli prima dello sconto. */
    sconto_applicato?: boolean;
    detrazione_eur: number;
    detrazione_perc: number;
    costo_netto_dopo_detrazione: number;
  };
  /** Solo con un finanziamento vero, cioè rata e durata salvate: senza, nel PDF
   *  non compaiono rata, TAN, TAEG né la pagina del piano economico. */
  finanziamento?: {
    finanziaria: string;
    durata_mesi: number;
    rata_mensile: number;
    /** null = non disponibile: si stampa «n.d.», mai un tasso inventato. */
    tan_perc: number | null;
    taeg_perc: number | null;
    importo_finanziato: number;
  } | null;
  /** Schema di pagamento — adattivo alla modalità. Importi già calcolati. */
  modalita_pagamento?:
    | { tipo: "diretto"; tranche: Array<{ label: string; pct: number; importo_eur: number }>; note: string | null }
    | { tipo: "finanziato"; anticipo_pct: number; anticipo_eur: number; finanziato_eur: number; rata_mensile: number; durata_mesi: number; tasso_zero: boolean; note: string | null }
    | { tipo: "noleggio"; canone_mensile: number; durata_mesi: number; note: string | null }
    | null;
  scenario: {
    risparmio_mensile_eur: number;
    risparmio_anno1_eur: number;
    risparmio_25_anni_eur: number;
    payback_anni: number | null;
    npv_25_anni: number;
    cassa_anno_per_anno: Array<{ anno: number; cumulato: number }>;
    /** Quello che il GSE paga per l'energia immessa, primo anno (fv_calcolo_finanziario.ricavi_rid_eur). */
    ricavi_rid_anno1_eur?: number | null;
    /** Inflazione annua dell'energia del calcolo, come frazione (0,025 = 2,5%). */
    inflazione_energia_pct?: number | null;
  };
  flows: FvFlows;
  /** Gli stessi flussi senza batteria, calcolati con lo stesso modello e gli stessi
   *  dati: servono a dire quanto cambia l'accumulo con numeri veri. Assenti nelle
   *  anteprime con dati finti: allora la frase non ne stampa. */
  flows_senza_accumulo?: FvFlows | null;
  /** Le foto delle pagine (garanzie, perché farlo ora, pagina finale): data URI nel
   *  generatore, indirizzi del sito nelle anteprime. Null o assente: la pagina è senza. */
  foto_pagine?: Partial<Record<PaginaConFotoFv, string | null>> | null;
  /** I badge delle garanzie per icona (BADGE_GARANZIE_FV): data URI nel generatore,
   *  indirizzi del sito nelle anteprime. Senza, la scheda usa la sigla di testo. */
  badge_garanzie?: Partial<Record<keyof typeof BADGE_GARANZIE_FV, string | null>> | null;
  /** Le foto dei blocchi accesi (come funziona, sicurezza sul tetto…), già pronte:
   *  data URI nel generatore, indirizzi del sito nelle anteprime. Una foto che non
   *  è arrivata non c'è, e il blocco esce senza. */
  blocchi_foto?: Record<string, Array<{ src: string; diSerie: boolean }>> | null;
  /** Le foto di serie del documento (public/pdf-stock/fotovoltaico), già incorporate
   *  dal generatore come data URI. Una che manca: quella pagina usa il disegno di prima. */
  foto_di_serie?: {
    alberi?: string | null;
    voli?: string | null;
    auto?: string | null;
    bosco?: string | null;
    installatori?: string | null;
    impianto?: string | null;
  } | null;
  componenti: Array<{
    articolo_id?: string | null;
    categoria: string;
    descrizione: string;
    marca?: string | null;
    modello?: string | null;
    quantita: number;
    potenza_w?: number | null;
    capacita_kwh?: number | null;
    garanzia_anni?: number | null;
    image_url?: string | null;
    articolo_descrizione_estesa?: string | null;
    scheda_tecnica_url?: string | null;
  }>;
  servizi?: Array<{
    tipo?: string | null;
    descrizione: string;
    quantita?: number | null;
    prezzo_vendita?: number | null;
    note_operative?: string | null;
  }>;
  template?: {
    logo_url?: string | null;
    pdf_cover_hero?: string | null;
    pdf_cover_subhero?: string | null;
    pdf_cover_subhero_template?: string | null;
    pdf_cover_eyebrow?: string | null;
    pdf_cover_image_url?: string | null;
    pdf_cover_overlay_opacity?: number | null;
    pdf_cover_bg_color?: string | null;
    pdf_cover_text_color?: string | null;
    /** Colori del marchio scelti nell'editor. Fino al 20/09/2026 si salvavano e
     *  nessuno li leggeva: il documento usciva sempre blu e arancio. */
    colore_primario?: string | null;
    colore_accento?: string | null;
    pdf_cover_text_align?: string | null;
    pdf_cover_logo_position?: string | null;
    pdf_cover_show_client_card?: boolean | null;
    // Parità layout cover con l'editor (migration 20271109000000_fv_cover_parity).
    pdf_cover_show_decoration?: boolean | null;
    pdf_cover_text_vertical?: string | null;
    pdf_cover_overlay_style?: string | null;
    pdf_cover_title_size?: number | null;
    pdf_cover_subtitle_size?: number | null;
    pdf_cover_eyebrow_size?: number | null;
    presentazione_impresa_html?: string | null;
    foto_team_url?: string | null;
    chi_siamo_titolo?: string | null;
    recensioni?: Array<{
      quote?: string | null;
      autore?: string | null;
      citta?: string | null;
      intervento?: string | null;
      foto_url?: string | null;
    }> | null;
    certificazioni?: Array<{
      nome?: string | null;
      ente?: string | null;
    }> | null;
    render_disclaimer?: string | null;
    percorso_cliente_intro?: string | null;
    consulente_descrizione_default?: string | null;
    pdf_cta_finale_titolo?: string | null;
    pdf_cta_finale_testo?: string | null;
    pdf_pages_order?: Array<{
      id?: string | null;
      visible?: boolean | null;
    }> | null;
    /** I blocchi del preventivo: solo i campi che l'azienda ha cambiato (_shared/blocchiPreventivo.ts). */
    pdf_blocchi?: Record<string, unknown> | null;
    valore_proposta_html?: string | null;
    garanzie_conversione?: Array<{
      titolo?: string | null;
      descrizione?: string | null;
      icona?: string | null;
    }> | null;
    faq_items?: Array<{
      domanda?: string | null;
      risposta?: string | null;
    }> | null;
    usp?: Array<{
      titolo?: string | null;
      descrizione?: string | null;
    }> | null;
    cronoprogramma?: Array<{
      fase?: string | null;
      durata?: string | null;
      descrizione?: string | null;
    }> | null;
    condizioni_legali_attivo?: boolean | null;
    condizioni_legali_testo?: string | null;
    /** Il modulo di recesso, acceso dall'azienda nel modello (spento di serie). */
    modulo_recesso_attivo?: boolean | null;
    urgenza_attiva?: boolean | null;
    urgenza_titolo?: string | null;
    urgenza_descrizione?: string | null;
    noleggio_note_legali?: string | null;
    listino_macrocategorie_fv?: Array<{
      nome?: string | null;
      descrizione?: string | null;
      descrizione_estesa?: string | null;
      immagine_url?: string | null;
      categoria_tipo?: string | null;
      mostra_pagina_dedicata_pdf?: boolean | null;
    }> | null;
  };
}

// ─── Helpers stile ─────────────────────────────────────────────────────────

const STYLE = `
@page { size: A4; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  font-family: 'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 10pt;
  color: #0F172A;
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
h1, h2, h3, h4 { font-family: 'Outfit', -apple-system, sans-serif; letter-spacing: -0.02em; }

@media screen {
  body { background: #E2E8F0; padding: 74px 0 36px; }
  .page { margin: 0 auto 10mm; box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18); }
}

@media print {
  body { background: white; padding: 0; }
  .pdf-action-bar { display: none !important; }
  .page { margin: 0; box-shadow: none; }
}

.pdf-action-bar {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  z-index: 9999; width: min(1120px, calc(100vw - 24px));
  min-height: 50px; padding: 9px 12px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: rgba(255, 255, 255, 0.96); border: 1px solid #CBD5E1; border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18); backdrop-filter: blur(12px);
}
.pdf-action-meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 8.5pt; color: #64748B; }
.pdf-action-meta strong { color: #0F172A; font-size: 9.5pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pdf-action-links { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.pdf-action-links a, .pdf-action-links button {
  border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 10px;
  background: white; color: #1E3A5F; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer;
}
.pdf-action-links button { background: #F97316; border-color: #F97316; color: white; }
@media screen and (max-width: 720px) {
  body { padding-top: 112px; }
  .pdf-action-bar { align-items: flex-start; flex-direction: column; }
  .pdf-action-links { width: 100%; flex-wrap: wrap; }
  .pdf-action-links a, .pdf-action-links button { flex: 1 1 130px; text-align: center; }
}

.page {
  width: 210mm; height: 297mm;
  page-break-after: always;
  position: relative; overflow: hidden;
  background: white;
}
.page:last-child { page-break-after: auto; }

.page-header {
  position: absolute; top: 0; left: 0; right: 0;
  padding: 9mm 16mm 4mm;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1.2px solid #CBD5E1;
}
.page-header .brand { display: flex; align-items: center; gap: 7px; font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 11pt; color: #1E3A5F; }
.page-header .brand-icon { width: 20px; height: 20px; border-radius: 4px; background: linear-gradient(135deg, #F97316 0%, #FBBF24 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700; }
.page-header .ref { font-size: 8pt; color: #64748B; }
.page-header .ref strong { color: #0F172A; }

.page-footer {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 4mm 16mm 5mm;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 7.5pt; color: #94A3B8;
  border-top: 1.2px solid #CBD5E1;
}
.page-footer .pnum { font-weight: 700; color: #1E3A5F; }
/* padding-top staccato dall'header (~18mm alto) così la linea non taglia l'eyebrow */
.content { padding: 23mm 16mm 21mm; height: 100%; display: flex; flex-direction: column; }
/* Un blocco non si accorcia mai per far posto agli altri: nella colonna flessibile
   il riquadro dell'offerta, su una pagina piena, si schiacciava e il prezzo spariva. */
.content > * { flex-shrink: 0; }
/* Il riquadro che chiude la pagina (la conclusione) sta in fondo: il bianco va fra
   il contenuto e la conclusione, non tutto sotto. Prima ogni pagina aveva un
   35-45% di bianco in fondo e sembrava lasciata a metà. Solo i riquadri di
   conclusione: una tabella o una scheda spinte giù lascerebbero un buco nel mezzo. */
.content > .callout:last-child:not(:first-child) { margin-top: auto; }

.eyebrow { font-size: 8pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #F97316; margin-bottom: 4px; }
.page-title { font-size: 25pt; font-weight: 800; color: #1E3A5F; letter-spacing: -0.03em; line-height: 1.05; margin-bottom: 3mm; }
.page-subtitle { font-size: 10.5pt; color: #64748B; margin-bottom: 5mm; font-weight: 500; }
p { margin-bottom: 2mm; }

/* COVER */
.cover { background: linear-gradient(135deg, #0F2542 0%, #1E3A5F 60%, #2C5184 100%); color: white; height: 100%; position: relative; overflow: hidden; }
.cover::before { content: ""; position: absolute; top: -20%; right: -20%; width: 80%; height: 80%; background: radial-gradient(circle, rgba(249,115,22,0.4) 0%, transparent 60%); }
.cover::after { content: "☀"; position: absolute; top: 25mm; right: 25mm; font-size: 100pt; opacity: 0.15; color: #FBBF24; }
.cover--flat::after { content: none; }
.cover-bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cover-overlay { position: absolute; inset: 0; }
.cover-content { position: relative; padding: 24mm 22mm; height: 100%; display: flex; flex-direction: column; }
.cover-brand { display: flex; align-items: center; gap: 14px; margin-bottom: auto; }
.cover-brand .icon { width: 54px; height: 54px; border-radius: 13px; background: linear-gradient(135deg, #F97316 0%, #FBBF24 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 26px; }
.cover-brand .logo-img { width: 54px; height: 54px; border-radius: 13px; object-fit: contain; background: rgba(255,255,255,0.9); padding: 5px; }
.cover-brand .name { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 20pt; }
.cover-brand .tagline { font-size: 9.5pt; opacity: 0.7; margin-top: 2px; }
.cover-main { margin-top: auto; }
.cover-eyebrow { font-size: 10pt; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #FBBF24; margin-bottom: 8mm; }
.cover h1 { font-size: 46pt; font-weight: 800; letter-spacing: -0.04em; line-height: 1; color: white; margin-bottom: 5mm; }
.cover .subtitle { font-size: 16pt; opacity: 0.85; line-height: 1.3; margin-bottom: 14mm; max-width: 75%; }
.cover-client { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 10mm 12mm; margin-bottom: 6mm; }
.cover-client .client-label { font-size: 8.5pt; letter-spacing: 0.15em; text-transform: uppercase; color: #FBBF24; margin-bottom: 4px; }
.cover-client .client-name { font-family: 'Outfit', sans-serif; font-size: 20pt; font-weight: 700; margin-bottom: 3px; }
.cover-client .client-meta { font-size: 10.5pt; opacity: 0.85; }
.cover-footer { display: flex; justify-content: space-between; align-items: flex-end; font-size: 9.5pt; opacity: 0.85; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 5mm; }
.cover-footer .doc-meta strong { color: #FBBF24; }

.invest-hero { background: linear-gradient(135deg, #FEF3C7 0%, #FED7AA 100%); border-radius: 12px; padding: 9mm 11mm; margin-bottom: 4mm; position: relative; overflow: hidden; }
.invest-hero::after { content: "€"; position: absolute; right: 8mm; top: 50%; transform: translateY(-50%); font-size: 100pt; color: rgba(249,115,22,0.15); font-weight: 800; font-family: 'Outfit', sans-serif; }
.invest-hero .label { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #C2410C; margin-bottom: 2mm; }
.invest-hero .price { font-family: 'Outfit', sans-serif; font-size: 48pt; font-weight: 800; color: #C2410C; line-height: 1; letter-spacing: -0.04em; margin-bottom: 2mm; }
.invest-hero .desc { font-size: 9.5pt; color: #7C2D12; max-width: 70%; }

.kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; margin: 3mm 0; }
.kpi-row.cols-2 { grid-template-columns: repeat(2, 1fr); }
.kpi-row.cols-4 { grid-template-columns: repeat(4, 1fr); }
.kpi-row.grandi .kpi-block { padding: 4mm; }
.kpi-row.grandi .kpi-value { font-size: 19pt; }
.kpi-block { background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 3.5mm; }
.kpi-block .kpi-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 1px; }
.kpi-block .kpi-value { font-family: 'Outfit', sans-serif; font-size: 16pt; font-weight: 700; color: #1E3A5F; line-height: 1.05; }
.kpi-block .kpi-value .unit { font-size: 9pt; color: #64748B; font-weight: 500; }
.kpi-block.orange .kpi-value { color: #F97316; }
.kpi-block.green .kpi-value { color: #16A34A; }
.kpi-block .kpi-sub { font-size: 7.5pt; color: #64748B; margin-top: 0.5mm; }

.kpi-big { background: #DCFCE7; border: 1px solid #BBF7D0; border-radius: 10px; padding: 4mm 5mm; }
.kpi-big.orange { background: #FFEDD5; border-color: #FDBA74; }
.kpi-big.red { background: #FEE2E2; border-color: #FECACA; }
.kpi-big .kbig-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #166534; margin-bottom: 1mm; }
.kpi-big.orange .kbig-label { color: #C2410C; }
.kpi-big.red .kbig-label { color: #991B1B; }
.kpi-big .kbig-value { font-family: 'Outfit', sans-serif; font-size: 30pt; font-weight: 800; color: #166534; line-height: 1; letter-spacing: -0.02em; }
.kpi-big.orange .kbig-value { color: #C2410C; }
.kpi-big.red .kbig-value { color: #991B1B; }
.kpi-big .kbig-sub { font-size: 8pt; color: #166534; margin-top: 1.5mm; }
.kpi-big.orange .kbig-sub { color: #7C2D12; }
.kpi-big.red .kbig-sub { color: #7F1D1D; }

/* I blocchi della libreria: una o due foto, poi le voci con l'icona in un cerchio dell'accento.
   La fascia delle foto prende lo spazio che resta nella pagina: una foto a tutta
   larghezza fino a 150 mm, due affiancate fino a 110. Meglio una foto un po'
   tagliata che mezza pagina bianca (22/09/2026); la pagina non sborda mai. */
.blocco-titolo .accento { color: #C2410C; }
.content > .blocco-foto { flex: 1 1 0; min-height: 50mm; max-height: 150mm; display: flex; gap: 4mm; margin: 1mm 0 1.5mm; }
.content > .blocco-foto.due { max-height: 110mm; }
.blocco-foto img { flex: 1 1 0; min-width: 0; height: 100%; object-fit: cover; border-radius: 10px; display: block; }
.blocco-nota { font-size: 6.5pt; color: #94A3B8; margin-bottom: 4mm; }
.blocco-voci { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm; margin-top: 2mm; }
.blocco-voci.tre { grid-template-columns: repeat(3, 1fr); }
.blocco-voce { display: flex; gap: 3mm; align-items: flex-start; break-inside: avoid; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 3mm 3.5mm; }
.blocco-icona { width: 8.5mm; height: 8.5mm; border-radius: 50%; background: #FFEDD5; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.blocco-voce-titolo { font-family: 'Outfit', sans-serif; font-size: 10.5pt; font-weight: 700; color: #1E3A5F; line-height: 1.25; padding-top: 0.6mm; }
.blocco-voci.tre .blocco-voce-titolo { font-size: 9.5pt; padding-top: 1.8mm; }
.blocco-voce-testo { font-size: 8.8pt; color: #475569; line-height: 1.45; margin-top: 0.8mm; }

.callout { border-radius: 8px; padding: 3.5mm 4.5mm; margin: 4mm 0; font-size: 9.5pt; display: flex; gap: 2.5mm; align-items: flex-start; }
.callout-icon { font-size: 12pt; line-height: 1; flex-shrink: 0; }
.callout-success { background: #DCFCE7; border-left: 3px solid #16A34A; color: #166534; }
.callout-tip { background: #FFEDD5; border-left: 3px solid #F97316; color: #C2410C; }
.callout-info { background: #DBEAFE; border-left: 3px solid #3B82F6; color: #1E3A8A; }
.callout > div > strong:first-child { display: block; margin-bottom: 0.5mm; font-size: 9.5pt; }
.page-title sub { font-size: 0.55em; line-height: 0; position: relative; bottom: -0.12em; vertical-align: baseline; letter-spacing: 0; }
.rich-text p { margin-bottom: 1.5mm; }
.rich-text ul, .rich-text ol { padding-left: 5mm; margin: 1.5mm 0; }
.rich-text li { margin-bottom: 0.8mm; }

.source-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; margin: 2.5mm 0; }
.source-cell { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 7px; padding: 2.4mm 3mm; }
.source-cell .source-label { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748B; margin-bottom: 0.8mm; }
.source-cell .source-value { font-size: 9pt; font-weight: 700; color: #1E3A5F; line-height: 1.25; }

.service-list { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin: 2.5mm 0 3mm; }
.service-item { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 2.6mm 3mm; min-height: 18mm; }
.service-title { font-size: 8.8pt; font-weight: 700; color: #1E3A5F; margin-bottom: 0.8mm; }
.service-meta { font-size: 7.2pt; color: #64748B; line-height: 1.35; }

table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 2.5mm 0; }
table th { background: #1E3A5F; color: white; padding: 2mm 3mm; text-align: left; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }
table th:first-child { border-top-left-radius: 6px; }
table th:last-child { border-top-right-radius: 6px; }
table td { padding: 1.8mm 3mm; border-bottom: 1px solid #E2E8F0; }
table tr:nth-child(even) td { background: #F8FAFC; }
table .num-cell { text-align: right; font-family: 'Outfit', sans-serif; font-weight: 600; }
table tr.row-total td { font-weight: 700; background: #F1F5F9 !important; border-top: 2px solid #1E3A5F; }
table .saving { color: #16A34A; font-weight: 700; }
table .saving-zero { color: #64748B; }

.bullets { padding-left: 4mm; }
.bullets li { position: relative; padding: 1mm 0 1mm 6mm; list-style: none; font-size: 9pt; }
.bullets li::before { content: "✓"; position: absolute; left: 0; color: #16A34A; font-weight: 700; font-size: 10pt; }

.chart-svg { width: 100%; height: auto; display: block; }
.chart-card { background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 5mm; margin: 4mm 0; }
.chart-card .chart-title { font-size: 10pt; font-weight: 700; color: #1E3A5F; margin-bottom: 1mm; }
.chart-card .chart-sub { font-size: 7.5pt; color: #64748B; margin-bottom: 2mm; }

.split-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; margin: 3mm 0; }
.split-3 .num-card { border-radius: 8px; padding: 3.5mm; text-align: center; }
.split-3 .num-card.navy { background: #DBEAFE; }
.split-3 .num-card.green { background: #DCFCE7; }
.split-3 .num-card.orange { background: #FFEDD5; border: 2px solid #F97316; }
.split-3 .num-card .nc-label { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 1.5mm; }
.split-3 .num-card .nc-value { font-family: 'Outfit', sans-serif; font-size: 20pt; font-weight: 800; line-height: 1; }
.split-3 .num-card.navy .nc-value { color: #1E3A5F; }
.split-3 .num-card.green .nc-value { color: #16A34A; }
.split-3 .num-card.orange .nc-value { color: #C2410C; }
.split-3 .num-card .nc-period { font-size: 7.5pt; color: #64748B; margin-top: 1.5mm; }

.tl { position: relative; padding-left: 24px; margin: 2.5mm 0; }
.tl::before { content: ""; position: absolute; left: 7px; top: 5px; bottom: 5px; width: 2px; background: #E2E8F0; }
.tl-item { position: relative; padding: 1.8mm 0; }
.tl-item::before { content: ""; position: absolute; left: -22px; top: 3mm; width: 9px; height: 9px; border-radius: 50%; background: white; border: 2.5px solid #F97316; }
.tl-item .tl-day { font-size: 7pt; font-weight: 700; color: #F97316; text-transform: uppercase; letter-spacing: 0.05em; }
.tl-item .tl-title { font-size: 9.5pt; font-weight: 700; color: #1E3A5F; margin: 0.5mm 0; }
.tl-item .tl-desc { font-size: 8.5pt; color: #64748B; }

.qa-item { margin-bottom: 2.5mm; padding-bottom: 2.5mm; border-bottom: 1px dashed #E2E8F0; }
/* «Dicono di noi»: il voto sulle piattaforme, le parole dei clienti, gli impianti. */
.voti-row { display: grid; gap: 3.5mm; margin: 1mm 0 1.5mm; }
.voto-card { background: #F8FAFC; border-top: 0.8mm solid #1E3A5F; border-radius: 0 0 8px 8px; padding: 3.5mm 4.5mm 4mm; }
.voto-nome { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #1E3A5F; }
.voto-numero { font-family: 'Outfit', sans-serif; font-size: 27pt; font-weight: 800; color: #0F172A; line-height: 1; margin-top: 2mm; }
.voto-numero small { font-family: 'Inter Tight', sans-serif; font-size: 9pt; font-weight: 500; color: #64748B; margin-left: 1.5mm; }
.stelle { display: flex; gap: 0.9mm; margin-top: 2.2mm; }
.voto-conta { font-size: 8.5pt; font-weight: 600; color: #0F172A; margin-top: 2mm; }
.voto-link { font-size: 7.5pt; color: #64748B; margin-top: 0.4mm; }
.voti-nota { font-size: 7pt; color: #94A3B8; margin: 0 0 5mm; }
.citazioni { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm 7mm; }
.citazione { border-left: 0.7mm solid #FED7AA; padding: 0.5mm 0 0.5mm 4mm; }
.citazione.larga { grid-column: 1 / -1; }
.citazione p { font-size: 10pt; font-style: italic; line-height: 1.5; color: #0F172A; margin: 0; }
.citazione.larga p { font-size: 11.5pt; }
.citazione .firma { font-size: 7pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #1E3A5F; margin-top: 2mm; }
.impianti-titolo { font-size: 11pt; color: #1E3A5F; margin: 6mm 0 0; }
/* Tre foto affiancate: possono crescere più di una fascia sola, ma non diventare strisce verticali. */
.content > .foto-fascia.impianti-fascia { max-height: 100mm; }
.foto-fascia .impianti { display: grid; gap: 2.5mm; height: calc(100% - 5mm); margin-top: 3mm; }
.foto-fascia .impianti img { height: 100%; margin-top: 0; border-radius: 8px; }
.qa-item:last-child { border-bottom: none; }
.qa-q { font-weight: 700; color: #1E3A5F; font-size: 10pt; margin-bottom: 1mm; display: flex; gap: 2mm; align-items: flex-start; }
.qa-q::before { content: "Q"; background: #F97316; color: white; width: 4.5mm; height: 4.5mm; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 8pt; flex-shrink: 0; margin-top: 1px; }
.qa-a { color: #475569; font-size: 8.5pt; padding-left: 6.5mm; }

/* La firma del contratto: che cosa si accetta, poi luogo e data e le firme delle due parti. */
.sig-box { border: 2px dashed #1E3A5F; border-radius: 10px; padding: 5mm; margin-top: 4mm; background: #F8FAFC; }
.sig-box .sig-dich { font-size: 8.5pt; line-height: 1.5; color: #334155; margin: 0 0 2mm; }
.sig-box .sig-grid { display: grid; grid-template-columns: 0.8fr 1fr 1.2fr; gap: 6mm; align-items: start; }
.sig-box .sig-line { height: 13mm; border-bottom: 1px solid #94A3B8; margin-bottom: 1.5mm; }
.sig-box .sig-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.1em; color: #64748B; font-weight: 700; }
.sig-box .sig-name { font-size: 9pt; color: #1E3A5F; font-weight: 700; margin-top: 0.5mm; }
.sig-box .sig-sub { font-size: 7.5pt; line-height: 1.35; color: #64748B; margin-top: 0.5mm; }
.firma-righe { border: 1px solid #E2E8F0; border-radius: 10px; background: #F8FAFC; padding: 1mm 5mm; margin: 2mm 0 1mm; }
.firma-riga { display: grid; grid-template-columns: 38mm 1fr; gap: 4mm; padding: 2.3mm 0; border-bottom: 1px solid #E2E8F0; font-size: 9.5pt; line-height: 1.4; color: #0F172A; }
.firma-riga:last-child { border-bottom: none; }
.firma-riga > span:first-child { font-size: 7pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748B; padding-top: 0.7mm; }
.firma-riga.importo > span:last-child { font-family: 'Outfit', sans-serif; font-size: 12pt; font-weight: 800; color: #1E3A5F; }
.cond-clausole.due-colonne { column-count: 2; column-gap: 8mm; }
.cond-testo { column-count: 2; column-gap: 7mm; font-size: 8.2pt; color: #475569; line-height: 1.5; margin-top: 3mm; }
.cond-testo .cond-art { font-size: 8.6pt; color: #1E3A5F; font-weight: 700; margin: 2.5mm 0 1mm; break-after: avoid; }
.cond-testo p { margin-bottom: 1.5mm; }
.cond-testo ul { margin: 0 0 1.5mm 4mm; }
.cond-firma { border: 1px solid #1E3A5F; border-radius: 8px; padding: 4mm; margin-top: 4mm; }
.cond-firma-titolo { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: #1E3A5F; margin-bottom: 1.5mm; }
.cond-clausole { margin: 0 0 3mm 4mm; font-size: 8pt; color: #334155; }
.cond-righe { display: grid; grid-template-columns: 1fr 1.4fr; gap: 6mm; margin-top: 8mm; }
.cond-righe .cond-riga { border-bottom: 1px solid #94A3B8; height: 8mm; }
.cond-righe span { font-size: 7pt; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.06em; }
.recesso-box { border: 1px solid #1E3A5F; border-radius: 8px; padding: 6mm; font-size: 9pt; color: #334155; line-height: 1.55; }
.recesso-campo { margin-top: 7mm; }
.recesso-campo span { font-size: 7pt; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.06em; }
.recesso-riga { border-bottom: 1px solid #CBD5E1; height: 7mm; }
.legal-box { margin-top: 3mm; padding: 3mm 4mm; background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 7.8pt; color: #475569; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }

.offer-box { background: linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%); color: white; border-radius: 12px; padding: 6mm; margin: 3mm 0; position: relative; overflow: hidden; }
.offer-box::after { content: ""; position: absolute; right: -20%; top: -50%; width: 60%; height: 200%; background: radial-gradient(circle, rgba(249,115,22,0.3) 0%, transparent 60%); }
.offer-box .offer-eyebrow { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #FBBF24; margin-bottom: 2mm; }
.offer-box h3 { font-size: 15pt; margin-bottom: 2.5mm; position: relative; }
.offer-box .offer-num { font-family: 'Outfit', sans-serif; font-size: 32pt; font-weight: 800; color: #FBBF24; line-height: 1; letter-spacing: -0.03em; position: relative; }

.sat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; margin: 2.5mm 0; }
.sat-view { position: relative; border-radius: 8px; overflow: hidden; aspect-ratio: 4/3; border: 1px solid #E2E8F0; }
.sat-view svg { width: 100%; height: 100%; display: block; }
.sat-view .sat-label { position: absolute; bottom: 2mm; left: 2mm; background: rgba(15,23,42,0.72); backdrop-filter: blur(2px); padding: 0.8mm 2.2mm; border-radius: 4px; font-size: 7pt; font-weight: 600; color: white; letter-spacing: 0.02em; }

.product-card { display: grid; grid-template-columns: 42mm 1fr; gap: 4mm; background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 3mm; margin-bottom: 2.5mm; }
.product-img { background: linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%); border-radius: 6px; aspect-ratio: 1/1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.product-img svg, .product-img img { width: 75%; height: 75%; object-fit: contain; }
.product-info h3 { font-size: 10pt; color: #1E3A5F; margin-bottom: 0.5mm; line-height: 1.2; }
.product-info .product-brand { font-size: 7.5pt; color: #64748B; font-weight: 600; margin-bottom: 1mm; text-transform: uppercase; letter-spacing: 0.05em; }
.product-info p { font-size: 8pt; color: #475569; margin-bottom: 0.8mm; line-height: 1.3; }
.product-info .product-specs { display: flex; gap: 1.2mm; flex-wrap: wrap; margin-top: 1.2mm; }
.product-info .spec-chip { background: #F1F5F9; color: #475569; font-size: 7pt; font-weight: 600; padding: 0.4mm 1.8mm; border-radius: 3px; }
.product-info .spec-chip.green { background: #DCFCE7; color: #166534; }
.macro-hero { display: grid; grid-template-columns: 1fr 1.1fr; gap: 7mm; align-items: center; margin: 5mm 0; }
.macro-hero-img { height: 92mm; border-radius: 12px; overflow: hidden; background: linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%); border: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: center; }
.macro-hero-img img { width: 100%; height: 100%; object-fit: cover; }
.macro-hero-img svg { width: 54%; height: 54%; }
.macro-copy { border-left: 4px solid #F97316; padding-left: 5mm; }
.macro-copy h2 { font-size: 19pt; line-height: 1.08; color: #1E3A5F; margin-bottom: 3mm; }
.macro-copy p { font-size: 10pt; color: #475569; line-height: 1.55; }
.macro-pill-row { display: flex; gap: 2mm; flex-wrap: wrap; margin-top: 4mm; }
.macro-pill { border-radius: 999px; background: #FFEDD5; color: #C2410C; font-size: 7.5pt; font-weight: 700; padding: 1.2mm 2.6mm; }

/* La CO₂ con le foto: la fascia del bosco con le tonnellate, poi tre riquadri. */
.co2-foto { position: relative; border-radius: 12px; overflow: hidden; height: 60mm; margin: 4mm 0 3mm; }
.co2-foto img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.co2-foto::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(8,28,18,0.78) 0%, rgba(8,28,18,0.42) 55%, rgba(8,28,18,0.08) 100%); }
.co2-foto-testo { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 9mm; color: #FFFFFF; }
.co2-foto-testo .etichetta { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.92; }
.co2-foto-testo .valore { font-family: 'Outfit', sans-serif; font-size: 40pt; font-weight: 800; line-height: 1; letter-spacing: -0.02em; margin: 2mm 0 2.5mm; }
.co2-foto-testo .sub { font-size: 9pt; opacity: 0.92; max-width: 100mm; line-height: 1.45; }
.co2-carte { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.co2-carta { border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; background: #FFFFFF; }
.co2-carta img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
.co2-carta .corpo { padding: 3mm 3.5mm 3.5mm; }
.co2-carta .num { font-family: 'Outfit', sans-serif; font-size: 20pt; font-weight: 800; color: #16A34A; line-height: 1; }
.co2-carta .cosa { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748B; margin-top: 1mm; }
.co2-carta .desc { font-size: 8pt; color: #475569; margin-top: 1.2mm; line-height: 1.4; }
/* La fascia foto delle pagine con i contenuti variabili (fasi, investimento):
   prende solo lo spazio che resta, fino a 64 mm; sotto i 34 mm la foto non esce.
   Così una pagina piena non sborda mai per colpa di una foto. */
/* Lo stacco sopra la foto sta dentro la fascia: a zero, la fascia non occupa niente. */
.content > .foto-fascia { flex: 1 1 0; min-height: 0; max-height: 69mm; container-type: size; }
.foto-fascia img { display: block; width: 100%; height: calc(100% - 5mm); margin-top: 4mm; object-fit: cover; border-radius: 12px; }
@container (max-height: 39mm) { .foto-fascia img { display: none; } }
/* La foto di una pagina che ha poco altro (le garanzie): può crescere di più. */
.content > .foto-fascia.alta { max-height: 125mm; }
.eq-row { display: grid; grid-template-columns: 26mm 1fr; gap: 4mm; align-items: center; padding: 3mm 4mm; background: white; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 2.2mm; }
.eq-row .eq-num { font-family: 'Outfit', sans-serif; font-size: 20pt; font-weight: 800; color: #16A34A; line-height: 1; text-align: center; }
.eq-row .eq-num small { display: block; font-size: 7.5pt; color: #64748B; font-weight: 600; margin-top: 0.5mm; text-transform: uppercase; letter-spacing: 0.05em; }
.eq-row .eq-icons { line-height: 1; min-height: 15px; }
.eq-row .eq-desc { font-size: 8pt; color: #64748B; margin-top: 0.5mm; }

.guarantee-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin: 3mm 0; }
.guarantee-card { background: white; border: 2px solid #16A34A; border-radius: 10px; padding: 4mm 5mm; }
.guarantee-card .g-num { font-family: 'Outfit', sans-serif; font-size: 18pt; font-weight: 800; color: #16A34A; line-height: 1; margin-bottom: 1.5mm; }
.guarantee-card .g-title { font-size: 10pt; font-weight: 700; color: #1E3A5F; margin-bottom: 1.5mm; }
.guarantee-card .g-desc { font-size: 8pt; color: #475569; line-height: 1.4; }
.guarantee-card.con-badge { display: grid; grid-template-columns: 13mm 1fr; column-gap: 3.5mm; align-items: start; }
.guarantee-card .g-badge { width: 13mm; height: 13mm; object-fit: contain; display: block; }
`;

// ─── Page header/footer comuni ────────────────────────────────────────────

function header(numero: string, cliente: string, brand: string): string {
  return `<div class="page-header">
    <div class="brand"><div class="brand-icon">☀</div><span>${escHtml(brand)}</span></div>
    <div class="ref">Preventivo <strong>${escHtml(numero)}</strong> · ${escHtml(cliente)}</div>
  </div>`;
}

function footer(brand: string, contatti: string, pageN: number, total: number): string {
  return `<div class="page-footer"><span>${escHtml(brand)} · ${escHtml(contatti)}</span><span class="pnum">${pageN} / ${total}</span></div>`;
}

function safeRichText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<(?!\/?(p|br|strong|em|ul|ol|li|b|i)\b)[^>]*>/gi, "")
    .trim();
}

function plainText(value: string | null | undefined): string {
  return safeRichText(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guaranteeIconLabel(icon: string | null | undefined): string {
  switch (icon) {
    case "award":
      return "★";
    case "clock":
      return "48h";
    case "tools":
      return "FER";
    case "battery":
      return "kWh";
    case "sun":
      return "PV";
    default:
      return "✓";
  }
}

function websiteHref(value: string | null | undefined): string | null {
  const raw = plainText(value);
  if (!raw) return null;
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(href);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function phoneHref(value: string | null | undefined): string | null {
  const raw = plainText(value).replace(/[^\d+]/g, "");
  return raw.length >= 6 ? `tel:${raw}` : null;
}

function emailHref(value: string | null | undefined): string | null {
  const raw = plainText(value).replace(/\s+/g, "");
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(raw)) return null;
  return `mailto:${raw}`;
}

function imageHref(value: string | null | undefined): string | null {
  const raw = plainText(value);
  if (!raw) return null;
  // Le foto articolo arrivano dall'edge come data URI base64 (così il PDF è
  // self-contained anche nel download browser): vanno accettate, non scartate.
  if (raw.startsWith("data:image/")) return raw;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function renderPdfActionBar(d: FvPdfTemplateData): string {
  const contatti = [
    d.azienda.phone && phoneHref(d.azienda.phone)
      ? `<a href="${escHtml(phoneHref(d.azienda.phone)!)}">${escHtml(d.azienda.phone)}</a>`
      : "",
    d.azienda.email && emailHref(d.azienda.email)
      ? `<a href="${escHtml(emailHref(d.azienda.email)!)}">Email</a>`
      : "",
    d.azienda.website && websiteHref(d.azienda.website)
      ? `<a href="${escHtml(websiteHref(d.azienda.website)!)}" target="_blank" rel="noopener">Sito</a>`
      : "",
  ].filter(Boolean).join("");
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  return `<div class="pdf-action-bar" role="region" aria-label="Azioni preventivo fotovoltaico">
    <div class="pdf-action-meta">
      <strong>${escHtml(d.progetto.numero)} · ${escHtml(cliente || d.progetto.titolo)}</strong>
      <span>${escHtml(d.azienda.name)} · valido ${d.progetto.valido_giorni} giorni · apri la stampa per salvare il PDF definitivo</span>
    </div>
    <div class="pdf-action-links">
      ${contatti}
      <button type="button" onclick="window.print()">Stampa / Salva PDF</button>
    </div>
  </div>`;
}

function roofSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case "solar_api":
      return "Google Solar API";
    case "pvgis":
      return "PVGIS";
    case "manuale":
      return "dato manuale";
    default:
      return "stima tecnica";
  }
}

function roofQualityLabel(quality: string | null | undefined): string {
  switch (quality) {
    case "high":
      return "alta";
    case "medium":
      return "media";
    case "low":
      return "bassa";
    case "manual":
      return "manuale";
    case "mock":
      return "stimata";
    default:
      return "non indicata";
  }
}

function hasEstimatedRoofData(d: FvPdfTemplateData): boolean {
  const quality = String(d.progetto.qualita_dati_tetto ?? "").toLowerCase();
  return Boolean(d.progetto.tetto_mock) || ["mock", "estimated", "stimata", "stimato"].includes(quality);
}

function renderRoofSourcePanel(d: FvPdfTemplateData): string {
  const source = roofSourceLabel(d.progetto.fonte_dati_tetto);
  const quality = roofQualityLabel(d.progetto.qualita_dati_tetto);
  // Con PVGIS non c'è un'immagine del tetto né una qualità del rilievo: prima le due
  // caselle dicevano «non indicata», in 14 preventivi su 38. Si scrive cosa c'è.
  const pvgis = d.progetto.fonte_dati_tetto === "pvgis";
  const celle: Array<[string, string]> = [["Fonte dati tetto", source]];
  if (pvgis) celle.push(["Dati usati", "irraggiamento medio della tua zona"]);
  else if (quality !== "non indicata") celle.push(["Qualità dati", quality]);
  if (d.progetto.imagery_date) celle.push(["Immagine satellitare", fmtData(d.progetto.imagery_date)]);
  else if (d.progetto.inclinazione_tetto) celle.push(["Inclinazione del tetto", `${fmtNum(d.progetto.inclinazione_tetto)}°`]);
  const warning = hasEstimatedRoofData(d)
    ? `<div class="callout callout-tip">
        <span class="callout-icon">!</span>
        <div><strong>Dati tetto stimati.</strong> La produzione è una stima commerciale: confermare con sopralluogo tecnico, verifica ombre e misure reali prima dell'ordine.</div>
      </div>`
    : "";
  return `<div class="source-grid">
    ${celle.map(([etichetta, valore]) => `<div class="source-cell"><div class="source-label">${escHtml(etichetta)}</div><div class="source-value">${escHtml(valore)}</div></div>`).join("")}
  </div>${warning}`;
}

function renderServiziInclusi(d: FvPdfTemplateData): string {
  const servizi = (d.servizi ?? [])
    .filter((s) => plainText(s.descrizione).length > 0)
    .slice(0, 4);
  if (servizi.length === 0) return "";
  // Col prezzo a corpo, col kit o con uno sconto le cifre delle singole voci
  // non sommano al totale: si elencano come incluse, senza importo. Negli altri
  // casi l'importo è imponibile, e lo si dice.
  const mostraPrezzi = !d.costi.prezzo_a_corpo && !d.costi.sconto_applicato;
  return `<h3 style="font-size:11pt;color:#1E3A5F;margin:4mm 0 2mm;">Servizi inclusi nella proposta</h3>
    <div class="service-list">
      ${servizi.map((s) => {
        const descrizione = plainText(s.descrizione);
        const note = plainText(s.note_operative);
        const qty = Number(s.quantita ?? 1);
        const price = Number(s.prezzo_vendita ?? 0);
        const meta = [
          Number.isFinite(qty) && qty > 1 ? `Quantità ${fmtNum(qty, 1)}` : null,
          note || null,
          mostraPrezzi && Number.isFinite(price) && price > 0 ? `${fmtEur(price)} + IVA` : null,
        ].filter(Boolean).join(" · ");
        return `<div class="service-item">
          <div class="service-title">${escHtml(descrizione)}</div>
          ${meta ? `<div class="service-meta">${escHtml(meta)}</div>` : ""}
        </div>`;
      }).join("")}
    </div>`;
}

const FV_PRODUCT_CATEGORY_LABELS: Record<string, string> = {
  pannello: "Pannelli fotovoltaici",
  inverter: "Inverter",
  accumulo: "Batteria di accumulo",
  wallbox: "Wallbox",
  ottimizzatore: "Ottimizzatori",
  struttura: "Strutture e fissaggi",
};

function productIconType(categoria: string): "pannello" | "inverter" | "accumulo" {
  if (categoria === "inverter") return "inverter";
  if (categoria === "accumulo" || categoria === "wallbox") return "accumulo";
  return "pannello";
}

type FvListinoMacroPdf = NonNullable<NonNullable<FvPdfTemplateData["template"]>["listino_macrocategorie_fv"]>[number];

function inferFvCategoryFromText(value: string | null | undefined): string {
  const text = plainText(value).toLowerCase();
  if (/pannell|modul|fotovolta/.test(text)) return "pannello";
  if (/inverter/.test(text)) return "inverter";
  if (/accumul|batter/.test(text)) return "accumulo";
  if (/wallbox|ricaric/.test(text)) return "wallbox";
  if (/ottimizz/.test(text)) return "ottimizzatore";
  if (/struttur|fissagg/.test(text)) return "struttura";
  return "";
}

function productCategoryMedia(
  d: FvPdfTemplateData,
  categoria: string,
): { label: string; description: string; imageUrl: string | null } {
  const macro = (d.template?.listino_macrocategorie_fv ?? []).find(
    (item) => inferFvCategoryFromText(item.nome) === categoria,
  );
  return {
    label: plainText(macro?.nome) || FV_PRODUCT_CATEGORY_LABELS[categoria] || categoria,
    description: plainText(macro?.descrizione_estesa) || plainText(macro?.descrizione),
    imageUrl: imageHref(macro?.immagine_url),
  };
}

function dedicatedMacroPages(d: FvPdfTemplateData): Array<FvListinoMacroPdf & { categoria: string }> {
  const categoriesInProject = new Set(d.componenti.map((c) => c.categoria));
  return (d.template?.listino_macrocategorie_fv ?? [])
    .map((macro) => ({
      ...macro,
      categoria: inferFvCategoryFromText(macro.nome),
    }))
    .filter((macro) =>
      Boolean(macro.mostra_pagina_dedicata_pdf) &&
      categoriesInProject.has(macro.categoria) &&
      (
        plainText(macro.nome).length > 0 ||
        plainText(macro.descrizione_estesa).length > 0 ||
        plainText(macro.descrizione).length > 0 ||
        Boolean(imageHref(macro.immagine_url))
      ),
    );
}

function cssColor(value: string | null | undefined, fallback: string): string {
  const raw = plainText(value);
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  if (/^(white|black|transparent)$/i.test(raw)) return raw.toLowerCase();
  return fallback;
}

function clampPct(value: number | null | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

function coverText(value: string | null | undefined, fallback: string): string {
  const text = plainText(value);
  return text || fallback;
}

function renderCoverLines(value: string): string {
  return escHtml(value).replace(/\n/g, "<br/>");
}

/**
 * Indirizzo, CAP, comune e provincia, senza ripetere quello che l'indirizzo già
 * contiene: dalla ricerca dell'indirizzo arriva «Via Roma, 12, 20121 Milano MI,
 * Italia», e il PDF aggiungeva di nuovo «20121 Milano, (MI)».
 */
export function indirizzoCompleto(c: FvPdfTemplateData["cliente"]): string {
  const via = plainText(c.indirizzo).replace(/,?\s*Italia\s*$/i, "").trim();
  const comune = plainText(c.comune);
  const giaDentro = Boolean(comune) && via.toLowerCase().includes(comune.toLowerCase());
  return [
    via || null,
    giaDentro ? null : c.cap && comune ? `${c.cap} ${comune}` : comune || null,
    giaDentro || !c.provincia ? null : `(${c.provincia})`,
  ].filter(Boolean).join(", ").replace(/, \(/g, " (");
}

function renderCoverSubtitle(d: FvPdfTemplateData, fallback: string): string {
  const template = plainText(d.template?.pdf_cover_subhero_template);
  const staticText = plainText(d.template?.pdf_cover_subhero);
  const value = template || staticText || fallback;
  const replacements: Record<string, string> = {
    cliente_nome: `${d.cliente.nome} ${d.cliente.cognome}`.trim(),
    potenza_kwp: `${fmtNum(d.progetto.potenza_kwp, 1)} kWp`,
    accumulo_kwh: d.progetto.has_accumulo ? `${fmtNum(d.progetto.capacita_accumulo_kwh, 1)} kWh` : "senza accumulo",
    indirizzo: plainText(d.cliente.indirizzo).replace(/,?\s*Italia\s*$/i, "").trim(),
    comune: d.cliente.comune ?? "",
    numero_pannelli: String(d.progetto.numero_pannelli),
  };
  // «{potenza_kwp} {accumulo_kwh}» (il testo di serie dell'editor) usciva «6,0 kWp 5,0 kWh»:
  // la batteria si dice, a meno che il testo non la nomini già («accumulo da {accumulo_kwh}»).
  return value.replace(/\{([a-z_]+)\}/gi, (_match, key: string, pos: number) => {
    if (key === "accumulo_kwh" && d.progetto.has_accumulo && !/accumulo(\s+da)?\s*$/i.test(value.slice(0, pos))) {
      return `con accumulo da ${replacements.accumulo_kwh}`;
    }
    return replacements[key] ?? "";
  });
}

// ─── Pagine ────────────────────────────────────────────────────────────────

function pageCover(d: FvPdfTemplateData): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const indirizzoCliente = indirizzoCompleto(d.cliente);
  const tipologia = d.cliente.tipologia_immobile ?? "Abitazione";
  const defaultSubtitle = `Impianto fotovoltaico ${fmtNum(d.progetto.potenza_kwp, 1)} kWp${d.progetto.has_accumulo ? ` con accumulo ${fmtNum(d.progetto.capacita_accumulo_kwh, 1)} kWh` : ""}${d.cliente.indirizzo ? `\nper ${d.cliente.indirizzo}.` : ""}`;
  const eyebrow = coverText(d.template?.pdf_cover_eyebrow, "La tua proposta personalizzata");
  const hero = coverText(d.template?.pdf_cover_hero, "Il sole\ndiventa tuo.");
  const subtitle = renderCoverSubtitle(d, defaultSubtitle);
  const bgColor = cssColor(d.template?.pdf_cover_bg_color, "#0F2542");
  const textColor = cssColor(d.template?.pdf_cover_text_color, "#FFFFFF");
  const imageUrl = imageHref(d.template?.pdf_cover_image_url);
  const logoUrl = imageHref(d.template?.logo_url);
  const overlayOpacity = clampPct(d.template?.pdf_cover_overlay_opacity, imageUrl ? 62 : 0) / 100;
  const align = d.template?.pdf_cover_text_align === "center" ? "center" : "left";
  const logoPosition = plainText(d.template?.pdf_cover_logo_position) || "top_left";
  const brandJustify = logoPosition === "top_right" ? "flex-end" : logoPosition === "top_center" ? "center" : "flex-start";
  const showBrand = logoPosition !== "hidden";
  const showClientCard = d.template?.pdf_cover_show_client_card !== false;
  // ─── Parità layout cover con l'editor: posizione verticale, overlay style,
  // dimensioni font. La DECORAZIONE resta il ☀ ambientale FV (CSS .cover::after);
  // il toggle "Mostra" la accende/spegne (classe .cover--flat). Lo stile decoro
  // (anelli/linea…) NON si applica al PDF FV per scelta — vedi memoria
  // project_cover_template_system.
  const showDecoration = d.template?.pdf_cover_show_decoration !== false;
  const overlayStyle = plainText(d.template?.pdf_cover_overlay_style) || "flat";
  const textVertical = plainText(d.template?.pdf_cover_text_vertical) || "bottom";
  const clampSize = (v: unknown, lo: number, hi: number, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  };
  const titleSize = clampSize(d.template?.pdf_cover_title_size, 28, 64, 46);
  const subtitleSize = clampSize(d.template?.pdf_cover_subtitle_size, 10, 18, 16);
  const eyebrowSize = clampSize(d.template?.pdf_cover_eyebrow_size, 8, 14, 10);
  const overlayBg = overlayStyle === "gradient"
    ? `linear-gradient(to bottom, rgba(15,37,66,${(overlayOpacity * 0.15).toFixed(2)}) 0%, rgba(15,37,66,${(overlayOpacity * 0.55).toFixed(2)}) 55%, rgba(15,37,66,${overlayOpacity.toFixed(2)}) 100%)`
    : overlayStyle === "gradient_diag"
      ? `linear-gradient(135deg, rgba(15,37,66,${(overlayOpacity * 0.2).toFixed(2)}) 0%, rgba(15,37,66,${overlayOpacity.toFixed(2)}) 100%)`
      : overlayStyle === "vignette"
        ? `radial-gradient(ellipse at center, rgba(15,37,66,${(overlayOpacity * 0.1).toFixed(2)}) 0%, rgba(15,37,66,${(overlayOpacity * 0.5).toFixed(2)}) 70%, rgba(15,37,66,${(overlayOpacity * 0.95).toFixed(2)}) 100%)`
        : `rgba(15,37,66,${overlayOpacity.toFixed(2)})`;
  const mainMargin = textVertical === "top"
    ? "margin-top:0;margin-bottom:auto;"
    : textVertical === "center"
      ? "margin-top:auto;margin-bottom:auto;"
      : "margin-top:auto;margin-bottom:0;";
  const brandMb = textVertical === "bottom" ? "auto" : "0";

  return `<div class="page"><div class="cover${showDecoration ? "" : " cover--flat"}" style="background:${escHtml(bgColor)};color:${escHtml(textColor)};">
    ${imageUrl ? `<img class="cover-bg-img" src="${escHtml(imageUrl)}" alt="Copertina fotovoltaico"/>` : ""}
    ${imageUrl ? `<div class="cover-overlay" style="background:${overlayBg};"></div>` : ""}
    <div class="cover-content" style="color:${escHtml(textColor)};text-align:${align};align-items:${align === "center" ? "center" : "stretch"};">
    ${showBrand ? `<div class="cover-brand" style="justify-content:${brandJustify};width:100%;margin-bottom:${brandMb};">
      ${logoUrl ? `<img class="logo-img" src="${escHtml(logoUrl)}" alt="${escHtml(d.azienda.name)}"/>` : `<div class="icon">☀</div>`}
      <div>
        <div class="name">${escHtml(d.azienda.name)}</div>
        ${d.azienda.tagline ? `<div class="tagline">${escHtml(d.azienda.tagline)}</div>` : ""}
      </div>
    </div>` : `<div style="margin-bottom:${brandMb};"></div>`}
    <div class="cover-main" style="max-width:${align === "center" ? "150mm" : "165mm"};${mainMargin}">
      <div class="cover-eyebrow" style="font-size:${eyebrowSize}pt;">${escHtml(eyebrow)}</div>
      <h1 style="color:${escHtml(textColor)};font-size:${titleSize}pt;">${renderCoverLines(hero)}</h1>
      <div class="subtitle" style="max-width:${align === "center" ? "100%" : "75%"};font-size:${subtitleSize}pt;">${renderCoverLines(subtitle)}</div>
    </div>
    ${showClientCard ? `<div class="cover-client">
      <div class="client-label">Preparato per</div>
      <div class="client-name">${escHtml(cliente)}</div>
      <div class="client-meta">${escHtml(indirizzoCliente)} · ${escHtml(tipologia)}</div>
    </div>` : ""}
    <div class="cover-footer">
      <div class="doc-meta">Preventivo <strong>${escHtml(d.progetto.numero)}</strong><br/>${escHtml(fmtData(d.progetto.creato_il))} · valido ${d.progetto.valido_giorni} giorni</div>
      <div style="text-align:right;">${d.progetto.venditore ? `A cura di<br/><strong>${escHtml(d.progetto.venditore)}</strong>` : ""}</div>
    </div>
  </div></div></div>`;
}

function pageInvestimento(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const valoreProposta = safeRichText(d.template?.valore_proposta_html);
  const inclusi: string[] = [];
  const pannello = d.componenti.find((c) => c.categoria === "pannello");
  const inverter = d.componenti.find((c) => c.categoria === "inverter");
  const accumulo = d.componenti.find((c) => c.categoria === "accumulo");
  // Solo quello che c'è nel preventivo: componenti e servizi scelti. Prima si
  // aggiungevano garanzie di 25 e 10 anni, «3 giornate» di posa, pratiche e app
  // di monitoraggio anche a chi non le offriva.
  const nomeProdotto = (c: { marca?: string | null; modello?: string | null }) =>
    [c.marca, c.modello].filter(Boolean).join(" ");
  const conGaranzia = (testo: string, anni: number | null | undefined) =>
    anni && anni > 0 ? `${testo} · garanzia ${anni} anni` : testo;
  if (pannello) inclusi.push(conGaranzia([`${pannello.quantita} pannelli`, nomeProdotto(pannello)].filter(Boolean).join(" "), pannello.garanzia_anni));
  if (inverter) inclusi.push(conGaranzia(["Inverter", nomeProdotto(inverter)].filter(Boolean).join(" "), inverter.garanzia_anni));
  if (accumulo) inclusi.push(conGaranzia(`${["Accumulo", nomeProdotto(accumulo)].filter(Boolean).join(" ")} (${fmtNum(accumulo.capacita_kwh ?? d.progetto.capacita_accumulo_kwh, 1)} kWh)`, accumulo.garanzia_anni));
  for (const c of d.componenti) {
    if (c === pannello || c === inverter || c === accumulo) continue;
    const testo = plainText(c.descrizione) || nomeProdotto(c);
    if (testo) inclusi.push(c.quantita > 1 ? `${fmtNum(c.quantita)} × ${testo}` : testo);
  }
  for (const s of d.servizi ?? []) {
    const testo = plainText(s.descrizione);
    if (testo) inclusi.push(testo);
  }
  const altriInclusi = Math.max(0, inclusi.length - 10);

  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">L'investimento</div>
      <h1 class="page-title">Il tuo impianto,<br/>tutto compreso.</h1>
      <p class="page-subtitle">Il prezzo, cosa comprende e quanto recuperi con la detrazione.</p>
      ${valoreProposta ? `<div class="callout callout-info">
        <span class="callout-icon">i</span>
        <div><strong>Perché questa proposta è costruita su misura</strong><div class="rich-text">${valoreProposta}</div></div>
      </div>` : ""}
      <div class="invest-hero">
        <div class="label">Prezzo chiavi in mano</div>
        <div class="price">${fmtEur(d.costi.prezzo_vendita_iva_inclusa)}</div>
        <div class="desc">IVA ${d.costi.iva_perc}% inclusa${inclusi.length > 0 ? " · componenti e servizi elencati qui sotto." : "."}</div>
      </div>
      ${inclusi.length > 0 ? `<h3 style="font-size:12pt;color:#1E3A5F;margin-bottom:2mm;">Cosa è incluso</h3>
      <ul class="bullets" style="margin-bottom:3mm;">
        ${inclusi.slice(0, 10).map((i) => `<li>${escHtml(i)}</li>`).join("")}
        ${altriInclusi > 0 ? `<li>e altre ${altriInclusi} voci del preventivo</li>` : ""}
      </ul>` : ""}
      ${d.foto_di_serie?.impianto ? `<div class="foto-fascia"><img src="${d.foto_di_serie.impianto}" alt="" /></div>` : ""}
      ${d.costi.detrazione_eur > 0 ? `<div class="callout callout-success">
        <span class="callout-icon">✓</span>
        <div><strong>Detrazione fiscale ${d.costi.detrazione_perc}% — recuperi ${fmtEur(d.costi.detrazione_eur)} in 10 anni.</strong>
        Costo netto effettivo: <strong>${fmtEur(d.costi.costo_netto_dopo_detrazione)}</strong></div>
      </div>` : ""}
      ${(() => {
        const mp = d.modalita_pagamento;
        if (!mp) return "";
        const tot = d.costi.prezzo_vendita_iva_inclusa;
        const h3 = `<h3 style="font-size:12pt;color:#1E3A5F;margin:4mm 0 2mm;">Modalità di pagamento</h3>`;
        const noteP = mp.note ? `<p style="font-size:8.5pt;color:#64748B;margin-top:2mm;">${escHtml(mp.note)}</p>` : "";

        // ── Finanziato: anticipo + resto a rate ──
        if (mp.tipo === "finanziato") {
          const r2 = (l: string, v: string, hl = false) => `<tr style="border-bottom:1px solid #F1F5F9;">
            <td style="padding:1.8mm 0;color:${hl ? "#C2410C" : "#1E293B"};font-weight:${hl ? 700 : 400};">${l}</td>
            <td style="padding:1.8mm 0;text-align:right;font-weight:${hl ? 700 : 600};color:${hl ? "#C2410C" : "#1E3A5F"};">${v}</td></tr>`;
          return `${h3}
          <table style="width:100%;border-collapse:collapse;font-size:10pt;">
            <tbody>
              ${mp.anticipo_eur > 0 ? r2(`Anticipo alla firma (${fmtNum(mp.anticipo_pct, 0)}%)`, fmtEur(mp.anticipo_eur)) : r2("Anticipo alla firma", "Nessun anticipo")}
              ${r2(`Importo finanziato${mp.tasso_zero ? " · tasso zero" : ""}`, fmtEur(mp.finanziato_eur))}
              ${r2(`Rata mensile · ${mp.durata_mesi} rate`, `${fmtEur(mp.rata_mensile)}/mese`, true)}
            </tbody>
            <tfoot><tr style="border-top:2px solid #1E3A5F;font-weight:700;">
              <td style="padding:1.8mm 0;color:#1E3A5F;">Totale chiavi in mano</td>
              <td style="padding:1.8mm 0;text-align:right;color:#1E3A5F;">${fmtEur(tot)}</td>
            </tr></tfoot>
          </table>${noteP}`;
        }

        // ── Noleggio: zero anticipo, canone mensile ──
        if (mp.tipo === "noleggio") {
          const r2 = (l: string, v: string, hl = false) => `<tr style="border-bottom:1px solid #F1F5F9;">
            <td style="padding:1.8mm 0;color:${hl ? "#C2410C" : "#1E293B"};font-weight:${hl ? 700 : 400};">${l}</td>
            <td style="padding:1.8mm 0;text-align:right;font-weight:${hl ? 700 : 600};color:${hl ? "#C2410C" : "#1E3A5F"};">${v}</td></tr>`;
          return `${h3}
          <table style="width:100%;border-collapse:collapse;font-size:10pt;">
            <tbody>
              ${r2("Anticipo iniziale", "€ 0 · zero anticipo")}
              ${r2(`Canone mensile · ${mp.durata_mesi} mesi`, `${fmtEur(mp.canone_mensile)}/mese`, true)}
            </tbody>
          </table>${noteP}`;
        }

        // ── Diretto (cash): tranche acconto/SAL/saldo ──
        if (!mp.tranche.length) return "";
        const sumPct = mp.tranche.reduce((s, t) => s + (Number(t.pct) || 0), 0);
        const sumImp = mp.tranche.reduce((s, t) => s + (Number(t.importo_eur) || 0), 0);
        const th = "padding:1.5mm 0;color:#94A3B8;font-weight:600;font-size:8pt;text-transform:uppercase;letter-spacing:.04em;";
        const rows = mp.tranche.map((t) => `
          <tr style="border-bottom:1px solid #F1F5F9;">
            <td style="padding:1.8mm 0;color:#1E293B;">${escHtml(t.label)}</td>
            <td style="padding:1.8mm 0;text-align:center;color:#64748B;">${fmtNum(t.pct, 0)}%</td>
            <td style="padding:1.8mm 0;text-align:right;font-weight:600;color:#1E3A5F;">${fmtEur(t.importo_eur)}</td>
          </tr>`).join("");
        return `${h3}
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
          <thead><tr style="border-bottom:1.5px solid #E2E8F0;text-align:left;">
            <th style="${th}text-align:left;">Fase</th>
            <th style="${th}text-align:center;">Quota</th>
            <th style="${th}text-align:right;">Importo</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="border-top:2px solid #1E3A5F;font-weight:700;">
            <td style="padding:1.8mm 0;color:#1E3A5F;">Totale chiavi in mano</td>
            <td style="padding:1.8mm 0;text-align:center;color:#1E3A5F;">${fmtNum(sumPct, 0)}%</td>
            <td style="padding:1.8mm 0;text-align:right;color:#1E3A5F;">${fmtEur(sumImp)}</td>
          </tr></tfoot>
        </table>${noteP}`;
      })()}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageAnteprima(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const np = d.progetto.numero_pannelli;
  const renderDisclaimer = plainText(d.template?.render_disclaimer);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Anteprima dell'impianto</div>
      <h1 class="page-title">La tua casa,<br/>con i pannelli.</h1>
      <p class="page-subtitle">Vista dall'alto del tuo tetto in ${escHtml(d.cliente.indirizzo)}. Disposizione indicativa dei ${np} pannelli sulla falda rilevata.</p>
      <div class="sat-grid">
        ${(() => {
          const mi = d.map_images;
          const s = 'style="width:100%;height:100%;object-fit:cover;display:block;"';
          const lp = d.progetto.layout_pannelli;
          return `
        <div class="sat-view">${mi?.close ? `<img src="${mi.close}" ${s} alt="Vista zenitale ravvicinata">` : (lp && lp.length ? svgVistaLayoutReale(lp) : svgVistaSatellitareMock("zenitale", np))}<div class="sat-label">Vista zenitale</div></div>
        <div class="sat-view">${mi?.medium ? `<img src="${mi.medium}" ${s} alt="Vista aerea">` : svgVistaSatellitareMock("nord", np)}<div class="sat-label">Vista aerea</div></div>
        <div class="sat-view">${mi?.overview ? `<img src="${mi.overview}" ${s} alt="Vista via">` : svgVistaSatellitareMock("3d", np)}<div class="sat-label">Vista via</div></div>
        <div class="sat-view">${mi?.wide ? `<img src="${mi.wide}" ${s} alt="Panoramica zona">` : svgVistaSatellitareMock("panoramica", np)}<div class="sat-label">Panoramica zona</div></div>
          `;
        })()}
      </div>
      <div class="callout callout-tip">
        <span class="callout-icon">★</span>
        <div><strong>Dimensionato sulla tua falda specifica.</strong>
        Numero moduli e potenza sono calcolati sull'esposizione${d.progetto.azimut ? ` ${escHtml(d.progetto.azimut)}` : ""} e sulla superficie del tuo tetto per massimizzare la produzione annuale. Il posizionamento definitivo dei pannelli viene definito nello studio di fattibilità tecnico successivo alla sottoscrizione.</div>
      </div>
      ${renderDisclaimer ? `<div class="callout callout-info">
        <span class="callout-icon">i</span>
        <div><strong>Nota anteprima impianto</strong>${escHtml(renderDisclaimer)}</div>
      </div>` : ""}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageBundleKit(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const b = d.bundle!;
  const kwp = b.fv_kwp ? `${fmtNum(b.fv_kwp, 1)} kWp` : null;
  const kwh = b.fv_accumulo_kwh ? `${fmtNum(b.fv_accumulo_kwh, 1)} kWh` : null;
  const chips = [kwp, kwh].filter(Boolean).map((v) => `<span class="spec-chip">${escHtml(v!)}</span>`).join("");
  const voceRows = (b.voci ?? [])
    .slice(0, 8)
    .map((v) => `<div style="display:flex;align-items:center;gap:3mm;padding:2mm 2.5mm;margin-bottom:1.5mm;border:1px solid #EEF2F7;border-radius:8px;font-size:8.5pt;background:#FCFDFE;">
      ${v.foto
        ? `<img src="${escHtml(v.foto)}" alt="" style="width:12mm;height:12mm;border-radius:6px;object-fit:contain;background:#F8FAFC;border:1px solid #E2E8F0;flex-shrink:0;padding:1mm;"/>`
        : `<div style="width:12mm;height:12mm;border-radius:6px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#94A3B8;font-size:14px;">☀</div>`}
      <span style="flex:1;font-weight:600;color:#1E3A5F;">${escHtml(v.descrizione)}</span>
      <span style="color:#64748B;">× ${v.quantita}</span>
    </div>`)
    .join("");
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Il tuo kit</div>
      <h1 class="page-title">${escHtml(b.nome)}</h1>
      ${b.descrizione ? `<p class="page-subtitle">${escHtml(b.descrizione)}</p>` : ""}
      ${b.cover_b64 ? `<div style="width:100%;height:60mm;border-radius:10px;overflow:hidden;margin:4mm 0;background:linear-gradient(135deg,#F8FAFC 0%,#E2E8F0 100%);display:flex;align-items:center;justify-content:center;padding:4mm;">
        <img src="${escHtml(b.cover_b64)}" alt="Kit ${escHtml(b.nome)}" style="max-width:100%;max-height:100%;object-fit:contain;"/>
      </div>` : ""}
      ${chips ? `<div class="product-specs" style="margin:3mm 0;">${chips}</div>` : ""}
      ${voceRows ? `<div style="margin-top:4mm;"><p style="font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#F97316;margin-bottom:2mm;">Componenti inclusi</p>${voceRows}</div>` : ""}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageComponenti(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const cards = d.componenti
    .filter((c) => ["pannello", "inverter", "accumulo", "wallbox", "ottimizzatore", "struttura"].includes(c.categoria))
    .slice(0, 4)
    .map((c) => {
      const media = productCategoryMedia(d, c.categoria);
      const imageUrl = imageHref(c.image_url) ?? media.imageUrl;
      const icon = imageUrl
        ? `<img src="${escHtml(imageUrl)}" alt="${escHtml(media.label)}"/>`
        : svgProdottoIcona(productIconType(c.categoria));
      const chips: string[] = [];
      if (c.potenza_w) chips.push(`<span class="spec-chip">${c.potenza_w} Wp</span>`);
      if (c.capacita_kwh) chips.push(`<span class="spec-chip">${fmtNum(c.capacita_kwh, 1)} kWh</span>`);
      if (c.garanzia_anni) chips.push(`<span class="spec-chip green">${c.garanzia_anni} anni</span>`);
      const titolo = c.modello ?? c.descrizione;
      const articleDescription = plainText(c.articolo_descrizione_estesa);
      const description = articleDescription || media.description;
      return `<div class="product-card">
        <div class="product-img">${icon}</div>
        <div class="product-info">
          <div class="product-brand">${escHtml([media.label, c.marca].filter(Boolean).join(" · "))}</div>
          <h3>${escHtml(titolo)}${c.descrizione !== titolo ? ` — ${escHtml(c.descrizione)}` : ""}</h3>
          ${description ? `<p>${escHtml(description)}</p>` : ""}
          ${c.quantita > 1 ? `<p>Quantità: <strong>${c.quantita} pezzi</strong></p>` : ""}
          ${chips.length > 0 ? `<div class="product-specs">${chips.join("")}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");

  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">I componenti</div>
      <h1 class="page-title">I componenti,<br/>uno per uno.</h1>
      <p class="page-subtitle">Marca, modello e garanzia di ogni componente che installiamo sul tuo tetto.</p>
      ${cards || "<p>Nessun componente configurato.</p>"}
      ${fasciaFotoPagina(d, "componenti", "center 45%", true)}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageMacroCategoriaDedicata(
  d: FvPdfTemplateData,
  macro: FvListinoMacroPdf & { categoria: string },
  pageN: number,
  total: number,
): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const title = plainText(macro.nome) || FV_PRODUCT_CATEGORY_LABELS[macro.categoria] || "Linea prodotto";
  const description = plainText(macro.descrizione_estesa) || plainText(macro.descrizione);
  const imageUrl = imageHref(macro.immagine_url);
  const componentiCategoria = d.componenti.filter((c) => c.categoria === macro.categoria);
  const details = componentiCategoria
    .flatMap((c) => [
      c.marca ? `Marca ${c.marca}` : null,
      c.modello ? `Modello ${c.modello}` : null,
      c.garanzia_anni ? `Garanzia ${c.garanzia_anni} anni` : null,
      c.potenza_w ? `${c.potenza_w} Wp` : null,
      c.capacita_kwh ? `${fmtNum(c.capacita_kwh, 1)} kWh` : null,
    ])
    .filter((v): v is string => Boolean(v))
    .slice(0, 5);

  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina dedicata · Linea prodotto</div>
      <h1 class="page-title">Pagina dedicata<br/>${escHtml(title)}.</h1>
      <p class="page-subtitle">Approfondimento dal listino prodotti aziendale, sincronizzato con le macro-categorie configurate nelle impostazioni.</p>
      <div class="macro-hero">
        <div class="macro-hero-img">
          ${imageUrl ? `<img src="${escHtml(imageUrl)}" alt="${escHtml(title)}"/>` : svgProdottoIcona(productIconType(macro.categoria))}
        </div>
        <div class="macro-copy">
          <h2>${escHtml(title)}</h2>
          ${description ? `<p>${escHtml(description)}</p>` : "<p>Completa la descrizione estesa nel listino prodotti per rendere questa pagina piu' convincente.</p>"}
          ${details.length > 0 ? `<div class="macro-pill-row">${details.map((detail) => `<span class="macro-pill">${escHtml(detail)}</span>`).join("")}</div>` : ""}
        </div>
      </div>
      <div class="callout callout-info">
        <span class="callout-icon">i</span>
        <div><strong>Contenuto collegato al listino.</strong> Foto, nome e descrizione non sono duplicati nel template PDF: vengono letti dalla macrocategoria prodotto.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageProduzione(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const mensili = calcolaProducibilitaMensile(d.flows.produzione_kwh);
  const source = roofSourceLabel(d.progetto.fonte_dati_tetto);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">La produzione</div>
      <h1 class="page-title">Quanta energia<br/>produrrai.</h1>
      <p class="page-subtitle">${fmtNum(d.flows.produzione_kwh)} kWh/anno · calcolato da ${escHtml(source)}${d.progetto.azimut ? ` sulla tua esposizione ${escHtml(d.progetto.azimut)}` : ""}.</p>
      ${renderRoofSourcePanel(d)}
      <div class="chart-card">
        <div class="chart-title">Producibilità mensile attesa (kWh)</div>
        <div class="chart-sub">Picchi maggio-luglio · ${escHtml(d.cliente.comune ?? "Italia")}${d.progetto.azimut ? ` · azimut ${escHtml(d.progetto.azimut)}` : ""}${d.progetto.inclinazione_tetto ? ` · inclinazione ${d.progetto.inclinazione_tetto}°` : ""}</div>
        ${svgProducibilitaMensile(mensili)}
      </div>
      <div class="kpi-row">
        <div class="kpi-block green"><div class="kpi-label">Producibilità totale</div><div class="kpi-value">${fmtNum(d.flows.produzione_kwh)} <span class="unit">kWh</span></div><div class="kpi-sub">Primo anno</div></div>
        <div class="kpi-block orange"><div class="kpi-label">Autoconsumato</div><div class="kpi-value">${fmtNum(d.flows.autoconsumo_kwh)} <span class="unit">kWh</span></div><div class="kpi-sub">Diretto + da accumulo</div></div>
        <div class="kpi-block"><div class="kpi-label">Ceduto in rete</div><div class="kpi-value">${fmtNum(d.flows.ceduto_rete_kwh)} <span class="unit">kWh</span></div><div class="kpi-sub">Energia non autoconsumata</div></div>
      </div>
      ${fasciaFotoPagina(d, "produzione", "center 45%")}
      ${d.progetto.has_accumulo ? calloutAccumulo(d) : ""}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

/**
 * «L'accumulo cambia tutto», con i numeri del preventivo: quanta dell'energia
 * prodotta resta in casa senza batteria e con la batteria, calcolate con lo stesso
 * modello. Prima la frase diceva «~35%» a tutti (è la base del solo profilo
 * misto: chi consuma di giorno parte dal 45%, di sera dal 25%), «il doppio» e un
 * risparmio pari al 40% di quello annuo: numeri che nessun calcolo aveva prodotto.
 */
function calloutAccumulo(d: FvPdfTemplateData): string {
  const senza = d.flows_senza_accumulo;
  const inPiu = senza ? d.flows.autoconsumo_kwh - senza.autoconsumo_kwh : 0;
  const testo = senza && inPiu > 0 && senza.autoconsumo_pct < d.flows.autoconsumo_pct
    ? `Senza batteria useresti in casa il ${fmtPct(senza.autoconsumo_pct, 0)} dell'energia che produci; con la batteria arrivi al ${fmtPct(d.flows.autoconsumo_pct, 0)}. Sono <strong>${fmtNum(inPiu)} kWh all'anno</strong> che restano a te invece di andare in rete.`
    : `La batteria conserva l'energia prodotta di giorno per usarla la sera: con l'accumulo usi in casa il ${fmtPct(d.flows.autoconsumo_pct, 0)} dell'energia che produci.`;
  return `<div class="callout callout-info">
        <span class="callout-icon">i</span>
        <div><strong>L'accumulo cambia tutto.</strong>
        ${testo}</div>
      </div>`;
}

function pageFlussi(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Flussi energetici</div>
      <h1 class="page-title">Dove va<br/>la tua energia.</h1>
      <p class="page-subtitle">Spiegato in modo semplice: cosa succede ai ${fmtNum(d.flows.produzione_kwh)} kWh che produci e ai ${fmtNum(d.progetto.consumo_annuo_kwh)} kWh che consumi.</p>
      <div class="chart-card">
        <div class="chart-title">Dove va l'energia che produci</div>
        <div class="chart-sub">L'elettricità non utilizzata direttamente in casa viene immessa nella rete</div>
        ${svgSankeyDoveVa(d.flows)}
      </div>
      <div class="chart-card">
        <div class="chart-title">Da dove viene l'energia che consumi</div>
        <div class="chart-sub">Dei ${fmtNum(d.progetto.consumo_annuo_kwh)} kWh che la tua casa usa in un anno, il ${fmtPct(d.flows.consumo_da_fv_pct, 0)} arriva dal tuo impianto</div>
        ${svgSankeyDaDoveViene(d.flows, d.progetto.consumo_annuo_kwh)}
      </div>
      <div class="kpi-row cols-2">
        <div class="kpi-big orange"><div class="kbig-label">Autoconsumo</div><div class="kbig-value">${fmtPct(d.flows.autoconsumo_pct, 0)}</div><div class="kbig-sub">della produzione la usi tu, non la regali alla rete.</div></div>
        <div class="kpi-big"><div class="kbig-label">Autosufficienza</div><div class="kbig-value">${fmtPct(d.flows.autosufficienza_pct, 0)}</div><div class="kbig-sub">del consumo casa arriva dal tuo sole, non dalla rete.</div></div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageRisparmio(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const bolletta = calcolaBollettaPrimaDopo({
    consumo_annuo_kwh: d.progetto.consumo_annuo_kwh,
    prelievo_rete_kwh: d.flows.prelievo_rete_kwh,
    prezzo_kwh: d.progetto.costo_kwh_attuale,
    ricavi_rid_eur: d.scenario.ricavi_rid_anno1_eur ?? null,
  });
  const conRid = Number(d.scenario.ricavi_rid_anno1_eur) > 0;
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Il risparmio</div>
      <h1 class="page-title">${fmtEur(d.scenario.risparmio_mensile_eur)} al mese<br/>che restano a te.</h1>
      <p class="page-subtitle">${conRid ? "Quello che non paghi più in bolletta, più quello che il GSE ti paga per l'energia che immetti in rete." : "Quello che non paghi più in bolletta."} Stima del primo anno, con il prezzo che paghi oggi.</p>
      <div class="kpi-row cols-2">
        <div class="kpi-big"><div class="kbig-label">Al mese</div><div class="kbig-value">${fmtEur(d.scenario.risparmio_mensile_eur)}</div><div class="kbig-sub">in media, il primo anno</div></div>
        <div class="kpi-big"><div class="kbig-label">All'anno</div><div class="kbig-value">${fmtEur(d.scenario.risparmio_anno1_eur)}</div><div class="kbig-sub">${conRid ? "bolletta più energia venduta, il primo anno" : "in bolletta, il primo anno"}</div></div>
      </div>
      <h3 style="font-size:11pt;color:#1E3A5F;margin:4mm 0 2mm;">La tua bolletta — prima e dopo</h3>
      <table>
        <thead><tr><th>Voce</th><th class="num-cell">Oggi (senza FV)</th><th class="num-cell">Con il fotovoltaico</th><th class="num-cell">Risparmio</th></tr></thead>
        <tbody>
          ${bolletta.map((r) => `<tr${r.is_total ? ' class="row-total"' : ""}><td>${escHtml(r.voce)}</td><td class="num-cell">${r.is_kwh_row ? `${fmtNum(r.oggi_eur)} kWh` : r.oggi_eur === 0 && r.con_fv_eur < 0 ? "—" : fmtEur(r.oggi_eur)}</td><td class="num-cell">${r.is_kwh_row ? `${fmtNum(r.con_fv_eur)} kWh` : fmtEur(r.con_fv_eur)}</td><td class="num-cell ${r.risparmio_eur === 0 ? "saving-zero" : "saving"}">${r.is_kwh_row ? `−${Math.abs(r.risparmio_eur)}%` : r.risparmio_eur === 0 ? "0 €" : fmtEur(r.risparmio_eur)}</td></tr>`).join("")}
        </tbody>
      </table>
      ${fasciaFotoPagina(d, "risparmio", "center 55%")}
      <div class="callout callout-success">
        <span class="callout-icon">★</span>
        <div><strong>Il risparmio si misura in kWh, non in euro.</strong>
        La stima usa il prezzo che paghi oggi, ${escHtml(fmtNum(d.progetto.costo_kwh_attuale, 2))} € per kWh: se l'energia rincara, ogni kWh prodotto in casa vale di più; se cala, vale un po' meno.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageCostiFuturi(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  // L'inflazione dell'energia del calcolo finanziario (2,5% di serie): prima qui era 3%,
  // e i 20 anni non tornavano con la cassa a 25 anni.
  const inflazione = Number(d.scenario.inflazione_energia_pct) > 0 ? Number(d.scenario.inflazione_energia_pct) * 100 : 2.5;
  const costi = calcolaCosti20Anni({
    consumo_annuo_kwh: d.progetto.consumo_annuo_kwh,
    prelievo_rete_kwh: d.flows.prelievo_rete_kwh,
    prezzo_kwh_attuale: d.progetto.costo_kwh_attuale,
    inflazione_perc: inflazione,
    orizzonte_anni: 20,
  });
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Costi energetici futuri</div>
      <h1 class="page-title">Quanto pagherai<br/>nei prossimi 20 anni.</h1>
      <p class="page-subtitle">La bolletta di ogni anno, senza il fotovoltaico e con il tuo impianto. Ipotesi: prezzo dell'energia in crescita del ${escHtml(fmtNum(inflazione, 1))}% l'anno.</p>
      <div class="chart-card">
        <div class="chart-title">Spesa annuale per l'elettricità — anno per anno</div>
        <div class="chart-sub">Senza FV (arancione) vs con il tuo impianto (verde) · scala in € all'anno</div>
        ${svgCosti20Anni(costi)}
      </div>
      <div class="kpi-row cols-2">
        <div class="kpi-big red"><div class="kbig-label">Senza fotovoltaico</div><div class="kbig-value">~${fmtEur(costi.totale_senza_fv_eur)}</div><div class="kbig-sub">spesi in 20 anni di bollette</div></div>
        <div class="kpi-big"><div class="kbig-label">Con fotovoltaico</div><div class="kbig-value">~${fmtEur(costi.totale_con_fv_eur)}</div><div class="kbig-sub">spesi in 20 anni · ${fmtEur(costi.totale_risparmio_eur)} in meno in bolletta</div></div>
      </div>
      ${fasciaFotoPagina(d, "costi", "center 42%", true)}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

type FvFinanziamentoPdf = NonNullable<FvPdfTemplateData["finanziamento"]>;

/** Un tasso che non c'è si dichiara, non si inventa. */
function fmtTasso(valore: number | null): string {
  return valore == null ? "n.d." : `${fmtNum(valore, 2)}%`;
}

// Esce solo con un finanziamento vero (vedi pagineDaDisegnare). Prima, senza,
// stampava una rata pari al 120% del prezzo in 84 mesi con TAN 4,75% e TAEG 5,4%.
function pagePiano(d: FvPdfTemplateData, fin: FvFinanziamentoPdf, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const rata = fin.rata_mensile;
  const risparmioM = d.scenario.risparmio_mensile_eur;
  const netto = Math.max(0, rata - risparmioM);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">★ Il piano economico</div>
      <h1 class="page-title">${fmtEur(netto)} al mese.<br/><span style="color:#F97316">Tutto qui.</span></h1>
      <p class="page-subtitle">Quello che esce davvero dal tuo conto, ogni mese.${netto / 30 <= 1.5 ? " Meno di un caffè al giorno." : ""}</p>
      <div class="split-3">
        <div class="num-card navy"><div class="nc-label">Rata ${escHtml(fin.finanziaria.split(" ")[0])}</div><div class="nc-value">${fmtEur(rata)}</div><div class="nc-period">×${fin.durata_mesi} mesi${fin.taeg_perc != null ? ` · TAEG ${fmtNum(fin.taeg_perc, 2)}%` : ""}</div></div>
        <div class="num-card green"><div class="nc-label">Risparmio bolletta</div><div class="nc-value">${fmtEur(risparmioM)}</div><div class="nc-period">/mese · primo anno</div></div>
        <div class="num-card orange"><div class="nc-label">Costo netto reale</div><div class="nc-value">${fmtEur(netto)}</div><div class="nc-period">/mese · ${fmtEur(rata)} − ${fmtEur(risparmioM)}</div></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Rata vs risparmio bolletta — visivamente</div>
        <div class="chart-sub">La rata pesa ${fmtEur(rata)}. Ne recuperi ${fmtEur(risparmioM)} subito. Esborso netto: ${fmtEur(netto)}.</div>
        ${svgRataRisparmio(rata, risparmioM, netto)}
      </div>
      <table>
        <tbody>
          <tr><td>Importo finanziato</td><td class="num-cell">${fmtEur(fin.importo_finanziato)}</td><td>Durata</td><td class="num-cell">${fin.durata_mesi} rate</td></tr>
          <tr><td>Finanziaria</td><td class="num-cell">${escHtml(fin.finanziaria)}</td><td>Rata mensile</td><td class="num-cell" style="color:#F97316;">${fmtEur(rata)}</td></tr>
          <tr><td>TAN nominale</td><td class="num-cell">${fmtTasso(fin.tan_perc)}</td><td>TAEG (incluse spese)</td><td class="num-cell">${fmtTasso(fin.taeg_perc)}</td></tr>
        </tbody>
      </table>
      ${fasciaFotoPagina(d, "piano", "center 45%", true)}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageBollette240(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  // Costo bollette previsto in 25 anni senza FV
  const costo25senzaFV =
    d.progetto.consumo_annuo_kwh *
    d.progetto.costo_kwh_attuale *
    25 *
    1.6; // fattore inflazione composta 25 anni @3%
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Perché farlo adesso</div>
      <h1 class="page-title">Bollette: <span style="color:#DC2626">+240%</span><br/>Stipendio: <span style="color:#F97316">+11,5%</span></h1>
      <p class="page-subtitle">In 10 anni le bollette si sono triplicate. Il reddito delle famiglie italiane no. Fonte: Codacons + ISTAT.</p>
      <div class="kpi-row">
        <div class="kpi-big red"><div class="kbig-label">Bolletta luce</div><div class="kbig-value">+240%</div><div class="kbig-sub">2012 → 2022 · Codacons</div></div>
        <div class="kpi-big orange"><div class="kbig-label">Solo dal 2019</div><div class="kbig-value">+107%</div><div class="kbig-sub">2019 → 2024 · Confcommercio</div></div>
        <div class="kpi-big" style="background:#F1F5F9;border-color:#CBD5E1;"><div class="kbig-label" style="color:#475569;">Reddito famiglie</div><div class="kbig-value" style="color:#475569;">+11,5%</div><div class="kbig-sub" style="color:#475569;">Stesso periodo · ISTAT</div></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">La forbice che si apre</div>
        <div class="chart-sub">Indici 100 al 2012 — bollette luce vs reddito netto famiglie italiane</div>
        ${svgForbice()}
      </div>
      ${fasciaFotoPagina(d, "bollette", "center 40%")}
      <div class="callout callout-tip">
        <span class="callout-icon">★</span>
        <div><strong>Senza FV, in 25 anni ${escHtml(d.cliente.nome)} pagherà ~${fmtEur(costo25senzaFV)} di bollette.</strong>
        Con il fotovoltaico, solo la parte che prendi ancora dalla rete. L'energia che produci sul tuo tetto non segue i rincari del mercato.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageCassa25(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const cassa = d.scenario.cassa_anno_per_anno;
  const final = cassa.length > 0 ? cassa[cassa.length - 1].cumulato : d.scenario.risparmio_25_anni_eur;
  // Gli eventi seguono il calcolo (fv-calcolo-finanziario): investimento pagato
  // all'anno 0, inverter sostituito al 12°. Prima la tabella parlava di una
  // «rata Cofidis» finita al 7° anno, di un inverter da ~1.000 € al 15°, di un
  // pareggio al 9° anche quando non era calcolato, e dava 0 € agli anni mancanti.
  const payback = d.scenario.payback_anni;
  const eventi = [
    { anno: 0, descr: "Installazione · investimento iniziale", cumulato: cassa[0]?.cumulato ?? -d.costi.prezzo_vendita_iva_inclusa },
    ...(payback != null ? [{ anno: payback, descr: "★ La spesa è ripagata: da qui in poi è guadagno", cumulato: 0 }] : []),
    { anno: 12, descr: "Anno indicativo di sostituzione dell'inverter", cumulato: cassa.find((c) => c.anno === 12)?.cumulato },
    { anno: 25, descr: "Fine del periodo analizzato", cumulato: final },
  ]
    .filter((e): e is { anno: number; descr: string; cumulato: number } => e.cumulato != null)
    .sort((a, b) => a.anno - b.anno);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">La cassa nei 25 anni</div>
      <h1 class="page-title">${final > 0 ? "+" : ""}${fmtEur(final)}<br/>nelle tue tasche.</h1>
      <p class="page-subtitle">Quello che ti resta dopo 25 anni, tolta la spesa${payback != null ? `: la ripaghi in circa ${escHtml(fmtNum(Math.round(payback)))} anni` : ""}. Stima con le ipotesi del preventivo.</p>
      <div class="chart-card">
        <div class="chart-title">Cassa cumulata anno per anno</div>
        <div class="chart-sub">Investimento iniziale, risparmio in bolletta, energia ceduta alla rete${d.costi.detrazione_eur > 0 ? " e detrazione fiscale" : ""}</div>
        ${svgCassaCumulata(cassa, d.scenario.payback_anni, final)}
      </div>
      <table>
        <thead><tr><th>Anno</th><th>Cosa succede</th><th class="num-cell">Cassa cumulata</th></tr></thead>
        <tbody>
          ${eventi.map((e) => `<tr${e.anno === payback ? ' class="row-total"' : ""}><td><strong>${escHtml(Number.isInteger(e.anno) ? String(e.anno) : fmtNum(e.anno, 1))}</strong></td><td>${escHtml(e.descr)}</td><td class="num-cell" style="color:${(e.cumulato ?? 0) >= 0 ? "#16A34A" : "#DC2626"};">${fmtEur(e.cumulato ?? 0)}</td></tr>`).join("")}
        </tbody>
      </table>
      ${fasciaFotoPagina(d, "cassa", "center 55%", true)}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

/**
 * Pittogrammi disegnati, non emoji. Le emoji le disegna il computer che stampa:
 * su un Mac sono quelle colorate di Apple, su un server Linux quadratini vuoti.
 * E una fila di venti alberelli a colori non sta in un documento da consegnare.
 * Questi sono tracciati in tinta unita, nel colore dell'azienda (il blu di serie
 * qui sotto lo cambia `applicaTemaFv`, come nel resto del documento).
 */
const PITTOGRAMMI = {
  albero: "M12 2 5.5 11H9l-4 6h6v5h2v-5h6l-4-6h3.5z",
  volo: "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z",
  auto: "M18.9 6a1.5 1.5 0 0 0-1.4-1h-11a1.5 1.5 0 0 0-1.4 1L3 12v8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h12v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-8zM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM5 11l1.5-4.5h11L19 11z",
} as const;

/** «TELEFONO  02 1234567»: un'etichetta piccola al posto dell'emoji della cornetta. */
function etichettaContatto(nome: string): string {
  return `<span style="display:inline-block;min-width:17mm;font-size:7pt;letter-spacing:0.08em;text-transform:uppercase;color:#94A3B8;font-weight:600;">${nome}</span>`;
}

function filaDiPittogrammi(quale: keyof typeof PITTOGRAMMI, quanti: number): string {
  const uno = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="fill:#1E3A5F;margin-right:1.1mm;vertical-align:middle;"><path d="${PITTOGRAMMI[quale]}"/></svg>`;
  return uno.repeat(Math.max(0, Math.floor(quanti) || 0));
}

function pageCO2(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const co2 = calcolaCO2Equivalenze({ produzione_kwh_anno: d.flows.produzione_kwh });
  const treesIcons = filaDiPittogrammi("albero", Math.min(20, Math.round(co2.alberi_anno / 8)));
  const flightsIcons = filaDiPittogrammi("volo", Math.min(20, co2.voli_anno));
  const carsIcons = filaDiPittogrammi("auto", Math.min(10, Math.round(co2.km_auto_anno / 2500)));
  // Un paragone calcolato sul numero vero: prima c'era scritto a tutti «quasi un
  // giro del mondo all'anno», anche con 19.700 km (mezzo giro).
  const viaggiMilanoRoma = Math.round(co2.km_auto_anno / 575);
  const paragoneKm = viaggiMilanoRoma >= 1 ? ` Come ${fmtNum(viaggiMilanoRoma)} ${viaggiMilanoRoma === 1 ? "viaggio" : "viaggi"} Milano–Roma.` : "";
  const foto = d.foto_di_serie;
  const conFoto = Boolean(foto?.alberi && foto?.voli && foto?.auto && foto?.bosco);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">L'impatto sul pianeta</div>
      <h1 class="page-title">${fmtNum(co2.ton_co2_anno, 2)} t di CO<sub>2</sub><br/>in meno ogni anno.</h1>
      <p class="page-subtitle">Il tuo impianto è un bosco a casa tua. Ecco cosa significa, in modo concreto.</p>
      ${conFoto ? `<div class="co2-foto">
        <img src="${foto!.bosco}" alt="" />
        <div class="co2-foto-testo">
          <div class="etichetta">CO₂ evitata in 25 anni</div>
          <div class="valore">${fmtNum(co2.ton_co2_totale, 1)} tonnellate</div>
          <div class="sub">${fmtNum(co2.kg_co2_anno)} kg ogni anno: come una piccola foresta nel tuo cortile.</div>
        </div>
      </div>
      <h3 style="font-size:11pt;color:#1E3A5F;margin:3mm 0 2mm;">Ciò corrisponde, ogni anno, a:</h3>
      <div class="co2-carte">
        <div class="co2-carta"><img src="${foto!.alberi}" alt="" /><div class="corpo"><div class="num">${fmtNum(co2.alberi_anno)}</div><div class="cosa">Alberi</div><div class="desc">che assorbono la stessa CO₂: un albero medio ne assorbe circa 25 kg l'anno.</div></div></div>
        <div class="co2-carta"><img src="${foto!.voli}" alt="" /><div class="corpo"><div class="num">${fmtNum(co2.voli_anno)}</div><div class="cosa">Voli evitati</div><div class="desc">Milano–Maiorca, in CO₂: un volo breve in Europa ne emette circa 200 kg.</div></div></div>
        <div class="co2-carta"><img src="${foto!.auto}" alt="" /><div class="corpo"><div class="num">${fmtNum(co2.km_auto_anno)}</div><div class="cosa">Km in auto</div><div class="desc">non percorsi con un'auto a benzina (circa 150 g di CO₂ al km).${paragoneKm}</div></div></div>
      </div>` : `<div class="kpi-big" style="text-align:center;padding:8mm;margin:4mm 0;">
        <div class="kbig-label" style="margin-bottom:2mm;">CO₂ evitata in 25 anni</div>
        <div class="kbig-value" style="font-size:42pt;">${fmtNum(co2.ton_co2_totale, 1)} tonnellate</div>
        <div class="kbig-sub" style="font-size:9pt;margin-top:2mm;">${fmtNum(co2.kg_co2_anno)} kg/anno · pari a una piccola foresta nel tuo cortile</div>
      </div>
      <h3 style="font-size:11pt;color:#1E3A5F;margin:4mm 0 2mm;">Ciò corrisponde a (ogni anno):</h3>
      <div class="eq-row"><div class="eq-num">${fmtNum(co2.alberi_anno)}<small>Alberi</small></div><div><div class="eq-icons">${treesIcons}</div><div class="eq-desc">Una piccola foresta che assorbe la stessa CO₂. Ogni albero medio assorbe ~25 kg di CO₂ all'anno.</div></div></div>
      <div class="eq-row"><div class="eq-num">${fmtNum(co2.voli_anno)}<small>Voli</small></div><div><div class="eq-icons">${flightsIcons}</div><div class="eq-desc">Voli evitati Milano → Maiorca, in equivalenza CO₂. Un volo medio EU breve emette ~200 kg di CO₂.</div></div></div>
      <div class="eq-row"><div class="eq-num">${fmtNum(co2.km_auto_anno)}<small>Km auto</small></div><div><div class="eq-icons">${carsIcons}</div><div class="eq-desc">Chilometri non percorsi con un'auto a benzina (~150 g CO₂/km).${paragoneKm}</div></div></div>`}
      <div class="callout callout-success">
        <span class="callout-icon">✓</span>
        <div><strong>Energia pulita, prodotta sul tuo tetto.</strong>
        Ogni kWh che autoconsumi è energia che non prelevi dalla rete.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

// ─── I blocchi della libreria: come funziona, sicurezza sul tetto… ──────────
// Testi e foto di serie per il fotovoltaico (_shared/blocchiPreventivo.ts), con
// sopra quello che l'azienda ha cambiato. Le foto arrivano già pronte in
// `blocchi_foto`; senza, il blocco esce con i soli testi.

function bloccoFv(d: FvPdfTemplateData, id: PaginaBlocco) {
  const chiave = PAGINE_BLOCCO[id];
  const blocco = leggiBlocco(chiave, "fotovoltaico", d.template?.pdf_blocchi);
  const foto = (d.blocchi_foto?.[chiave] ?? []).filter((f) => imageHref(f.src)).slice(0, 2);
  return { blocco, foto };
}

/** Un blocco esce solo se ha qualcosa da mostrare. */
function bloccoHaContenuto(d: FvPdfTemplateData, id: PaginaBlocco): boolean {
  const { blocco, foto } = bloccoFv(d, id);
  return blocco.voci.length > 0 || foto.length > 0;
}

/**
 * La foto di una pagina, nella fascia che prende solo lo spazio libero (.foto-fascia):
 * con la pagina piena si restringe o sparisce, mai una pagina che sborda.
 */
function fasciaFotoPagina(d: FvPdfTemplateData, pagina: PaginaConFotoFv, posizione = "center", alta = false): string {
  const src = imageHref(d.foto_pagine?.[pagina] ?? null);
  return src ? `<div class="foto-fascia${alta ? " alta" : ""}"><img src="${escHtml(src)}" alt="" style="object-position:${posizione};" /></div>` : "";
}

/** «Dal tuo tetto *alla tua presa*.»: la parola fra asterischi nel colore dell'accento. */
function titoloConAccento(titolo: string): string {
  return escHtml(titolo).replace(/\*([^*]+)\*/g, '<span class="accento">$1</span>');
}

function pageBlocco(d: FvPdfTemplateData, id: PaginaBlocco, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const { blocco, foto } = bloccoFv(d, id);
  // Con una spiegazione le voci stanno su due colonne; solo titoli, su tre.
  const tre = !blocco.voci.some((v) => v.testo);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">${escHtml(blocco.occhiello)}</div>
      <h1 class="page-title blocco-titolo">${titoloConAccento(blocco.titolo)}</h1>
      ${blocco.intro ? `<p class="page-subtitle">${escHtml(blocco.intro)}</p>` : ""}
      ${foto.length > 0 ? `<div class="blocco-foto${foto.length > 1 ? " due" : ""}">${foto.map((f) => `<img src="${escHtml(imageHref(f.src) ?? "")}" alt="" />`).join("")}</div>
      ${blocco.nota && foto.some((f) => f.diSerie) ? `<div class="blocco-nota">${escHtml(blocco.nota)}</div>` : ""}` : ""}
      <div class="blocco-voci${tre ? " tre" : ""}">
        ${blocco.voci.map((v) => `<div class="blocco-voce">
          <span class="blocco-icona">${v.icona ? iconaSvg(v.icona, "#C2410C", 15) : ""}</span>
          <div><div class="blocco-voce-titolo">${escHtml(v.titolo)}</div>${v.testo ? `<div class="blocco-voce-testo">${escHtml(v.testo)}</div>` : ""}</div>
        </div>`).join("")}
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageGaranzie(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const chiSiamoTitolo = plainText(d.template?.chi_siamo_titolo) || "L'azienda dietro al tuo impianto";
  const presentazione = safeRichText(d.template?.presentazione_impresa_html);
  const teamImage = imageHref(d.template?.foto_team_url);
  // Con la pagina «Dicono di noi» le recensioni e i cantieri stanno lì, non qui.
  const provaAltrove = pagineDaDisegnare(d).some((pg) => pg.id === "recensioni");
  const recensioni = provaAltrove ? [] : recensioniFv(d).slice(0, 2);
  const cantieriQui = provaAltrove ? [] : (d.cantieri_foto ?? []);
  const certificazioni = (d.template?.certificazioni ?? [])
    .filter((cert) => plainText(cert.nome).length > 0)
    .slice(0, 4);
  // Senza garanzie scritte nel modello si parla solo di ciò che è certo: la
  // garanzia del produttore dei componenti scelti (con gli anni, se il listino
  // li ha) e quella di legge sui lavori. Prima si promettevano intervento entro
  // 48 ore, estensioni a 15 anni e una polizza RC a nome dell'azienda.
  const perCategoria = (categoria: string) => d.componenti.find((c) => c.categoria === categoria);
  const garanziaProduttore = (anni: number | null | undefined) =>
    anni && anni > 0
      ? `Garanzia del produttore di ${anni} anni, alle condizioni della scheda tecnica.`
      : "Garanzia del produttore, alle condizioni della scheda tecnica.";
  const anniPannelli = perCategoria("pannello")?.garanzia_anni || null;
  const contatti = [d.azienda.phone, d.azienda.email].filter(Boolean).join(" · ");
  const defaultGaranzie = [
    perCategoria("pannello") ? { icona: "sun", titolo: "Pannelli", descrizione: garanziaProduttore(anniPannelli) } : null,
    perCategoria("inverter") ? { icona: "award", titolo: "Inverter", descrizione: garanziaProduttore(perCategoria("inverter")?.garanzia_anni) } : null,
    perCategoria("accumulo") ? { icona: "battery", titolo: "Accumulo", descrizione: garanziaProduttore(perCategoria("accumulo")?.garanzia_anni) } : null,
    { icona: "tools", titolo: "Lavori di installazione", descrizione: `I lavori eseguiti da ${d.azienda.name} sono coperti dalla garanzia di legge.` },
    contatti ? { icona: "shield", titolo: "Assistenza", descrizione: `Per qualsiasi necessità: ${contatti}.` } : null,
  ].filter((g): g is { icona: string; titolo: string; descrizione: string } => g !== null);
  const customGaranzie = (d.template?.garanzie_conversione ?? [])
    .filter((g) => plainText(g.titolo).length > 0 && plainText(g.descrizione).length > 0)
    .map((g) => ({
      icona: g.icona ?? "shield",
      titolo: plainText(g.titolo),
      descrizione: plainText(g.descrizione),
    }));
  const garanzie = (customGaranzie.length > 0 ? customGaranzie : defaultGaranzie).slice(0, 4);
  const customUsp = (d.template?.usp ?? [])
    .filter((u) => plainText(u.titolo).length > 0)
    .map((u) => ({ titolo: plainText(u.titolo), descrizione: plainText(u.descrizione) }))
    .slice(0, 6);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Garanzie e assistenza</div>
      <h1 class="page-title">${anniPannelli ? `${anniPannelli} anni di<br/>tranquillità.` : "Garanzie e<br/>assistenza."}</h1>
      <p class="page-subtitle">Le garanzie reali sui componenti, sulla manodopera e sulla nostra azienda.</p>
      ${presentazione || teamImage ? `<div class="callout callout-info">
        <span class="callout-icon">i</span>
        <div><strong>${escHtml(chiSiamoTitolo)}</strong>
          ${teamImage ? `<div style="float:right;width:34mm;height:24mm;margin:0 0 2mm 4mm;border-radius:7px;overflow:hidden;border:1px solid #CBD5E1;"><img src="${escHtml(teamImage)}" alt="${escHtml(chiSiamoTitolo)}" style="width:100%;height:100%;object-fit:cover;"/></div>` : ""}
          ${presentazione ? `<div class="rich-text">${presentazione}</div>` : ""}
        </div>
      </div>` : ""}
      <div class="guarantee-grid">
        ${garanzie.map((g) => {
          const badge = imageHref(d.badge_garanzie?.[g.icona as keyof typeof BADGE_GARANZIE_FV] ?? d.badge_garanzie?.shield);
          return badge
            ? `<div class="guarantee-card con-badge"><img class="g-badge" src="${escHtml(badge)}" alt="" /><div><div class="g-title">${escHtml(g.titolo)}</div><div class="g-desc">${escHtml(g.descrizione)}</div></div></div>`
            : `<div class="guarantee-card"><div class="g-num">${escHtml(guaranteeIconLabel(g.icona))}</div><div class="g-title">${escHtml(g.titolo)}</div><div class="g-desc">${escHtml(g.descrizione)}</div></div>`;
        }).join("")}
      </div>
      <h3 style="font-size:11pt;color:#1E3A5F;margin:4mm 0 2mm;">${customUsp.length > 0 ? "Perché scegliere noi" : "L'azienda"}</h3>
      <ul class="bullets">
        ${customUsp.length > 0
          ? customUsp.map((u) => `<li><strong>${escHtml(u.titolo)}</strong>${u.descrizione ? ` — ${escHtml(u.descrizione)}` : ""}</li>`).join("")
          : `<li><strong>${escHtml(d.azienda.name)}</strong></li>${d.azienda.website ? `<li>${escHtml(d.azienda.website)}</li>` : ""}${d.azienda.vat_number ? `<li>P.IVA ${escHtml(d.azienda.vat_number)}</li>` : ""}`}
        ${certificazioni.map((cert) => `<li>${escHtml(plainText(cert.nome))}${plainText(cert.ente) ? ` · ${escHtml(plainText(cert.ente))}` : ""}</li>`).join("")}
      </ul>
      ${recensioni.length > 0 ? `<h3 style="font-size:11pt;color:#1E3A5F;margin:3mm 0 2mm;">Cosa dicono i clienti</h3>
        <div class="kpi-row cols-2">
          ${recensioni.map((rec) => {
            const fotoRec = imageHref(rec.foto_url);
            return `<div class="kpi-block">${fotoRec ? `<div style="height:26mm;border-radius:6px;overflow:hidden;border:1px solid #E2E8F0;margin-bottom:2mm;"><img src="${escHtml(fotoRec)}" alt="Impianto installato" style="width:100%;height:100%;object-fit:cover;"/></div>` : ""}<div class="kpi-label">${escHtml([plainText(rec.citta), plainText(rec.intervento)].filter(Boolean).join(" · ") || "Recensione")}</div><div class="kpi-sub" style="font-size:8pt;color:#475569;">"${escHtml(plainText(rec.quote))}"</div><div class="kpi-value" style="font-size:11pt;margin-top:2mm;">${escHtml(plainText(rec.autore))}</div></div>`;
          }).join("")}
        </div>` : ""}
      ${cantieriQui.length > 0 ? `<h3 style="font-size:11pt;color:#1E3A5F;margin:3mm 0 2mm;">I nostri cantieri</h3>
        <div style="display:grid;grid-template-columns:repeat(${Math.min(cantieriQui.length, 3)},1fr);gap:2mm;">
          ${cantieriQui.slice(0, 3).map((src) => `<div style="height:28mm;border-radius:6px;overflow:hidden;border:1px solid #E2E8F0;"><img src="${escHtml(src)}" alt="Cantiere installato" style="width:100%;height:100%;object-fit:cover;"/></div>`).join("")}
        </div>` : ""}
      ${fasciaFotoPagina(d, "garanzie", "center 60%", true)}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageIter(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const intro = safeRichText(d.template?.percorso_cliente_intro);
  const customCrono = (d.template?.cronoprogramma ?? [])
    .filter((c) => plainText(c.fase).length > 0)
    .map((c) => ({
      fase: plainText(c.fase),
      durata: plainText(c.durata),
      descrizione: plainText(c.descrizione),
    }))
    .slice(0, 8);
  // Fasi senza tempi né promesse: settimane, squadre da 3 tecnici e «Scambio Sul
  // Posto» non si stampano a nome dell'azienda se non li ha scritti lei.
  const fasiStandard = [
    d.finanziamento
      ? { fase: "Firma e richiesta di finanziamento", descrizione: "Firmi la proposta e presenti la richiesta alla finanziaria." }
      : { fase: "Firma della proposta", descrizione: "Firmi la proposta e fissiamo il sopralluogo tecnico." },
    { fase: "Pratiche e richiesta di connessione", descrizione: `Comunicazioni al Comune${d.cliente.comune ? ` di ${d.cliente.comune}` : ""} e domanda di connessione al distributore di rete.` },
    { fase: "Ordine dei componenti", descrizione: `Pannelli, inverter${d.progetto.has_accumulo ? " e accumulo" : ""} scelti in questa proposta.` },
    { fase: "Installazione", descrizione: "Montaggio della struttura e dei pannelli, cablaggio e prove di funzionamento." },
    { fase: "Allaccio alla rete", descrizione: "Il distributore attiva la connessione: da qui l'impianto produce per te." },
    { fase: "Documentazione finale", descrizione: d.costi.detrazione_eur > 0 ? "Dichiarazione di conformità, manuali e documenti per la detrazione." : "Dichiarazione di conformità e manuali." },
  ];
  const defaultTimeline = fasiStandard
    .map((f, i) => `<div class="tl-item"><div class="tl-day">Fase ${i + 1}</div><div class="tl-title">${escHtml(f.fase)}</div><div class="tl-desc">${escHtml(f.descrizione)}</div></div>`)
    .join("");
  const customTimeline = customCrono
    .map((c) => `<div class="tl-item"><div class="tl-day">${escHtml(c.durata || "—")}</div><div class="tl-title">${escHtml(c.fase)}</div>${c.descrizione ? `<div class="tl-desc">${escHtml(c.descrizione)}</div>` : ""}</div>`)
    .join("");
  // Con più di sei fasi i servizi non stanno anche qui: la pagina sbordava e il
  // fondo si tagliava. Restano elencati nella pagina dell'investimento («Cosa è incluso»).
  const quanteFasi = customCrono.length > 0 ? customCrono.length : fasiStandard.length;
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Iter pratiche</div>
      <h1 class="page-title">Pensiamo a<br/>tutto noi.</h1>
      <p class="page-subtitle">Tu firmi una sola volta. Ecco i passaggi fino all'accensione dell'impianto.</p>
      ${intro ? `<div class="callout callout-info"><span class="callout-icon">i</span><div><strong>Il percorso cliente</strong><div class="rich-text">${intro}</div></div></div>` : ""}
      <div class="tl">
        ${customCrono.length > 0 ? customTimeline : defaultTimeline}
      </div>
      ${quanteFasi <= 6 ? renderServiziInclusi(d) : ""}
      ${d.foto_di_serie?.installatori ? `<div class="foto-fascia"><img src="${d.foto_di_serie.installatori}" alt="" style="object-position:center 55%;" /></div>` : ""}
      <div class="callout callout-success">
        <span class="callout-icon">✓</span>
        <div><strong>Tu firmi una volta sola.</strong>
        Le pratiche comprese nella proposta le seguiamo noi. I tempi dipendono anche dal Comune e dal distributore di rete.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

/** Le domande frequenti scritte dall'azienda nel modello. Senza, la pagina non
 *  esce: le risposte di prima («il finanziamento si estingue senza penali»,
 *  «la casa vale l'8-12% in più») erano promesse che nessuno aveva fatto. */
function faqDellAzienda(d: FvPdfTemplateData): Array<{ q: string; a: string }> {
  return (d.template?.faq_items ?? [])
    .filter((f) => plainText(f.domanda).length > 0 && plainText(f.risposta).length > 0)
    .map((f) => ({ q: plainText(f.domanda), a: plainText(f.risposta) }))
    .slice(0, 8);
}

/** Le recensioni scritte nel modello: con le parole e con chi le ha dette. */
function recensioniFv(d: FvPdfTemplateData) {
  return (d.template?.recensioni ?? [])
    .filter((rec) => plainText(rec.quote).length > 0 && plainText(rec.autore).length > 0);
}

function votiFv(d: FvPdfTemplateData): VotoOnline[] {
  return leggiVotiOnline(d.voti_online);
}

/** «Dicono di noi» esce se c'è qualcosa da mostrare: un voto, una recensione, una foto di impianto. */
function haPaginaRecensioni(d: FvPdfTemplateData): boolean {
  return votiFv(d).length > 0 || recensioniFv(d).length > 0 || (d.cantieri_foto ?? []).length > 0;
}

let contatoreStelle = 0;
/** Le cinque stelle in SVG, piene quanto il voto (l'ultima a metà, se serve). */
function stelleSvg(voto: number, lato = 13): string {
  return stellePiene(voto).map((pieno) => {
    const id = `st${++contatoreStelle}`;
    return `<svg width="${lato}" height="${lato}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}"><stop offset="${pieno}" stop-color="${ORO_STELLE}"/><stop offset="${pieno}" stop-color="#D5D9DF"/></linearGradient></defs><polygon points="${PUNTI_STELLA}" fill="url(#${id})"/></svg>`;
  }).join("");
}

const meseAnno = (iso: string | null): string | null => {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
};

function pageRecensioni(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const voti = votiFv(d);
  const recensioni = recensioniFv(d).slice(0, 4);
  const impianti = (d.cantieri_foto ?? []).slice(0, 3);
  const quando = meseAnno([...voti.map((v) => v.aggiornato).filter((x): x is string => Boolean(x))].sort()[0] ?? null);
  const sottotitolo = voti.length > 0 && recensioni.length > 0
    ? "Il nostro voto sulle piattaforme di recensioni e le parole di chi ha già scelto un nostro impianto."
    : voti.length > 0
      ? "Il nostro voto sulle piattaforme di recensioni: le recensioni si leggono tutte sulle nostre schede."
      : recensioni.length > 0 ? "Le parole di chi ha già scelto un nostro impianto." : "Alcuni impianti che abbiamo già installato.";
  // Con un numero dispari di recensioni la prima prende tutta la riga.
  const larga = (i: number) => recensioni.length % 2 === 1 && i === 0;
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Dicono di noi</div>
      <h1 class="page-title">La parola ai<br/>nostri clienti.</h1>
      <p class="page-subtitle">${escHtml(sottotitolo)}</p>
      ${voti.length > 0 ? `<div class="voti-row" style="grid-template-columns:repeat(${voti.length},1fr);">
        ${voti.map((v) => {
          const conta = recensioniScritte(v.numero);
          const indirizzo = indirizzoDaLeggere(v.link, voti.length === 1 ? 60 : 30);
          return `<div class="voto-card"><div class="voto-nome">${escHtml(v.nome)}</div><div class="voto-numero">${votoScritto(v.voto)}<small>su 5</small></div><div class="stelle">${stelleSvg(v.voto)}</div>${conta ? `<div class="voto-conta">${escHtml(conta)}</div>` : ""}${indirizzo ? `<div class="voto-link">${escHtml(indirizzo)}</div>` : ""}</div>`;
        }).join("")}
      </div>
      <p class="voti-nota">Voti e numero di recensioni come compaiono sulle piattaforme${quando ? `, a ${escHtml(quando)}` : ""}.</p>` : ""}
      ${recensioni.length > 0 ? `<div class="citazioni">
        ${recensioni.map((rec, i) => `<div class="citazione${larga(i) ? " larga" : ""}"><p>«${escHtml(plainText(rec.quote).replace(/^[«"“]+|[»"”]+$/g, ""))}»</p><div class="firma">${escHtml([plainText(rec.autore), plainText(rec.citta), plainText(rec.intervento)].filter(Boolean).join("  ·  "))}</div></div>`).join("")}
      </div>` : ""}
      ${impianti.length > 0
        // Gli impianti dell'azienda riempiono il fondo della pagina, come le fasce foto.
        // Una foto di serie sotto «I nostri impianti» sembrerebbe un impianto loro.
        ? `<h3 class="impianti-titolo">I nostri impianti</h3>
        <div class="foto-fascia impianti-fascia"><div class="impianti" style="grid-template-columns:repeat(${impianti.length},1fr);">
          ${impianti.map((src) => `<img src="${escHtml(src)}" alt="Impianto installato"/>`).join("")}
        </div></div>`
        : fasciaFotoPagina(d, "recensioni", "center 55%", true)}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageFAQ(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const faqs = faqDellAzienda(d);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Domande frequenti</div>
      <h1 class="page-title">Le domande<br/>che fanno tutti.</h1>
      <div style="margin-top:4mm;">
        ${faqs.map((f) => `<div class="qa-item"><div class="qa-q">${escHtml(f.q)}</div><div class="qa-a">${escHtml(f.a)}</div></div>`).join("")}
      </div>
      ${fasciaFotoPagina(d, "faq", "center 40%", true)}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

/**
 * I numeri che giustificano la decisione, presi dai calcoli del preventivo: solo
 * quelli che ci sono davvero (niente zeri, niente rientro oltre i 25 anni).
 */
function numeriDellImpianto(d: FvPdfTemplateData): Array<{ etichetta: string; valore: string; unita?: string; nota: string; tono?: "green" | "orange" }> {
  const out: Array<{ etichetta: string; valore: string; unita?: string; nota: string; tono?: "green" | "orange" }> = [];
  if (d.flows.produzione_kwh > 0) out.push({ etichetta: "Energia prodotta", valore: fmtNum(d.flows.produzione_kwh), unita: "kWh", nota: "ogni anno, dal primo", tono: "green" });
  if (d.flows.autosufficienza_pct > 0) out.push({ etichetta: "Autosufficienza", valore: fmtPct(d.flows.autosufficienza_pct, 0), nota: "del consumo di casa dal tuo sole" });
  if (d.scenario.risparmio_anno1_eur > 0) out.push({ etichetta: "Risparmio", valore: fmtEur(d.scenario.risparmio_anno1_eur), nota: Number(d.scenario.ricavi_rid_anno1_eur) > 0 ? "bolletta ed energia venduta, il primo anno" : "in bolletta, il primo anno", tono: "orange" });
  const rientro = d.scenario.payback_anni;
  if (rientro != null && rientro > 0 && rientro <= 25) {
    out.push({ etichetta: "Rientro", valore: Number.isInteger(rientro) ? fmtNum(rientro) : fmtNum(rientro, 1), unita: "anni", nota: "per ripagare l'impianto" });
  } else if (d.scenario.risparmio_25_anni_eur > 0) {
    out.push({ etichetta: "In 25 anni", valore: fmtEur(d.scenario.risparmio_25_anni_eur), nota: "di risparmio complessivo" });
  }
  return out;
}

/**
 * A occhio, l'altezza in mm di un riquadro della pagina: margini, titolo e righe da
 * ~90 caratteri. Serve a decidere se i numeri dell'impianto ci stanno: meglio
 * stimare largo e toglierli che mandarli sotto il piè di pagina (la pagina ha
 * altezza fissa, e quello che sborda si taglia).
 */
function altezzaRiquadro(testo: string, caratteriPerRiga = 90): number {
  const caratteri = testo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  // 20 mm fissi: imbottitura, titolo e i margini, che fra figli di un flex non si fondono.
  return 20 + Math.max(1, Math.ceil(caratteri / caratteriPerRiga)) * 5.2;
}

function pageDecisione(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const fin = d.finanziamento;
  // Rata e costo netto mensile solo con un finanziamento vero.
  const netto = fin ? Math.max(0, fin.rata_mensile - d.scenario.risparmio_mensile_eur) : null;
  const docMeta = `${d.azienda.name}${d.azienda.vat_number ? ` · P.IVA ${d.azienda.vat_number}` : ""} · Doc ${d.progetto.numero} · ${fmtData(d.progetto.creato_il)}`;
  const urgenzaTitolo = plainText(d.template?.urgenza_titolo) || "Validità offerta";
  const urgenzaDescrizione = plainText(d.template?.urgenza_descrizione);
  const condizioni = safeRichText(d.template?.condizioni_legali_testo);
  const noleggioNote = safeRichText(d.template?.noleggio_note_legali);
  const isNoleggioOperativo = Boolean(fin?.finanziaria?.toLowerCase().includes("noleggio"));
  const ctaTitolo = plainText(d.template?.pdf_cta_finale_titolo) || "Pronto a\niniziare?";
  const ctaTesto = safeRichText(d.template?.pdf_cta_finale_testo);
  const consulenteDescrizione = plainText(d.template?.consulente_descrizione_default);
  // I numeri dell'impianto riempiono la pagina quando la firma non c'è più: escono
  // se lo spazio lasciato dai riquadri facoltativi basta (a pagina vuota ~108 mm).
  const numeri = numeriDellImpianto(d);
  const righeTitolo = ctaTitolo.split("\n").reduce((n, r) => n + Math.max(1, Math.ceil(r.length / 34)), 0);
  const occupato = [
    ctaTesto ? altezzaRiquadro(ctaTesto) : 0,
    d.template?.urgenza_attiva && urgenzaDescrizione ? altezzaRiquadro(`${urgenzaTitolo} ${urgenzaDescrizione}`) : 0,
    isNoleggioOperativo && noleggioNote ? altezzaRiquadro(noleggioNote) : 0,
    !haPaginaCondizioni(d) && condizioni ? altezzaRiquadro(condizioni, 110) : 0,
    consulenteDescrizione ? Math.max(0, Math.ceil(consulenteDescrizione.length / 45) - 2) * 4.5 : 0,
    Math.max(0, righeTitolo - 2) * 9.5,
  ].reduce((a, b) => a + b, 0);
  const conNumeri = numeri.length >= 3 && occupato <= 60;
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">La tua decisione</div>
      <h1 class="page-title">${renderCoverLines(ctaTitolo)}</h1>
      ${ctaTesto ? `<div class="callout callout-info">
        <span class="callout-icon">i</span>
        <div><strong>Prossimo passo</strong><div class="rich-text">${ctaTesto}</div></div>
      </div>` : ""}
      <div class="offer-box">
        <div class="offer-eyebrow">★ Riepilogo offerta — valida ${d.progetto.valido_giorni} giorni</div>
        <h3>Impianto FV ${fmtNum(d.progetto.potenza_kwp, 1)} kWp${d.progetto.has_accumulo ? ` + accumulo ${fmtNum(d.progetto.capacita_accumulo_kwh, 1)} kWh` : ""}<br/>chiavi in mano</h3>
        <div class="offer-num">${fmtEur(d.costi.prezzo_vendita_iva_inclusa)}</div>
        <div style="font-size:9pt;opacity:0.85;margin-top:2mm;position:relative;">IVA ${d.costi.iva_perc}% inclusa${fin ? ` · ${fmtEur(fin.rata_mensile)}/mese × ${fin.durata_mesi} mesi (${escHtml(fin.finanziaria)}${fin.taeg_perc != null ? ` TAEG ${fmtNum(fin.taeg_perc, 2)}%` : ""})` : ""}${netto != null ? `<br/>Costo netto reale: <strong style="color:#FBBF24;">${fmtEur(netto)}/mese</strong> (rata − risparmio)` : ""}</div>
      </div>
      ${d.template?.urgenza_attiva && urgenzaDescrizione ? `<div class="callout callout-tip">
        <span class="callout-icon">★</span>
        <div><strong>${escHtml(urgenzaTitolo)}</strong>${escHtml(urgenzaDescrizione)}</div>
      </div>` : ""}
      ${isNoleggioOperativo && noleggioNote ? `<div class="callout callout-info">
        <span class="callout-icon">i</span>
        <div><strong>Nota noleggio operativo</strong><div class="rich-text">${noleggioNote}</div></div>
      </div>` : ""}
      ${conNumeri ? `<h3 style="font-size:11pt;color:#1E3A5F;margin:3mm 0 0;">Cosa ti porta a casa</h3>
      <div class="kpi-row cols-${numeri.length} grandi" style="margin-bottom:5mm;">
        ${numeri.map((n) => `<div class="kpi-block${n.tono ? ` ${n.tono}` : ""}"><div class="kpi-label">${escHtml(n.etichetta)}</div><div class="kpi-value">${escHtml(n.valore)}${n.unita ? ` <span class="unit">${escHtml(n.unita)}</span>` : ""}</div><div class="kpi-sub">${escHtml(n.nota)}</div></div>`).join("")}
      </div>` : ""}
      <div class="two-col">
        <div>
          <h3 style="font-size:11pt;color:#1E3A5F;margin-bottom:2mm;">Per accettare la proposta</h3>
          <ol style="font-size:9pt;padding-left:5mm;line-height:1.8;color:#475569;">
            <li>Firma la proposta: online, con il link ricevuto via email, oppure su carta</li>
            ${fin ? `<li>Invia alla finanziaria i documenti richiesti</li>
            <li>Attendi l'esito della finanziaria</li>` : ""}
            <li>Avvio delle pratiche e sopralluogo tecnico</li>
          </ol>
        </div>
        <div>
          <h3 style="font-size:11pt;color:#1E3A5F;margin-bottom:2mm;">Per parlarne ancora</h3>
          <div style="font-size:9pt;line-height:2;color:#475569;">
            ${d.azienda.phone ? `${etichettaContatto("Telefono")}<strong>${escHtml(d.azienda.phone)}</strong><br/>` : ""}
            ${d.azienda.email ? `${etichettaContatto("Email")}<strong>${escHtml(d.azienda.email)}</strong><br/>` : ""}
            ${d.azienda.website ? `${etichettaContatto("Sito")}<strong>${escHtml(d.azienda.website)}</strong>` : ""}
            ${consulenteDescrizione ? `<div style="line-height:1.45;margin-top:2mm;">${escHtml(consulenteDescrizione)}</div>` : ""}
          </div>
        </div>
      </div>
      ${!haPaginaCondizioni(d) && condizioni ? `<div class="legal-box"><strong>Condizioni commerciali:</strong><div class="rich-text">${condizioni}</div></div>` : ""}
      ${fasciaFotoPagina(d, "decisione", "center 55%")}
      <div class="callout callout-info">
        <span class="callout-icon">i</span>
        <div><strong>Come si firma</strong>Online, con il link ricevuto via email. Oppure su carta, nella pagina «Firma del contratto»${haPaginaCondizioni(d) ? ", dopo le condizioni generali" : " che segue"}: c'è il riepilogo di quello che si firma, e lo spazio per le firme.</div>
      </div>
    </div>
    <div class="page-footer"><span>${escHtml(docMeta)}</span><span class="pnum">${pageN} / ${total}</span></div>
  </div>`;
}

/**
 * La firma del contratto, su carta: dopo le condizioni generali, come nel documento
 * edile e nei Serramenti. Prima la firma stava nella pagina della decisione — si
 * firmava prima di leggere le condizioni — e una pagina della decisione piena
 * (testo del passo successivo, urgenza, noleggio) non aveva più posto per il prezzo.
 * Qui: che cosa si firma, la dichiarazione, le firme delle due parti, e sotto
 * l'approvazione specifica delle clausole (la seconda firma).
 */
function pageFirmaContratto(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const fin = d.finanziamento;
  const docMeta = `${d.azienda.name}${d.azienda.vat_number ? ` · P.IVA ${d.azienda.vat_number}` : ""} · Doc ${d.progetto.numero} · ${fmtData(d.progetto.creato_il)}`;
  const luogo = indirizzoCompleto(d.cliente);
  const conCondizioni = haPaginaCondizioni(d);
  const clausole = conCondizioni ? condizioniInBlocchi(String(d.template?.condizioni_legali_testo ?? "")).clausole : [];
  const righe: Array<[string, string]> = [
    ["Impresa", [d.azienda.name, d.azienda.vat_number ? `P.IVA ${d.azienda.vat_number}` : null].filter(Boolean).join(" · ")],
    ["Committente", [cliente, d.cliente.cf ? `CF ${d.cliente.cf}` : null].filter(Boolean).join(" · ")],
    ["Oggetto", `Impianto fotovoltaico ${fmtNum(d.progetto.potenza_kwp, 1)} kWp${d.progetto.has_accumulo ? ` con accumulo ${fmtNum(d.progetto.capacita_accumulo_kwh, 1)} kWh` : ""}, chiavi in mano`],
  ];
  if (luogo) righe.push(["Luogo dei lavori", luogo]);
  righe.push(["Documento", `Preventivo ${d.progetto.numero} del ${fmtData(d.progetto.creato_il)}`]);
  righe.push(["Importo", `${fmtEur(d.costi.prezzo_vendita_iva_inclusa)} · IVA ${d.costi.iva_perc}% inclusa`]);
  if (fin) righe.push(["Pagamento", `${fmtEur(fin.rata_mensile)}/mese × ${fin.durata_mesi} mesi · ${fin.finanziaria}${fin.taeg_perc != null ? ` · TAEG ${fmtNum(fin.taeg_perc, 2)}%` : ""}`]);
  righe.push(["Validità", `${d.progetto.valido_giorni} giorni dalla data del documento`]);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Per accettazione</div>
      <h1 class="page-title">Firma del<br/>contratto.</h1>
      <div class="firma-righe">
        ${righe.map(([k, v]) => `<div class="firma-riga${k === "Importo" ? " importo" : ""}"><span>${escHtml(k)}</span><span>${escHtml(v)}</span></div>`).join("")}
      </div>
      <div class="sig-box">
        <p class="sig-dich">Il Committente dichiara di aver ricevuto, letto e accettato la presente proposta in ogni sua parte — l'impianto, l'importo${conCondizioni ? " e le condizioni generali di contratto che la accompagnano" : ""} — e ne sottoscrive il contenuto.</p>
        <div class="sig-grid">
          <div><div class="sig-line"></div><div class="sig-label">Luogo e data</div></div>
          <div><div class="sig-line"></div><div class="sig-label">Per l'impresa</div><div class="sig-name">${escHtml(d.azienda.name)}</div></div>
          <div><div class="sig-line"></div><div class="sig-label">Firma del committente</div><div class="sig-name">${escHtml(cliente)}</div></div>
        </div>
      </div>
      ${clausole.length > 0 ? `
      <div class="cond-firma">
        <div class="cond-firma-titolo">Approvazione specifica (artt. 1341 e 1342 c.c.)</div>
        <p style="font-size:8pt;color:#64748B;margin-bottom:1.5mm;">Il Committente, dopo averle rilette, approva specificamente le clausole seguenti:</p>
        <ul class="cond-clausole${clausole.length > 6 ? " due-colonne" : ""}">${clausole.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul>
        <div class="cond-righe">
          <div><div class="cond-riga"></div><span>Luogo e data</span></div>
          <div><div class="cond-riga"></div><span>Seconda firma del Committente</span></div>
        </div>
      </div>` : ""}
      ${haModuloRecesso(d) ? `
      <p style="font-size:7.5pt;color:#94A3B8;margin-top:3mm;">
        Per recedere, quando ne ricorrono i presupposti, basta il modulo allegato nella pagina che segue, o una
        dichiarazione esplicita inviata a ${escHtml(d.azienda.email ?? d.azienda.name)}: non serve motivarla.
      </p>` : ""}
    </div>
    <div class="page-footer"><span>${escHtml(docMeta)}</span><span class="pnum">${pageN} / ${total}</span></div>
  </div>`;
}

// ─── ENTRY POINT ───────────────────────────────────────────────────────────

function hasRealMapImages(d: FvPdfTemplateData): boolean {
  const mi = d.map_images;
  return !!(mi && (mi.close || mi.medium || mi.overview || mi.wide));
}

/** Le pagine che escono davvero. Conteggio e disegno usano la stessa regola:
 *  prima il kit si disegnava con nome o voci ma si contava solo con la
 *  copertina, e il piè di pagina arrivava a «9 / 8». */
/**
 * Il testo delle condizioni, spezzato per articoli: markdown povero dell'editor
 * o HTML già ricco. I blocchi servono a impaginare — quindici articoli non
 * stanno in una pagina sola, e quello che sborda in un `.page` a misura fissa
 * non va a capo: sparisce sotto il piè di pagina.
 */
function condizioniInBlocchi(testo: string): { blocchi: string[]; clausole: string[] } {
  const grezzo = testo.trim();
  if (!grezzo) return { blocchi: [], clausole: [] };
  if (/<(p|h[1-6]|ul|ol|li)\b/i.test(grezzo)) return { blocchi: [safeRichText(grezzo)], clausole: [] };
  const clausole: string[] = [];
  const blocchi: string[] = [];
  let corrente: string[] = [];
  let inElenco = false;
  let dentroLeClausole = false;
  const chiudiElenco = () => { if (inElenco) { corrente.push("</ul>"); inElenco = false; } };
  const chiudiBlocco = () => { chiudiElenco(); if (corrente.length) blocchi.push(corrente.join("")); corrente = []; };
  for (const riga of grezzo.replace(/\r\n/g, "\n").split("\n")) {
    const r = riga.trim();
    if (!r) continue;
    const titolo = /^(#{1,3})\s+(.+)$/.exec(r);
    const voce = /^[-*]\s+(.+)$/.exec(r);
    if (inElenco && !voce) chiudiElenco();
    if (titolo) {
      chiudiBlocco();
      dentroLeClausole = /1341|approvare specificamente/i.test(titolo[2]);
      // Il titolo generale non si ripete: la pagina ha già il suo. L'elenco delle
      // clausole sta nel riquadro della seconda firma.
      if (dentroLeClausole || (titolo[1].length === 1 && /condizioni generali/i.test(titolo[2]))) continue;
      corrente.push(`<h3 class="cond-art">${escHtml(titolo[2])}</h3>`);
      continue;
    }
    if (dentroLeClausole) { if (voce) clausole.push(voce[1]); continue; }
    if (voce) {
      if (!inElenco) { corrente.push("<ul>"); inElenco = true; }
      corrente.push(`<li>${escHtml(voce[1])}</li>`);
      continue;
    }
    corrente.push(`<p>${escHtml(r)}</p>`);
  }
  chiudiBlocco();
  return { blocchi, clausole };
}

/** Quanti articoli stanno in una pagina: misura a occhio sui caratteri, due colonne. */
function impaginaCondizioni(blocchi: string[]): string[][] {
  const PIENA = 6400;
  const pagine: string[][] = [];
  let corrente: string[] = [];
  let quanti = 0;
  for (const b of blocchi) {
    const peso = b.replace(/<[^>]+>/g, "").length + 120; // i titoli costano più dei caratteri
    if (corrente.length > 0 && quanti + peso > PIENA) { pagine.push(corrente); corrente = []; quanti = 0; }
    corrente.push(b);
    quanti += peso;
  }
  if (corrente.length) pagine.push(corrente);
  return pagine;
}

/**
 * Condizioni generali e firma: le pagine che rendono il preventivo un contratto.
 * Prima le condizioni stavano in un riquadrino in fondo all'ultima pagina, sotto
 * il blocco della firma — illeggibili, e senza niente da approvare a parte.
 */
function pagineCondizioni(d: FvPdfTemplateData, primoNumero: number, total: number): string[] {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const testo = String(d.template?.condizioni_legali_testo ?? "");
  const { blocchi, clausole } = condizioniInBlocchi(testo);
  const gruppi = impaginaCondizioni(blocchi);
  const docMeta = `${d.azienda.name}${d.azienda.vat_number ? ` · P.IVA ${d.azienda.vat_number}` : ""} · Doc ${d.progetto.numero} · ${fmtData(d.progetto.creato_il)}`;
  return gruppi.map((gruppo, i) => {
    const ultima = i === gruppi.length - 1;
    const pageN = primoNumero + i;
    return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      ${i === 0 ? `<div class="eyebrow">Condizioni generali di contratto</div>
      <h1 class="page-title">Quello che<br/>firmiamo insieme.</h1>` : `<div class="eyebrow">Condizioni generali di contratto · segue</div>`}
      <div class="cond-testo">${gruppo.join("")}</div>
      ${ultima ? `<p style="font-size:7.5pt;color:#94A3B8;margin-top:3mm;">Segue la pagina della firma${clausole.length > 0 ? ", con l'approvazione specifica delle clausole" : ""}.</p>` : ""}
    </div>
    <div class="page-footer"><span>${escHtml(docMeta)}</span><span class="pnum">${pageN} / ${total}</span></div>
  </div>`;
  });
}

/**
 * Il modulo di recesso, allegato quando le condizioni prevedono il recesso del
 * consumatore. Il fotovoltaico si vende quasi sempre a casa del cliente: è il caso
 * in cui il modulo va consegnato con il contratto, altrimenti il termine per
 * recedere non è più di 14 giorni ma si allunga di un anno.
 */
function pageModuloRecesso(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const docMeta = `${d.azienda.name}${d.azienda.vat_number ? ` · P.IVA ${d.azienda.vat_number}` : ""} · Doc ${d.progetto.numero} · ${fmtData(d.progetto.creato_il)}`;
  const destinatario = [escHtml(d.azienda.name), d.azienda.email ? escHtml(d.azienda.email) : null].filter(Boolean).join(" — ");
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Allegato</div>
      <h1 class="page-title">${escHtml(MODULO_RECESSO.titolo)}.</h1>
      <p style="font-size:9pt;color:#64748B;max-width:150mm;margin-bottom:5mm;">${escHtml(MODULO_RECESSO.istruzioni)}</p>
      <div class="recesso-box">
        <p><strong>Destinatario:</strong> ${destinatario}</p>
        <p style="margin-top:3mm;">${escHtml(MODULO_RECESSO.dichiarazione(d.progetto.numero))}</p>
        ${MODULO_RECESSO.campi.map((c) => `<div class="recesso-campo"><span>${escHtml(c)}</span><div class="recesso-riga"></div></div>`).join("")}
        <div class="cond-righe" style="margin-top:10mm;">
          <div><div class="cond-riga"></div><span>${escHtml(MODULO_RECESSO.firme[0])}</span></div>
          <div><div class="cond-riga"></div><span>${escHtml(MODULO_RECESSO.firme[1])}</span></div>
        </div>
      </div>
    </div>
    <div class="page-footer"><span>${escHtml(docMeta)}</span><span class="pnum">${pageN} / ${total}</span></div>
  </div>`;
}

/**
 * L'azienda allega il modulo di recesso: un interruttore del modello, spento di
 * serie dal 21/09/2026. Serve a chi firma con un privato a casa sua o a distanza.
 */
function haModuloRecesso(d: FvPdfTemplateData): boolean {
  return haPaginaCondizioni(d) && d.template?.modulo_recesso_attivo === true;
}

/** Quante pagine prendono le condizioni generali. */
function quantePagineCondizioni(d: FvPdfTemplateData): number {
  if (!haPaginaCondizioni(d)) return 0;
  return impaginaCondizioni(condizioniInBlocchi(String(d.template?.condizioni_legali_testo ?? "")).blocchi).length;
}

/**
 * Le pagine del contratto, che seguono la decisione: le condizioni generali, la
 * firma (sempre: è lì che la proposta si accetta su carta) e il modulo di recesso.
 */
function quantePagineContratto(d: FvPdfTemplateData): number {
  return quantePagineCondizioni(d) + 1 + (haModuloRecesso(d) ? 1 : 0);
}

function pagineDaDisegnare(d: FvPdfTemplateData): FvPdfPageOrderItem[] {
  const hasMap = hasRealMapImages(d);
  return normalizeFvPdfPagesOrder(d.template?.pdf_pages_order).filter((page) => {
    if (!page.visible) return false;
    // Senza immagini satellite reali l'anteprima non ha niente da mostrare.
    if (page.id === "anteprima" && !hasMap) return false;
    // Rata, TAN e TAEG esistono solo con un finanziamento vero.
    if (page.id === "piano_pagamento" && !d.finanziamento) return false;
    // Senza cassa calcolata non c'è niente da proiettare sui 25 anni.
    if (page.id === "cassa_25" && d.scenario.cassa_anno_per_anno.length === 0) return false;
    // Le domande frequenti sono quelle scritte dall'azienda.
    if (page.id === "faq" && faqDellAzienda(d).length === 0) return false;
    // «Dicono di noi»: un voto, una recensione o una foto di impianto, altrimenti niente.
    if (page.id === "recensioni" && !haPaginaRecensioni(d)) return false;
    // Un blocco senza voci né foto non esce.
    if (page.id in PAGINE_BLOCCO && !bloccoHaContenuto(d, page.id as PaginaBlocco)) return false;
    return true;
  });
}

function haPaginaKit(d: FvPdfTemplateData): boolean {
  return !!(d.bundle && (d.bundle.nome || (d.bundle.voci ?? []).length > 0));
}

/** Le condizioni generali si stampano quando ci sono e l'azienda non le ha spente. */
function haPaginaCondizioni(d: FvPdfTemplateData): boolean {
  return d.template?.condizioni_legali_attivo !== false
    && Boolean(String(d.template?.condizioni_legali_testo ?? "").trim());
}

export function getFvPdfRenderedPagesCount(d: FvPdfTemplateData): number {
  const macroPages = dedicatedMacroPages(d);
  // Il contratto (condizioni, firma, modulo di recesso) si conta con la decisione,
  // che lo porta con sé.
  return 1 + (haPaginaKit(d) ? 1 : 0) + pagineDaDisegnare(d).reduce((count, page) => (
    count + (page.id === "macro_categorie" ? macroPages.length : page.id === "decisione" ? 1 + quantePagineContratto(d) : 1)
  ), 0);
}

// ─── TEMA: i colori dell'azienda ────────────────────────────────────────────
// Il foglio di stile e i grafici sono scritti col blu (#1E3A5F) e l'arancio
// (#F97316) di serie. Se l'azienda ha scelto i suoi colori, si sostituiscono
// nell'HTML finito: così cambiano insieme copertina, titoli, tabelle e grafici,
// senza riscrivere 1.800 righe di stile. Ogni variante è calcolata perché il
// testo resti leggibile (un marchio lime diventa un verde oliva per i fondi).
const BLU_DI_SERIE = "#1E3A5F";
const ARANCIO_DI_SERIE = "#F97316";

export function applicaTemaFv(html: string, template: FvPdfTemplateData["template"] | null | undefined): string {
  const primario = normalizzaHex(template?.colore_primario);
  const accento = normalizzaHex(template?.colore_accento);
  let out = html;
  if (primario && primario !== BLU_DI_SERIE) {
    const fondo = fondoPerTestoBianco(primario);
    // Ordine: prima le varianti, poi il colore base (che è sottostringa di nessuna).
    out = out
      .replace(/#0F2542/gi, scurisci(fondo, 0.35))   // angolo scuro del gradiente di copertina
      .replace(/#2C5184/gi, schiarisci(fondo, 0.18)) // angolo chiaro del gradiente di copertina
      .replace(/#0F1A2E/gi, scurisci(fondo, 0.5))    // celle dei pannelli nei disegni
      .replace(/#1E3A5F/gi, fondo);
  }
  if (accento && accento !== ARANCIO_DI_SERIE) {
    const fondoCopertina = primario ? fondoPerTestoBianco(primario) : BLU_DI_SERIE;
    out = out
      .replace(/#C2410C/gi, testoSuChiaro(accento, "#FFEDD5"))          // testo dell'accento sui riquadri chiari
      .replace(/#FBBF24/gi, testoSuScuro(schiarisci(accento, 0.2), fondoCopertina, 3)) // evidenze sulla copertina scura
      .replace(/#FFEDD5/gi, schiarisci(accento, 0.86))
      .replace(/#FED7AA/gi, schiarisci(accento, 0.72))
      .replace(/#FEF3C7/gi, schiarisci(accento, 0.9))
      .replace(/249,\s*115,\s*22/g, rgbElenco(accento))
      .replace(/#F97316/gi, accento);
  }
  return out;
}

export function renderFvPdfHtml(d: FvPdfTemplateData): string {
  const macroPages = dedicatedMacroPages(d);
  const orderedPages = pagineDaDisegnare(d);
  const TOTAL = getFvPdfRenderedPagesCount(d);
  let pageN = 1;
  const pages = [pageCover(d)];
  // Pagina del kit subito dopo la copertina, quando il kit ha un nome o delle voci.
  if (haPaginaKit(d)) {
    pages.push(pageBundleKit(d, ++pageN, TOTAL));
  }
  for (const page of orderedPages) {
    switch (page.id) {
      case "investimento":
        pages.push(pageInvestimento(d, ++pageN, TOTAL));
        break;
      case "anteprima":
        pages.push(pageAnteprima(d, ++pageN, TOTAL));
        break;
      case "componenti":
        pages.push(pageComponenti(d, ++pageN, TOTAL));
        break;
      case "macro_categorie":
        pages.push(...macroPages.map((macro) => pageMacroCategoriaDedicata(d, macro, ++pageN, TOTAL)));
        break;
      case "produzione":
        pages.push(pageProduzione(d, ++pageN, TOTAL));
        break;
      case "flussi":
        pages.push(pageFlussi(d, ++pageN, TOTAL));
        break;
      case "risparmio":
        pages.push(pageRisparmio(d, ++pageN, TOTAL));
        break;
      case "costi_futuri":
        pages.push(pageCostiFuturi(d, ++pageN, TOTAL));
        break;
      case "piano_pagamento":
        if (d.finanziamento) pages.push(pagePiano(d, d.finanziamento, ++pageN, TOTAL));
        break;
      case "bollette_240":
        pages.push(pageBollette240(d, ++pageN, TOTAL));
        break;
      case "cassa_25":
        pages.push(pageCassa25(d, ++pageN, TOTAL));
        break;
      case "co2":
        pages.push(pageCO2(d, ++pageN, TOTAL));
        break;
      case "garanzie":
        pages.push(pageGaranzie(d, ++pageN, TOTAL));
        break;
      case "iter":
        pages.push(pageIter(d, ++pageN, TOTAL));
        break;
      case "faq":
        pages.push(pageFAQ(d, ++pageN, TOTAL));
        break;
      case "recensioni":
        pages.push(pageRecensioni(d, ++pageN, TOTAL));
        break;
      case "come_funziona":
      case "protezione":
      case "controlli":
      case "documenti":
      case "diario":
        pages.push(pageBlocco(d, page.id, ++pageN, TOTAL));
        break;
      case "decisione":
        pages.push(pageDecisione(d, ++pageN, TOTAL));
        // Le condizioni si firmano dopo averle lette: prima le condizioni, poi la
        // pagina della firma, poi il modulo di recesso se le condizioni lo prevedono.
        if (haPaginaCondizioni(d)) {
          const nuove = pagineCondizioni(d, pageN + 1, TOTAL);
          pageN += nuove.length;
          pages.push(...nuove);
        }
        pages.push(pageFirmaContratto(d, ++pageN, TOTAL));
        if (haModuloRecesso(d)) pages.push(pageModuloRecesso(d, ++pageN, TOTAL));
        break;
    }
  }

  return applicaTemaFv(`<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Preventivo Fotovoltaico — ${escHtml(d.cliente.nome)} ${escHtml(d.cliente.cognome)} — ${escHtml(d.progetto.numero)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
${renderPdfActionBar(d)}
${pages.join("\n")}
<script>
  // Auto-print se ?print=1 (per "Stampa PDF" automatica)
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('print') === '1') {
    window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 600); });
  }
</script>
</body>
</html>`, d.template);
}
