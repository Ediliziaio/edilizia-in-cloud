/**
 * Template HTML del preventivo Fotovoltaico v2 — 16 pagine Reonic-killer.
 * Replica fedele del riferimento /Users/florinandriciuc/Downloads/preventivo-fv-mario-rossi-v2.html
 *
 * L'output è un singolo HTML self-contained (CSS inline, SVG inline)
 * stampabile direttamente come PDF dal browser via window.print() / Ctrl+P
 * grazie a @page A4 + print-color-adjust: exact.
 */

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
import {
  svgProducibilitaMensile,
  svgSankeyDoveVa,
  svgSankeyDaDoveViene,
  svgCosti20Anni,
  svgCassaCumulata,
  svgForbice,
  svgRataRisparmio,
  svgVistaSatellitareMock,
  svgProdottoIcona,
} from "./fvSvgCharts.ts";

// ─── Tipi del data context ────────────────────────────────────────────────

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
  };
  costi: {
    prezzo_vendita_iva_inclusa: number;
    iva_perc: number;
    detrazione_eur: number;
    detrazione_perc: number;
    costo_netto_dopo_detrazione: number;
  };
  finanziamento?: {
    finanziaria: string;
    durata_mesi: number;
    rata_mensile: number;
    tan_perc: number;
    taeg_perc: number;
    importo_finanziato: number;
  } | null;
  scenario: {
    risparmio_mensile_eur: number;
    risparmio_anno1_eur: number;
    risparmio_25_anni_eur: number;
    payback_anni: number | null;
    npv_25_anni: number;
    cassa_anno_per_anno: Array<{ anno: number; cumulato: number }>;
  };
  flows: FvFlows;
  componenti: Array<{
    categoria: string;
    descrizione: string;
    marca?: string | null;
    modello?: string | null;
    quantita: number;
    potenza_w?: number | null;
    capacita_kwh?: number | null;
    garanzia_anni?: number | null;
    image_url?: string | null;
  }>;
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
  border-bottom: 1px solid #E2E8F0;
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
  border-top: 1px solid #E2E8F0;
}
.page-footer .pnum { font-weight: 700; color: #1E3A5F; }
.content { padding: 18mm 16mm 14mm; height: 100%; }

.eyebrow { font-size: 8pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #F97316; margin-bottom: 4px; }
.page-title { font-size: 22pt; font-weight: 800; color: #1E3A5F; letter-spacing: -0.03em; line-height: 1.05; margin-bottom: 3mm; }
.page-subtitle { font-size: 10pt; color: #64748B; margin-bottom: 4mm; font-weight: 500; }
p { margin-bottom: 2mm; }

/* COVER */
.cover { background: linear-gradient(135deg, #0F2542 0%, #1E3A5F 60%, #2C5184 100%); color: white; height: 100%; position: relative; overflow: hidden; }
.cover::before { content: ""; position: absolute; top: -20%; right: -20%; width: 80%; height: 80%; background: radial-gradient(circle, rgba(249,115,22,0.4) 0%, transparent 60%); }
.cover::after { content: "☀"; position: absolute; top: 25mm; right: 25mm; font-size: 100pt; opacity: 0.15; color: #FBBF24; }
.cover-content { position: relative; padding: 24mm 22mm; height: 100%; display: flex; flex-direction: column; }
.cover-brand { display: flex; align-items: center; gap: 14px; margin-bottom: auto; }
.cover-brand .icon { width: 54px; height: 54px; border-radius: 13px; background: linear-gradient(135deg, #F97316 0%, #FBBF24 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 26px; }
.cover-brand .name { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 20pt; }
.cover-brand .tagline { font-size: 9.5pt; opacity: 0.7; margin-top: 2px; }
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
.kpi-big .kbig-value { font-family: 'Outfit', sans-serif; font-size: 28pt; font-weight: 800; color: #166534; line-height: 1; letter-spacing: -0.02em; }
.kpi-big.orange .kbig-value { color: #C2410C; }
.kpi-big.red .kbig-value { color: #991B1B; }
.kpi-big .kbig-sub { font-size: 8pt; color: #166534; margin-top: 1.5mm; }
.kpi-big.orange .kbig-sub { color: #7C2D12; }
.kpi-big.red .kbig-sub { color: #7F1D1D; }

.callout { border-radius: 8px; padding: 3mm 4mm; margin: 3mm 0; font-size: 9pt; display: flex; gap: 2.5mm; align-items: flex-start; }
.callout-icon { font-size: 12pt; line-height: 1; flex-shrink: 0; }
.callout-success { background: #DCFCE7; border-left: 3px solid #16A34A; color: #166534; }
.callout-tip { background: #FFEDD5; border-left: 3px solid #F97316; color: #C2410C; }
.callout-info { background: #DBEAFE; border-left: 3px solid #3B82F6; color: #1E3A8A; }
.callout strong { display: block; margin-bottom: 0.5mm; font-size: 9.5pt; }

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
.chart-card { background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 4mm; margin: 2.5mm 0; }
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
.qa-item:last-child { border-bottom: none; }
.qa-q { font-weight: 700; color: #1E3A5F; font-size: 10pt; margin-bottom: 1mm; display: flex; gap: 2mm; align-items: flex-start; }
.qa-q::before { content: "Q"; background: #F97316; color: white; width: 4.5mm; height: 4.5mm; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 8pt; flex-shrink: 0; margin-top: 1px; }
.qa-a { color: #475569; font-size: 8.5pt; padding-left: 6.5mm; }

.sig-box { border: 2px dashed #1E3A5F; border-radius: 10px; padding: 5mm; text-align: center; margin-top: 4mm; background: #F8FAFC; }
.sig-box .sig-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #64748B; font-weight: 700; margin-bottom: 1mm; }
.sig-box .sig-line { height: 14mm; border-bottom: 1px solid #94A3B8; margin-bottom: 2mm; }
.sig-box .sig-name { font-size: 9.5pt; color: #1E3A5F; font-weight: 700; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }

.offer-box { background: linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%); color: white; border-radius: 12px; padding: 6mm; margin: 3mm 0; position: relative; overflow: hidden; }
.offer-box::after { content: ""; position: absolute; right: -20%; top: -50%; width: 60%; height: 200%; background: radial-gradient(circle, rgba(249,115,22,0.3) 0%, transparent 60%); }
.offer-box .offer-eyebrow { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #FBBF24; margin-bottom: 2mm; }
.offer-box h3 { font-size: 15pt; margin-bottom: 2.5mm; position: relative; }
.offer-box .offer-num { font-family: 'Outfit', sans-serif; font-size: 32pt; font-weight: 800; color: #FBBF24; line-height: 1; letter-spacing: -0.03em; position: relative; }

.sat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; margin: 2.5mm 0; }
.sat-view { position: relative; border-radius: 8px; overflow: hidden; aspect-ratio: 4/3; border: 1px solid #E2E8F0; }
.sat-view svg { width: 100%; height: 100%; display: block; }
.sat-view .sat-label { position: absolute; bottom: 2mm; left: 2mm; background: rgba(255,255,255,0.92); padding: 1mm 2.5mm; border-radius: 4px; font-size: 7.5pt; font-weight: 600; color: #1E3A5F; }
.sat-view .sat-zoom { position: absolute; top: 2mm; right: 2mm; background: rgba(30,58,95,0.92); color: white; padding: 1mm 2mm; border-radius: 4px; font-size: 7pt; font-weight: 600; }

.product-card { display: grid; grid-template-columns: 42mm 1fr; gap: 4mm; background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 3mm; margin-bottom: 2.5mm; }
.product-img { background: linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%); border-radius: 6px; aspect-ratio: 1/1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.product-img svg, .product-img img { width: 75%; height: 75%; object-fit: contain; }
.product-info h3 { font-size: 10pt; color: #1E3A5F; margin-bottom: 0.5mm; line-height: 1.2; }
.product-info .product-brand { font-size: 7.5pt; color: #64748B; font-weight: 600; margin-bottom: 1mm; text-transform: uppercase; letter-spacing: 0.05em; }
.product-info p { font-size: 8pt; color: #475569; margin-bottom: 0.8mm; line-height: 1.3; }
.product-info .product-specs { display: flex; gap: 1.2mm; flex-wrap: wrap; margin-top: 1.2mm; }
.product-info .spec-chip { background: #F1F5F9; color: #475569; font-size: 7pt; font-weight: 600; padding: 0.4mm 1.8mm; border-radius: 3px; }
.product-info .spec-chip.green { background: #DCFCE7; color: #166534; }

.eq-row { display: grid; grid-template-columns: 26mm 1fr; gap: 4mm; align-items: center; padding: 3mm 4mm; background: white; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 2.2mm; }
.eq-row .eq-num { font-family: 'Outfit', sans-serif; font-size: 20pt; font-weight: 800; color: #16A34A; line-height: 1; text-align: center; }
.eq-row .eq-num small { display: block; font-size: 7.5pt; color: #64748B; font-weight: 600; margin-top: 0.5mm; text-transform: uppercase; letter-spacing: 0.05em; }
.eq-row .eq-icons { font-size: 16pt; line-height: 1.2; letter-spacing: -2px; }
.eq-row .eq-desc { font-size: 8pt; color: #64748B; margin-top: 0.5mm; }

.guarantee-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin: 3mm 0; }
.guarantee-card { background: white; border: 2px solid #16A34A; border-radius: 10px; padding: 4mm 5mm; }
.guarantee-card .g-num { font-family: 'Outfit', sans-serif; font-size: 18pt; font-weight: 800; color: #16A34A; line-height: 1; margin-bottom: 1.5mm; }
.guarantee-card .g-num::before { content: "✓ "; }
.guarantee-card .g-title { font-size: 10pt; font-weight: 700; color: #1E3A5F; margin-bottom: 1.5mm; }
.guarantee-card .g-desc { font-size: 8pt; color: #475569; line-height: 1.4; }
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

// ─── Pagine ────────────────────────────────────────────────────────────────

function pageCover(d: FvPdfTemplateData): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const indirizzoCompleto = [
    d.cliente.indirizzo,
    d.cliente.cap && d.cliente.comune ? `${d.cliente.cap} ${d.cliente.comune}` : d.cliente.comune,
    d.cliente.provincia ? `(${d.cliente.provincia})` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const tipologia = d.cliente.tipologia_immobile ?? "Abitazione";

  return `<div class="page"><div class="cover"><div class="cover-content">
    <div class="cover-brand">
      <div class="icon">☀</div>
      <div>
        <div class="name">${escHtml(d.azienda.name)}</div>
        ${d.azienda.tagline ? `<div class="tagline">${escHtml(d.azienda.tagline)}</div>` : ""}
      </div>
    </div>
    <div>
      <div class="cover-eyebrow">★ La tua proposta personalizzata</div>
      <h1>Il sole<br/>diventa tuo.</h1>
      <div class="subtitle">Impianto fotovoltaico ${fmtNum(d.progetto.potenza_kwp, 1)} kWp${d.progetto.has_accumulo ? ` con accumulo ${fmtNum(d.progetto.capacita_accumulo_kwh, 1)} kWh` : ""}<br/>${d.cliente.indirizzo ? `per ${escHtml(d.cliente.indirizzo)}.` : ""}</div>
    </div>
    <div class="cover-client">
      <div class="client-label">Preparato per</div>
      <div class="client-name">${escHtml(cliente)}</div>
      <div class="client-meta">${escHtml(indirizzoCompleto)} · ${escHtml(tipologia)}</div>
    </div>
    <div class="cover-footer">
      <div class="doc-meta">Preventivo <strong>${escHtml(d.progetto.numero)}</strong><br/>${escHtml(fmtData(d.progetto.creato_il))} · valido ${d.progetto.valido_giorni} giorni</div>
      <div style="text-align:right;">${d.progetto.venditore ? `A cura di<br/><strong>${escHtml(d.progetto.venditore)}</strong>` : ""}</div>
    </div>
  </div></div></div>`;
}

function pageInvestimento(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const inclusi: string[] = [];
  const pannello = d.componenti.find((c) => c.categoria === "pannello");
  const inverter = d.componenti.find((c) => c.categoria === "inverter");
  const accumulo = d.componenti.find((c) => c.categoria === "accumulo");
  if (pannello) inclusi.push(`${pannello.quantita} pannelli ${pannello.marca ?? ""} ${pannello.modello ?? ""} · garanzia ${pannello.garanzia_anni ?? 25} anni`);
  if (inverter) inclusi.push(`Inverter ${inverter.marca ?? ""} ${inverter.modello ?? ""} · garanzia ${inverter.garanzia_anni ?? 10} anni`);
  if (accumulo) inclusi.push(`Accumulo ${accumulo.marca ?? ""} ${accumulo.modello ?? ""} (${fmtNum(accumulo.capacita_kwh ?? d.progetto.capacita_accumulo_kwh, 1)} kWh) · garanzia ${accumulo.garanzia_anni ?? 10} anni`);
  inclusi.push("Struttura supporto + acciaio inox");
  inclusi.push("Manodopera squadra qualificata · 3 giornate");
  inclusi.push("Pratica TICA + CILA + RID GSE + ENEA");
  inclusi.push("Allaccio definitivo alla rete + collaudo finale");
  inclusi.push("Manuale uso + monitoraggio app dedicata 24/7");

  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · L'investimento</div>
      <h1 class="page-title">L'investimento di<br/>una vita.</h1>
      <p class="page-subtitle">Trasparente, completo, chiavi in mano. Senza sorprese.</p>
      <div class="invest-hero">
        <div class="label">Prezzo chiavi in mano</div>
        <div class="price">${fmtEur(d.costi.prezzo_vendita_iva_inclusa)}</div>
        <div class="desc">IVA ${d.costi.iva_perc}% inclusa · materiali, manodopera, pratiche, allaccio rete e collaudo finale.</div>
      </div>
      <h3 style="font-size:12pt;color:#1E3A5F;margin-bottom:2mm;">Cosa è incluso</h3>
      <ul class="bullets" style="margin-bottom:3mm;">
        ${inclusi.map((i) => `<li>${escHtml(i)}</li>`).join("")}
      </ul>
      <div class="callout callout-success">
        <span class="callout-icon">✓</span>
        <div><strong>Detrazione fiscale ${d.costi.detrazione_perc}% — recuperi ${fmtEur(d.costi.detrazione_eur)} in 10 anni.</strong>
        Costo netto effettivo: <strong>${fmtEur(d.costi.costo_netto_dopo_detrazione)}</strong>. Dettagli a pagina 11.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageAnteprima(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const np = d.progetto.numero_pannelli;
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · Anteprima dell'impianto</div>
      <h1 class="page-title">La tua casa,<br/>con i pannelli.</h1>
      <p class="page-subtitle">Vista dall'alto del tuo tetto in ${escHtml(d.cliente.indirizzo)}. Ecco esattamente come saranno disposti i ${np} pannelli.</p>
      <div class="sat-grid">
        <div class="sat-view">${svgVistaSatellitareMock("nord", np)}<div class="sat-label">📍 Vista nord</div><div class="sat-zoom">zoom 19</div></div>
        <div class="sat-view">${svgVistaSatellitareMock("zenitale", np)}<div class="sat-label">📍 Vista zenitale tetto</div><div class="sat-zoom">zoom 21</div></div>
        <div class="sat-view">${svgVistaSatellitareMock("3d", np)}<div class="sat-label">📍 Vista 3D sud-ovest</div><div class="sat-zoom">3D · 60°</div></div>
        <div class="sat-view">${svgVistaSatellitareMock("panoramica", np)}<div class="sat-label">📍 Panoramica quartiere</div><div class="sat-zoom">zoom 18</div></div>
      </div>
      <div class="callout callout-tip">
        <span class="callout-icon">★</span>
        <div><strong>Layout ottimizzato per la tua casa specifica.</strong>
        Ogni pannello è posizionato considerando l'esposizione${d.progetto.azimut ? ` ${escHtml(d.progetto.azimut)}` : ""}, l'ombreggiamento dei vicini e la struttura del tetto. Calcoli effettuati con software professionale PVGIS + DSM 3D.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageComponenti(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const cards = d.componenti
    .filter((c) => ["pannello", "inverter", "accumulo"].includes(c.categoria))
    .slice(0, 3)
    .map((c) => {
      const tipo = c.categoria as "pannello" | "inverter" | "accumulo";
      const icon = c.image_url
        ? `<img src="${escHtml(c.image_url)}" alt="${escHtml(c.descrizione)}"/>`
        : svgProdottoIcona(tipo);
      const chips: string[] = [];
      if (c.potenza_w) chips.push(`<span class="spec-chip">${c.potenza_w} Wp</span>`);
      if (c.capacita_kwh) chips.push(`<span class="spec-chip">${fmtNum(c.capacita_kwh, 1)} kWh</span>`);
      if (c.garanzia_anni) chips.push(`<span class="spec-chip green">${c.garanzia_anni} anni</span>`);
      const titolo = c.modello ?? c.descrizione;
      return `<div class="product-card">
        <div class="product-img">${icon}</div>
        <div class="product-info">
          <div class="product-brand">${escHtml(c.marca ?? "")}</div>
          <h3>${escHtml(titolo)}${c.descrizione !== titolo ? ` — ${escHtml(c.descrizione)}` : ""}</h3>
          ${c.quantita > 1 ? `<p>Quantità: <strong>${c.quantita} pezzi</strong></p>` : ""}
          ${chips.length > 0 ? `<div class="product-specs">${chips.join("")}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");

  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · I componenti</div>
      <h1 class="page-title">Solo materiali<br/>premium.</h1>
      <p class="page-subtitle">Ogni componente è stato scelto per durare 25+ anni. Marche leader con assistenza Italia.</p>
      ${cards || "<p>Nessun componente configurato.</p>"}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageProduzione(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const mensili = calcolaProducibilitaMensile(d.flows.produzione_kwh);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · La produzione</div>
      <h1 class="page-title">Quanta energia<br/>produrrai.</h1>
      <p class="page-subtitle">${fmtNum(d.flows.produzione_kwh)} kWh/anno · calcolato con PVGIS sulla tua esposizione reale${d.progetto.azimut ? ` (${escHtml(d.progetto.azimut)})` : ""}.</p>
      <div class="chart-card">
        <div class="chart-title">Producibilità mensile attesa (kWh)</div>
        <div class="chart-sub">Picchi maggio-luglio · ${escHtml(d.cliente.comune ?? "Italia")}${d.progetto.azimut ? ` · azimut ${escHtml(d.progetto.azimut)}` : ""}${d.progetto.inclinazione_tetto ? ` · inclinazione ${d.progetto.inclinazione_tetto}°` : ""}</div>
        ${svgProducibilitaMensile(mensili)}
      </div>
      <div class="kpi-row">
        <div class="kpi-block green"><div class="kpi-label">Producibilità totale</div><div class="kpi-value">${fmtNum(d.flows.produzione_kwh)} <span class="unit">kWh</span></div><div class="kpi-sub">Primo anno</div></div>
        <div class="kpi-block orange"><div class="kpi-label">Autoconsumato</div><div class="kpi-value">${fmtNum(d.flows.autoconsumo_kwh)} <span class="unit">kWh</span></div><div class="kpi-sub">Diretto + da accumulo</div></div>
        <div class="kpi-block"><div class="kpi-label">Ceduto in rete</div><div class="kpi-value">${fmtNum(d.flows.ceduto_rete_kwh)} <span class="unit">kWh</span></div><div class="kpi-sub">Scambio sul posto</div></div>
      </div>
      ${d.progetto.has_accumulo ? `<div class="callout callout-info">
        <span class="callout-icon">i</span>
        <div><strong>L'accumulo cambia tutto.</strong>
        Senza accumulo l'autoconsumo sarebbe ~35%, con accumulo arriva a ${fmtPct(d.flows.autoconsumo_pct, 0)}. Significa il doppio di energia "tua" che resta in casa. Per ${escHtml(d.cliente.nome)} vuol dire <strong>~${fmtEur(d.scenario.risparmio_anno1_eur * 0.4)} in più all'anno</strong> di risparmio reale.</div>
      </div>` : ""}
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageFlussi(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · Flussi energetici</div>
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
  });
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · Il risparmio</div>
      <h1 class="page-title">${fmtEur(d.scenario.risparmio_mensile_eur)} al mese,<br/>per sempre.</h1>
      <p class="page-subtitle">Quello che eviti di pagare in bolletta dal primo giorno. Dato indicizzato all'inflazione.</p>
      <div class="kpi-row cols-2">
        <div class="kpi-big"><div class="kbig-label">Risparmio mensile</div><div class="kbig-value">${fmtEur(d.scenario.risparmio_mensile_eur)}</div><div class="kbig-sub">primo anno · cresce con l'inflazione</div></div>
        <div class="kpi-big"><div class="kbig-label">Risparmio annuo</div><div class="kbig-value">${fmtEur(d.scenario.risparmio_anno1_eur)}</div><div class="kbig-sub">primo anno (al netto oneri rete)</div></div>
      </div>
      <h3 style="font-size:11pt;color:#1E3A5F;margin:4mm 0 2mm;">La tua bolletta — prima e dopo</h3>
      <table>
        <thead><tr><th>Voce</th><th class="num-cell">Oggi (senza FV)</th><th class="num-cell">Con il fotovoltaico</th><th class="num-cell">Risparmio</th></tr></thead>
        <tbody>
          ${bolletta.map((r) => `<tr${r.is_total ? ' class="row-total"' : ""}><td>${escHtml(r.voce)}</td><td class="num-cell">${r.is_kwh_row ? `${fmtNum(r.oggi_eur)} kWh` : fmtEur(r.oggi_eur)}</td><td class="num-cell">${r.is_kwh_row ? `~${fmtNum(r.con_fv_eur)} kWh` : fmtEur(r.con_fv_eur)}</td><td class="num-cell ${r.risparmio_eur === 0 ? "saving-zero" : "saving"}">${r.is_kwh_row ? `−${Math.abs(r.risparmio_eur)}%` : r.risparmio_eur === 0 ? "0 €" : fmtEur(r.risparmio_eur)}</td></tr>`).join("")}
        </tbody>
      </table>
      <div class="callout callout-success">
        <span class="callout-icon">★</span>
        <div><strong>Bollette previste a ${escHtml(d.cliente.comune ?? "Milano")}: in crescita del 15-25% nei prossimi 5 anni.</strong>
        Il tuo impianto produce un risparmio in <strong>kWh</strong>, non in euro. Più sale il prezzo dell'energia, più cresce il valore del risparmio.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageCostiFuturi(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const costi = calcolaCosti20Anni({
    consumo_annuo_kwh: d.progetto.consumo_annuo_kwh,
    prelievo_rete_kwh: d.flows.prelievo_rete_kwh,
    prezzo_kwh_attuale: d.progetto.costo_kwh_attuale,
    inflazione_perc: 3.0,
    orizzonte_anni: 20,
  });
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · Costi energetici futuri</div>
      <h1 class="page-title">Quanto pagherai<br/>nei prossimi 20 anni.</h1>
      <p class="page-subtitle">Confronto annuo bolletta senza fotovoltaico vs con il tuo impianto. Inflazione attesa: 3%/anno.</p>
      <div class="chart-card">
        <div class="chart-title">Spesa annuale per l'elettricità — anno per anno</div>
        <div class="chart-sub">Senza FV (arancione) vs con il tuo impianto (verde) · scala in € all'anno</div>
        ${svgCosti20Anni(costi)}
      </div>
      <div class="kpi-row cols-2">
        <div class="kpi-big red"><div class="kbig-label">Senza fotovoltaico</div><div class="kbig-value">~${fmtEur(costi.totale_senza_fv_eur)}</div><div class="kbig-sub">spesi in 20 anni di bollette</div></div>
        <div class="kpi-big"><div class="kbig-label">Con fotovoltaico</div><div class="kbig-value">~${fmtEur(costi.totale_con_fv_eur)}</div><div class="kbig-sub">spesi in 20 anni · risparmi ${fmtEur(costi.totale_risparmio_eur)}</div></div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pagePiano(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const fin = d.finanziamento;
  const rata = fin?.rata_mensile ?? Math.round((d.costi.prezzo_vendita_iva_inclusa * 1.2) / 84);
  const risparmioM = d.scenario.risparmio_mensile_eur;
  const netto = Math.max(0, rata - risparmioM);
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">★ Pagina ${pageN} · Il piano economico</div>
      <h1 class="page-title">${fmtEur(netto)} al mese.<br/><span style="color:#F97316">Tutto qui.</span></h1>
      <p class="page-subtitle">Quello che esce davvero dal tuo conto, ogni mese. Meno di un caffè al giorno.</p>
      <div class="split-3">
        <div class="num-card navy"><div class="nc-label">Rata${fin ? " " + fin.finanziaria.split(" ")[0] : ""}</div><div class="nc-value">${fmtEur(rata)}</div><div class="nc-period">×${fin?.durata_mesi ?? 84} mesi · TAEG ${fmtNum(fin?.taeg_perc ?? 5.4, 2)}%</div></div>
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
          <tr><td>Importo finanziato</td><td class="num-cell">${fmtEur(fin?.importo_finanziato ?? d.costi.prezzo_vendita_iva_inclusa)}</td><td>Durata</td><td class="num-cell">${fin?.durata_mesi ?? 84} rate</td></tr>
          <tr><td>Finanziaria</td><td class="num-cell">${escHtml(fin?.finanziaria ?? "—")}</td><td>Rata mensile</td><td class="num-cell" style="color:#F97316;">${fmtEur(rata)}</td></tr>
          <tr><td>TAN nominale</td><td class="num-cell">${fmtNum(fin?.tan_perc ?? 4.75, 2)}%</td><td>TAEG (incluse spese)</td><td class="num-cell">${fmtNum(fin?.taeg_perc ?? 5.4, 2)}%</td></tr>
        </tbody>
      </table>
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
      <div class="eyebrow">Pagina ${pageN} · Perché farlo adesso</div>
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
      <div class="callout callout-tip">
        <span class="callout-icon">★</span>
        <div><strong>Senza FV, in 25 anni ${escHtml(d.cliente.nome)} pagherà ~${fmtEur(costo25senzaFV)} di bollette.</strong>
        Con FV, una frazione. La differenza è il prezzo di restare ostaggio del mercato. <strong>Il sole non aumenta mai di prezzo.</strong></div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageCassa25(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const cassa = d.scenario.cassa_anno_per_anno;
  const final = cassa.length > 0 ? cassa[cassa.length - 1].cumulato : d.scenario.risparmio_25_anni_eur;
  const eventi = [
    { anno: 0, descr: "Installazione · prima rata", cumulato: cassa[0]?.cumulato ?? -d.costi.prezzo_vendita_iva_inclusa },
    { anno: 7, descr: "Finita la rata Cofidis · solo risparmi e detrazione", cumulato: cassa.find((c) => c.anno === 7)?.cumulato },
    { anno: d.scenario.payback_anni ?? 9, descr: "★ Breakeven · da qui in poi è tutto profitto", cumulato: 0 },
    { anno: 15, descr: "Sostituzione inverter (~1.000 €)", cumulato: cassa.find((c) => c.anno === 15)?.cumulato },
    { anno: 25, descr: "Fine vita garanzia · profitto totale", cumulato: final },
  ];
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · La cassa nei 25 anni</div>
      <h1 class="page-title">${fmtEur(final).replace("€", "+€")}<br/>nelle tue tasche.</h1>
      <p class="page-subtitle">Profitto netto cumulato dopo 25 anni · breakeven al ${d.scenario.payback_anni ?? 9}° anno · poi puro profitto.</p>
      <div class="chart-card">
        <div class="chart-title">Cassa cumulata anno per anno</div>
        <div class="chart-sub">Include rate Cofidis, risparmio bolletta, detrazione IRPEF e scambio sul posto</div>
        ${svgCassaCumulata(cassa, d.scenario.payback_anni, final)}
      </div>
      <table>
        <thead><tr><th>Anno</th><th>Cosa succede</th><th class="num-cell">Cassa cumulata</th></tr></thead>
        <tbody>
          ${eventi.map((e) => `<tr${e.anno === (d.scenario.payback_anni ?? 9) ? ' class="row-total"' : ""}><td><strong>${e.anno}</strong></td><td>${escHtml(e.descr)}</td><td class="num-cell" style="color:${(e.cumulato ?? 0) >= 0 ? "#16A34A" : "#DC2626"};">${fmtEur(e.cumulato ?? 0)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageCO2(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const co2 = calcolaCO2Equivalenze({ produzione_kwh_anno: d.flows.produzione_kwh });
  const treesIcons = "🌳".repeat(Math.min(20, Math.round(co2.alberi_anno / 8)));
  const flightsIcons = "✈️".repeat(Math.min(20, co2.voli_anno));
  const carsIcons = "🚗".repeat(Math.min(10, Math.round(co2.km_auto_anno / 2500)));
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · L'impatto sul pianeta</div>
      <h1 class="page-title">${fmtNum(co2.ton_co2_anno, 2)} t di CO₂<br/>in meno ogni anno.</h1>
      <p class="page-subtitle">Il tuo impianto è un bosco a casa tua. Ecco cosa significa, in modo concreto.</p>
      <div class="kpi-big" style="text-align:center;padding:8mm;margin:4mm 0;">
        <div class="kbig-label" style="margin-bottom:2mm;">CO₂ evitata in 25 anni</div>
        <div class="kbig-value" style="font-size:42pt;">${fmtNum(co2.ton_co2_totale, 1)} tonnellate</div>
        <div class="kbig-sub" style="font-size:9pt;margin-top:2mm;">${fmtNum(co2.kg_co2_anno)} kg/anno · pari a una piccola foresta nel tuo cortile</div>
      </div>
      <h3 style="font-size:11pt;color:#1E3A5F;margin:4mm 0 2mm;">Ciò corrisponde a (ogni anno):</h3>
      <div class="eq-row"><div class="eq-num">${fmtNum(co2.alberi_anno)}<small>Alberi</small></div><div><div class="eq-icons">${treesIcons}</div><div class="eq-desc">Una piccola foresta che assorbe la stessa CO₂. Ogni albero medio assorbe ~25 kg di CO₂ all'anno.</div></div></div>
      <div class="eq-row"><div class="eq-num">${fmtNum(co2.voli_anno)}<small>Voli</small></div><div><div class="eq-icons">${flightsIcons}</div><div class="eq-desc">Voli evitati Milano → Maiorca, in equivalenza CO₂. Un volo medio EU breve emette ~200 kg di CO₂.</div></div></div>
      <div class="eq-row"><div class="eq-num">${fmtNum(co2.km_auto_anno)}<small>Km auto</small></div><div><div class="eq-icons">${carsIcons}</div><div class="eq-desc">Chilometri non percorsi con un'auto a benzina (~150 g CO₂/km). Quasi un giro del mondo all'anno.</div></div></div>
      <div class="callout callout-success">
        <span class="callout-icon">✓</span>
        <div><strong>Energia 100% pulita, certificata RID GSE.</strong>
        Il tuo impianto è iscritto al registro nazionale dei produttori di energia rinnovabile.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageGaranzie(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · Garanzie e assistenza</div>
      <h1 class="page-title">25 anni di<br/>tranquillità.</h1>
      <p class="page-subtitle">Le garanzie reali sui componenti, sulla manodopera e sulla nostra azienda.</p>
      <div class="guarantee-grid">
        <div class="guarantee-card"><div class="g-num">25 anni</div><div class="g-title">Garanzia prestazione pannelli</div><div class="g-desc">Il produttore garantisce a 25 anni almeno l'80% della potenza iniziale. Garanzia diretta produttore con copertura globale.</div></div>
        <div class="guarantee-card"><div class="g-num">10 anni</div><div class="g-title">Garanzia inverter + accumulo</div><div class="g-desc">Copertura su tutti i componenti elettronici. Sostituzione gratuita. Estendibile a 15 anni.</div></div>
        <div class="guarantee-card"><div class="g-num">10 anni</div><div class="g-title">Garanzia manodopera</div><div class="g-desc">${escHtml(d.azienda.name)} garantisce installazione, struttura e tenuta tetto. Intervento entro 48h dalla chiamata.</div></div>
        <div class="guarantee-card"><div class="g-num">5M €</div><div class="g-title">Polizza RC + danni terzi</div><div class="g-desc">Assicurazione 5 milioni €. Danni a cose e persone, durante posa e tutta vita impianto.</div></div>
      </div>
      <h3 style="font-size:11pt;color:#1E3A5F;margin:4mm 0 2mm;">L'azienda dietro al tuo impianto</h3>
      <ul class="bullets">
        <li>${escHtml(d.azienda.name)} · partner certificato installatori FV residenziali</li>
        <li>Squadra interna tecnici certificati FER</li>
        <li>Albo installatori GSE · partner Premium produttori top tier</li>
        <li>Reperibilità 7gg/7 · linea diretta titolare</li>
        ${d.azienda.vat_number ? `<li>P.IVA ${escHtml(d.azienda.vat_number)}</li>` : ""}
      </ul>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageIter(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · Iter pratiche</div>
      <h1 class="page-title">Pensiamo a<br/>tutto noi.</h1>
      <p class="page-subtitle">Tu firmi una sola volta. Noi gestiamo l'intero iter burocratico.</p>
      <div class="tl">
        <div class="tl-item"><div class="tl-day">Settimana 1</div><div class="tl-title">Firma contratto + apertura pratica finanziamento</div><div class="tl-desc">Firma digitale via email. KYC online 5 minuti. Rata parte solo dopo allaccio.</div></div>
        <div class="tl-item"><div class="tl-day">Settimana 1-2</div><div class="tl-title">CILA Comune ${escHtml(d.cliente.comune ?? "")} + TICA e-Distribuzione</div><div class="tl-desc">Comunicazione Inizio Lavori Asseverata + richiesta connessione. Le predisponiamo, le firmiamo per delega, le inoltriamo.</div></div>
        <div class="tl-item"><div class="tl-day">Settimana 3-4</div><div class="tl-title">Ordine pannelli + inverter + accumulo</div><div class="tl-desc">Lead time 10 giorni. Tutto consegnato al nostro magazzino per controllo qualità.</div></div>
        <div class="tl-item"><div class="tl-day">Settimana 5</div><div class="tl-title">★ INSTALLAZIONE · 3 giornate a casa tua</div><div class="tl-desc">Squadra 3 tecnici · giorno 1 struttura · giorno 2 pannelli + cablaggio · giorno 3 inverter + test. Tutto pulito.</div></div>
        <div class="tl-item"><div class="tl-day">Settimana 6</div><div class="tl-title">Allaccio rete + collaudo + RID GSE</div><div class="tl-desc">e-Distribuzione fa l'allaccio. Apriamo Scambio Sul Posto al GSE. Da qui ATTIVO.</div></div>
        <div class="tl-item"><div class="tl-day">Settimana 7</div><div class="tl-title">Documentazione + dossier IRPEF + saldo</div><div class="tl-desc">Libretto + manuale + dossier già pronto per commercialista. Saldo finale via finanziaria.</div></div>
      </div>
      <div class="callout callout-success">
        <span class="callout-icon">✓</span>
        <div><strong>Tempo totale: ~7 settimane dalla firma all'attivazione.</strong>
        Tu firmi una volta sola. Tutto il resto — comune, e-Distribuzione, GSE, ENEA — lo gestiamo noi.</div>
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageFAQ(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const faqs = [
    { q: "E se l'impianto non produce abbastanza?", a: "Garanzia prestazione produttore: a 25 anni i pannelli producono almeno l'80% della potenza iniziale. Sotto soglia, il produttore sostituisce gratuitamente. L'inverter monitora 24/7: appena qualcosa scende, partiamo noi." },
    { q: "Cosa succede se vendo casa?", a: "L'impianto resta attaccato all'immobile e ne aumenta valore di vendita 8-12%. Il finanziamento può essere trasferito o estinto senza penali. La detrazione IRPEF si trasferisce al nuovo proprietario." },
    { q: "L'accumulo dura davvero 10 anni?", a: "Le batterie LFP moderne hanno ~4.500 cicli garantiti — ~12-13 anni di uso normale. Garanzia 10 anni o 70% capacità residua. Sostituzione gratuita in caso di degrado anticipato." },
    { q: "Posso espandere in futuro?", a: "Sì. Inverter dimensionato con margine. Accumulo modulare: aggiungere altri kWh è plug-and-play. Pratica adeguamento GSE inclusa." },
    { q: "Cosa succede se la rete elettrica salta?", a: "Inverter ibrido + accumulo abilitano modalità backup: in blackout l'impianto continua a fornire energia per le ore di autonomia disponibile." },
    { q: "Devo pagare qualcosa al catasto?", a: "No. FV residenziale fino a 20 kWp non genera obblighi catastali e non rileva ai fini IMU. La detrazione IRPEF va indicata in dichiarazione: ti consegnamo dossier già pronto." },
  ];
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · Domande frequenti</div>
      <h1 class="page-title">Le domande<br/>che fanno tutti.</h1>
      <div style="margin-top:4mm;">
        ${faqs.map((f) => `<div class="qa-item"><div class="qa-q">${escHtml(f.q)}</div><div class="qa-a">${escHtml(f.a)}</div></div>`).join("")}
      </div>
    </div>
    ${footer(d.azienda.name, [d.azienda.website, d.azienda.phone].filter(Boolean).join(" · "), pageN, total)}
  </div>`;
}

function pageDecisione(d: FvPdfTemplateData, pageN: number, total: number): string {
  const cliente = `${d.cliente.nome} ${d.cliente.cognome}`.trim();
  const fin = d.finanziamento;
  const rata = fin?.rata_mensile ?? Math.round((d.costi.prezzo_vendita_iva_inclusa * 1.2) / 84);
  const netto = Math.max(0, rata - d.scenario.risparmio_mensile_eur);
  const indirizzoCompleto = [
    d.cliente.indirizzo,
    d.cliente.cap && d.cliente.comune ? `${d.cliente.cap} ${d.cliente.comune}` : d.cliente.comune,
    d.cliente.provincia ? `(${d.cliente.provincia})` : null,
  ].filter(Boolean).join(", ");
  const docMeta = `${d.azienda.name}${d.azienda.vat_number ? ` · P.IVA ${d.azienda.vat_number}` : ""} · Doc ${d.progetto.numero} · ${fmtData(d.progetto.creato_il)}`;
  return `<div class="page">
    ${header(d.progetto.numero, cliente, d.azienda.name)}
    <div class="content">
      <div class="eyebrow">Pagina ${pageN} · La tua decisione</div>
      <h1 class="page-title">Pronto a<br/>iniziare?</h1>
      <div class="offer-box">
        <div class="offer-eyebrow">★ Riepilogo offerta — valida ${d.progetto.valido_giorni} giorni</div>
        <h3>Impianto FV ${fmtNum(d.progetto.potenza_kwp, 1)} kWp${d.progetto.has_accumulo ? ` + accumulo ${fmtNum(d.progetto.capacita_accumulo_kwh, 1)} kWh` : ""}<br/>chiavi in mano</h3>
        <div class="offer-num">${fmtEur(d.costi.prezzo_vendita_iva_inclusa)}</div>
        <div style="font-size:9pt;opacity:0.85;margin-top:2mm;position:relative;">IVA ${d.costi.iva_perc}% inclusa${fin ? ` · ${fmtEur(rata)}/mese × ${fin.durata_mesi} mesi (${escHtml(fin.finanziaria)} TAEG ${fmtNum(fin.taeg_perc, 2)}%)` : ""}<br/>Costo netto reale: <strong style="color:#FBBF24;">${fmtEur(netto)}/mese</strong> (rata − risparmio)</div>
      </div>
      <div class="two-col">
        <div>
          <h3 style="font-size:11pt;color:#1E3A5F;margin-bottom:2mm;">Per accettare la proposta</h3>
          <ol style="font-size:9pt;padding-left:5mm;line-height:1.8;color:#475569;">
            <li>Firma digitale tramite link sull'email che hai ricevuto</li>
            <li>Compila KYC finanziaria (5 minuti)</li>
            <li>Attendi delibera (24-48 ore)</li>
            <li>Avvio pratiche · prima visita 7 giorni dopo</li>
          </ol>
        </div>
        <div>
          <h3 style="font-size:11pt;color:#1E3A5F;margin-bottom:2mm;">Per parlarne ancora</h3>
          <div style="font-size:9pt;line-height:2;color:#475569;">
            ${d.azienda.phone ? `📞 <strong>${escHtml(d.azienda.phone)}</strong><br/>` : ""}
            ${d.azienda.email ? `✉ <strong>${escHtml(d.azienda.email)}</strong><br/>` : ""}
            ${d.azienda.website ? `🌐 <strong>${escHtml(d.azienda.website)}</strong>` : ""}
          </div>
        </div>
      </div>
      <div class="sig-box">
        <div class="sig-label">Firma del cliente per accettazione</div>
        <div class="sig-line"></div>
        <div class="sig-name">${escHtml(cliente)}</div>
        <div style="font-size:8pt;color:#64748B;margin-top:1mm;">${escHtml(indirizzoCompleto)}${d.cliente.cf ? ` · CF: ${escHtml(d.cliente.cf)}` : ""}</div>
      </div>
    </div>
    <div class="page-footer"><span>${escHtml(docMeta)}</span><span class="pnum">${pageN} / ${total}</span></div>
  </div>`;
}

// ─── ENTRY POINT ───────────────────────────────────────────────────────────

export function renderFvPdfHtml(d: FvPdfTemplateData): string {
  const TOTAL = 16;
  const pages = [
    pageCover(d),
    pageInvestimento(d, 2, TOTAL),
    pageAnteprima(d, 3, TOTAL),
    pageComponenti(d, 4, TOTAL),
    pageProduzione(d, 5, TOTAL),
    pageFlussi(d, 6, TOTAL),
    pageRisparmio(d, 7, TOTAL),
    pageCostiFuturi(d, 8, TOTAL),
    pagePiano(d, 9, TOTAL),
    pageBollette240(d, 10, TOTAL),
    pageCassa25(d, 11, TOTAL),
    pageCO2(d, 12, TOTAL),
    pageGaranzie(d, 13, TOTAL),
    pageIter(d, 14, TOTAL),
    pageFAQ(d, 15, TOTAL),
    pageDecisione(d, 16, TOTAL),
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Preventivo Fotovoltaico — ${escHtml(d.cliente.nome)} ${escHtml(d.cliente.cognome)} — ${escHtml(d.progetto.numero)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
${pages}
<script>
  // Auto-print se ?print=1 (per "Stampa PDF" automatica)
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('print') === '1') {
    window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 600); });
  }
</script>
</body>
</html>`;
}
