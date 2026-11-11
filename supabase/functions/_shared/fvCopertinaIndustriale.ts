import type { FvPdfTemplateData } from "./fvHtmlTemplate.ts";
import { escHtml, fmtNum, fmtData } from "./fvCalcoli.ts";
import { svgIconaEditorialeFv } from "./fvIconeEditoriali.ts";

export const IMMAGINE_COPERTINA_INDUSTRIALE = "/pdf-stock/fotovoltaico/industriale/capannone-copertina-v1.webp";

export function copertinaIndustrialeAttiva(blocchi?: Record<string, unknown> | null) {
  const c = blocchi?.copertina_industriale;
  return !!c && typeof c === "object" && (c as { attiva?: unknown }).attiva === true;
}
type StileCopertina = {
  cliente: string; indirizzo: string; tipologia: string; eyebrow: string; hero: string; subtitle: string;
  bgColor: string; textColor: string; imageUrl: string | null; logoUrl: string | null;
  showBrand: boolean; brandJustify: string; align: string; showClientCard: boolean;
  titleSize: number; subtitleSize: number; eyebrowSize: number; fotoIllustrativa: boolean;
};
export function coverIndustrialeFv(d: FvPdfTemplateData, p: StileCopertina): string {
  const modo = d.economia_azienda?.input.parametri.modo;
  const formula = modo ? ({ cash: "Acquisto diretto", rate: "Finanziamento", noleggio: "Noleggio operativo", leasing: "Leasing" })[modo] : "Da definire";
  const titolo = escHtml(p.hero).replace(/\n/g, "<br/>");
  const titoloSize = Math.min(p.titleSize, p.hero.length > 150 ? 26 : p.hero.length > 80 ? 32 : 44);
  const demo = d.anteprima_dimostrativa || d.simulazione_azienda;
  return `<div class="page"><div class="cover cover--flat cover--industrial" style="background:${escHtml(p.bgColor)};color:${escHtml(p.textColor)};">
<style>
.cover--industrial::before,.cover--industrial::after{display:none}.cover--industrial{display:flex;flex-direction:column;padding:0;height:100%;overflow:hidden}
.ic-brand{flex:0 0 30mm;background:#fff;color:#203d50;margin:0!important;padding:7mm 16mm;gap:4mm;min-height:0}.ic-brand .icon{width:13mm;height:13mm;border-radius:3mm;background:#edf4ee;color:#188569;display:flex;align-items:center;justify-content:center}.ic-brand .name{font-size:17pt;line-height:1.15;color:#203d50;overflow-wrap:anywhere}.ic-brand .tagline{font-size:8pt;line-height:1.35;color:#647986;opacity:1}.ic-brand .logo-img{width:auto;height:auto;max-width:65mm;max-height:16mm;border-radius:0;background:transparent;padding:0;object-fit:contain}
.ic-photo{margin:0;flex:0 0 103mm;position:relative;overflow:hidden;background:#e1e9e5}.ic-photo img{width:100%;height:100%;display:block;object-fit:cover;object-position:center 50%}.ic-photo figcaption{position:absolute;left:16mm;bottom:3mm;font-size:7.5pt;line-height:1.3;padding:1mm 2mm;border-radius:1mm;background:rgba(255,255,255,.93);color:#405965}
.ic-panel{flex:1;min-height:0;padding:9mm 16mm 7mm;display:flex;flex-direction:column;position:relative}.ic-eyebrow{font-size:8pt;line-height:1.3;letter-spacing:1.1px;font-weight:700;margin:0 0 3mm}.ic-title{font-weight:750;line-height:1.05!important;letter-spacing:-1.2px;margin:0 0 3mm!important;overflow-wrap:anywhere}.ic-subtitle{font-size:11pt;line-height:1.45;max-width:165mm;margin:0 0 5mm;opacity:.85}
.ic-metrics{display:grid;grid-template-columns:1fr .85fr 1.4fr;gap:4mm;padding:4mm 0;margin:0 0 4mm;border-top:1px solid currentColor;border-bottom:1px solid currentColor}.ic-metrics>div+div{border-left:1px solid currentColor;padding-left:4mm}.ic-metrics small{display:block;font-size:7.5pt;line-height:1.3;letter-spacing:.5px;margin-bottom:1.5mm;opacity:.8}.ic-metrics strong{font-size:22pt;line-height:1.2;letter-spacing:-.6px}.ic-metrics strong span{font-size:11pt;letter-spacing:0}.ic-metrics .formula{display:block;font-size:14pt;line-height:1.25;letter-spacing:-.2px;overflow-wrap:anywhere}
.ic-client{margin-top:auto;padding:1mm 0 3mm;overflow-wrap:anywhere}.ic-client small{font-size:7.5pt;line-height:1.3;letter-spacing:.5px;opacity:.8}.ic-client strong{font-size:13pt;line-height:1.3;display:block;margin:1mm 0}.ic-client p{font-size:8.5pt;line-height:1.4;margin:0;opacity:.85}.ic-footer{font-size:7.5pt;line-height:1.4;opacity:.8;display:flex;justify-content:space-between;gap:6mm;overflow-wrap:anywhere}.ic-footer>div{min-width:0}.ic-footer .status{max-width:78mm;text-align:right}
</style>
<div class="cover-brand ic-brand" style="justify-content:${p.brandJustify};">${p.showBrand ? `${p.logoUrl ? `<img class="logo-img" src="${escHtml(p.logoUrl)}" alt="${escHtml(d.azienda.name)}"/>` : `<div class="icon">${svgIconaEditorialeFv("sun", { dimensione: 27, colore: "#188569" })}</div>`}<div>${!p.logoUrl ? `<div class="name">${escHtml(d.azienda.name)}</div>` : ""}${d.azienda.tagline ? `<div class="tagline">${escHtml(d.azienda.tagline)}</div>` : ""}</div>` : ""}</div>
${p.imageUrl ? `<figure class="ic-photo"><img src="${escHtml(p.imageUrl)}" alt="Copertina illustrativa di un impianto fotovoltaico industriale"/>${p.fotoIllustrativa ? '<figcaption>Immagine illustrativa · non rappresenta il sito del cliente.</figcaption>' : ""}</figure>` : ""}
<section class="ic-panel" style="text-align:${p.align};"><div class="ic-eyebrow" style="font-size:${p.eyebrowSize}pt;">${escHtml(p.eyebrow)}</div><h1 class="ic-title" style="font-size:${titoloSize}pt;color:${escHtml(p.textColor)};">${titolo}</h1><p class="ic-subtitle" style="font-size:${p.subtitleSize}pt;">${escHtml(p.subtitle).replace(/\n/g,"<br/>")}</p>
<div class="ic-metrics"><div><small>POTENZA PROPOSTA</small><strong>${d.progetto.potenza_kwp > 0 ? `${fmtNum(d.progetto.potenza_kwp,1)} <span>kWp</span>` : "Da definire"}</strong></div><div><small>MODULI PREVISTI</small><strong>${d.progetto.numero_pannelli > 0 ? fmtNum(d.progetto.numero_pannelli) : "Da definire"}</strong></div><div><small>MODALITÀ SCELTA</small><strong class="formula">${formula}</strong></div></div>
${p.showClientCard ? `<div class="ic-client"><small>PROPOSTA PREPARATA PER</small><strong>${escHtml(p.cliente)}</strong><p>${escHtml([p.indirizzo,p.tipologia].filter(Boolean).join(" · "))}</p></div>` : ""}
<div class="ic-footer"><div>Preventivo ${escHtml(d.progetto.numero)}<br/>${escHtml(fmtData(d.progetto.creato_il))}</div><div class="status">${demo ? "Anteprima dimostrativa · non è un’offerta" : `Validità della proposta: ${d.progetto.valido_giorni} giorni`}</div></div></section></div></div>`;
}
