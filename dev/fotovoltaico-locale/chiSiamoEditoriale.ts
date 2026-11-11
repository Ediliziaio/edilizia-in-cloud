/** Veste locale della pagina nativa: contenuti, foto e personalizzazioni restano nel modello. */
export const STILE_CHI_SIAMO=`
.cv-about .page-title{font-family:inherit;font-size:30pt;line-height:1.07;letter-spacing:-1px;font-weight:750;color:#188569;margin:3mm 0}
.cv-about .page-title::first-line{color:#203d50}
.cv-about .page-subtitle{font-size:10pt;line-height:1.5;color:#647986;margin:3mm 0 5mm}
.cv-about>.callout-info{display:block;padding:5mm 6mm;margin:1mm 0 6mm;border:0;border-radius:4mm;background:#eef4ee;color:#203d50}
.cv-about>.callout-info>.callout-icon{display:none}
.cv-about>.callout-info>div>strong:first-child{font-size:7pt;letter-spacing:1px;text-transform:uppercase;color:#647986;margin:0 0 2mm}
.cv-about .rich-text{font-size:10pt;line-height:1.55;color:#526e79}
.cv-about .rich-text p{margin:2mm 0}
.cv-about .rich-text p:first-child{font-size:7.5pt;color:#71858b}
.cv-about .rich-text p:first-child strong{display:block;font-size:22pt;line-height:1.2;letter-spacing:-.6px;color:#203d50;margin-bottom:1.5mm}
.cv-about .guarantee-grid{gap:4mm;margin:0 0 5mm}
.cv-about .guarantee-card{position:relative;padding:4.5mm 5mm;min-height:37mm;background:#fafbf8;border:1px solid #dce5df;border-radius:3.5mm;box-shadow:none}
.cv-about .guarantee-card .g-num{display:flex;align-items:center;justify-content:center;width:12mm;height:12mm;border-radius:3mm;background:#deeee4;border:1px solid #b8d6c4;color:#188569;font-family:inherit;font-size:11pt;font-weight:650;line-height:1;margin:0 0 3mm}
.cv-about .guarantee-card .g-num svg{display:block;width:8mm;height:8mm;flex:none}
.cv-about .guarantee-card .g-title{font-size:11pt;line-height:1.3;color:#203d50;font-weight:650;margin-bottom:2mm}
.cv-about .guarantee-card .g-desc{font-size:8.5pt;line-height:1.5;color:#647986}
.cv-about .guarantee-card.con-badge{grid-template-columns:11mm 1fr}
.cv-about .guarantee-card .g-badge{width:10mm;height:10mm}
.cv-about>h3{font-family:inherit;font-size:14pt!important;line-height:1.3;color:#203d50!important;margin:1mm 0 3mm!important}
.cv-about .bullets{display:grid;grid-template-columns:1fr 1fr;gap:5mm;padding:0;margin:0}
.cv-about .bullets li{padding:3mm 0 0;border-top:1px solid #d9e5dc;font-size:8.5pt;line-height:1.5;color:#647986}
.cv-about .bullets li::before{content:none}
.cv-about .bullets li strong{display:block;font-size:10pt;font-weight:650;line-height:1.4;color:#188569;margin-bottom:1.5mm}
`;
export function vesteChiSiamo(html:string){return html.replace('<div class="content">','<div class="content cv-about">').replaceAll('</strong> — ','</strong>').replaceAll('</strong> · ','</strong>');}
