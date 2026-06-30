/**
 * SVG Chart renderers per il PDF Fotovoltaico v2.
 * Tutti i chart sono SVG inline serializzato — nessuna dipendenza esterna,
 * funziona in Deno edge function e viene embedded direttamente nell'HTML.
 *
 * Convenzione colori:
 *   navy   = #1E3A5F (linee primarie)
 *   orange = #F97316 (accent + producibilità)
 *   green  = #16A34A (autoconsumo / risparmio)
 *   red    = #DC2626 (senza FV / perdite)
 *   gray   = #94A3B8 (axes / labels)
 */

import type { FvFlows, FvCosti20Output } from "./fvCalcoli.ts";

const C = {
  navy: "#1E3A5F",
  navyLight: "#2C5184",
  orange: "#F97316",
  orangeDark: "#C2410C",
  amber: "#FBBF24",
  green: "#16A34A",
  greenDark: "#166534",
  greenLight: "#22C55E",
  red: "#DC2626",
  redLight: "#FECACA",
  gray: "#94A3B8",
  grayDark: "#64748B",
  border: "#E2E8F0",
};

const MESI = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];

// ─── 1. PRODUCIBILITÀ MENSILE (bar chart) ──────────────────────────────────

export function svgProducibilitaMensile(values: number[]): string {
  const W = 700;
  const H = 220;
  const padL = 40, padR = 20, padT = 30, padB = 30;
  const max = Math.max(...values);
  const barW = (W - padL - padR) / values.length - 4;
  const yLabels = [Math.round(max), Math.round(max * 0.7), Math.round(max * 0.4)];
  const yScale = (v: number) => padT + (1 - v / max) * (H - padT - padB);

  const bars = values
    .map((v, i) => {
      const x = padL + 2 + i * (barW + 4);
      const y = yScale(v);
      const h = H - padB - y;
      const grad = i >= 5 && i <= 8 ? "url(#prodOrange)" : "url(#prodAmber)";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${grad}"/>`;
    })
    .join("");
  const labelsX = MESI.map(
    (m, i) => `<text x="${(padL + 2 + i * (barW + 4) + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="${C.gray}">${m}</text>`,
  ).join("");
  const gridLines = yLabels
    .map((v) => {
      const y = yScale(v);
      return `<line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C.border}" stroke-dasharray="2,3"/><text x="${padL - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">${v}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">
    <defs>
      <linearGradient id="prodAmber" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.amber}"/><stop offset="100%" stop-color="#F59E0B"/>
      </linearGradient>
      <linearGradient id="prodOrange" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.orange}"/><stop offset="100%" stop-color="${C.orangeDark}"/>
      </linearGradient>
    </defs>
    ${gridLines}
    ${bars}
    ${labelsX}
  </svg>`;
}

// ─── 2. SANKEY "DOVE VA L'ENERGIA CHE PRODUCI" ─────────────────────────────

// Defs condivise per i Sankey: lucentezza "tubo" (overlay verticale) + ombra box.
// `ns` namespacizza gli id così i due diagrammi sulla stessa pagina non collidono.
function sankeyDefs(ns: string): string {
  return `<linearGradient id="${ns}Gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="42%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="58%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>
    </linearGradient>
    <filter id="${ns}Shadow" x="-12%" y="-12%" width="124%" height="135%">
      <feDropShadow dx="0" dy="2.5" stdDeviation="3.5" flood-color="#1E3A5F" flood-opacity="0.20"/>
    </filter>
    <filter id="${ns}PillShadow" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#1E3A5F" flood-opacity="0.16"/>
    </filter>`;
}

// Helper: ribbon Sankey fluido tra due segmenti verticali (sorgente → destinazione).
// I bordi top/bottom sono curve bezier parallele → nastro morbido. Le estremità
// vengono "infilate" SOTTO i box (overlap `ov`): i box opachi disegnati dopo
// coprono l'innesto → il nastro sembra nascere dal bordo del box, senza fessure.
// Sopra al colore pieno si sovrappone una lucentezza verticale (`${ns}Gloss`)
// che dà al nastro l'aspetto di un tubo cilindrico solido, non di una sagoma piatta.
function sankeyRibbon(
  xL: number, ytL: number, ybL: number,
  xR: number, ytR: number, ybR: number,
  fill: string, ns: string, ov = 16,
): string {
  const cx = (xL + xR) / 2;
  const f = (n: number) => n.toFixed(1);
  const xL2 = xL - ov, xR2 = xR + ov;
  const d = `M ${f(xL2)},${f(ytL)} C ${f(cx)},${f(ytL)} ${f(cx)},${f(ytR)} ${f(xR2)},${f(ytR)} L ${f(xR2)},${f(ybR)} C ${f(cx)},${f(ybR)} ${f(cx)},${f(ybL)} ${f(xL2)},${f(ybL)} Z`;
  return `<path d="${d}" fill="${fill}"/><path d="${d}" fill="url(#${ns}Gloss)"/>`;
}

// Helper: pill etichetta % centrata sul nastro (pastiglia bianca con ombra morbida).
function sankeyPill(x: number, y: number, text: string, color: string, ns: string, w = 120): string {
  return `<g filter="url(#${ns}PillShadow)">
    <rect x="${(x - w / 2).toFixed(1)}" y="${(y - 11).toFixed(1)}" width="${w}" height="22" rx="11" fill="white"/>
    <text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="${color}" font-family="'Outfit',sans-serif">${text}</text>
  </g>`;
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Box Sankey con testo top-anchored: regge anche le altezze minime senza
// sovrapposizioni (header in alto, numero, sottotitolo a offset fissi dal top).
// Ombra morbida (`${ns}Shadow`) per staccare il box dai nastri e dare profondità.
function sankeyBox(
  x: number, y: number, w: number, h: number,
  grad: string, header: string, value: string, sub: string,
  color: string, ns: string, hero = false,
): string {
  const numSize = hero ? 26 : 19;
  const numY = hero ? y + 66 : y + 50;
  const subY = hero ? y + 86 : y + 66;
  const f = (n: number) => n.toFixed(1);
  return `<rect x="${x}" y="${f(y)}" width="${w}" height="${f(h)}" rx="12" fill="url(#${grad})" filter="url(#${ns}Shadow)"/>
    <text x="${x + 16}" y="${f(y + 25)}" font-size="10.5" font-weight="800" fill="${color}" letter-spacing="0.5">${header}</text>
    <text x="${x + 16}" y="${f(numY)}" font-size="${numSize}" font-weight="800" fill="${color}" font-family="'Outfit',sans-serif">${value}</text>
    <text x="${x + 16}" y="${f(subY)}" font-size="9.5" font-weight="600" fill="${color}" opacity="0.92">${sub}</text>`;
}

// Altezze: box "hero" fisso, box laterali proporzionali (min leggibile / max).
const SANKEY_HERO_H = 108;
const SANKEY_MIN_H = 76;
const SANKEY_MAX_H = 108;

export function svgSankeyDoveVa(flows: FvFlows): string {
  const W = 700, H = 216, midY = H / 2;
  // Percentuali derivate dai kWh REALI mostrati nei box (sempre coerenti col disegno).
  const auto = Math.max(0, flows.autoconsumo_kwh);
  const rete = Math.max(0, flows.ceduto_rete_kwh);
  const tot = Math.max(1, auto + rete);
  const autoFrac = auto / tot, reteFrac = rete / tot;
  const autoPct = Math.round(autoFrac * 100);
  const retePct = 100 - autoPct;

  // Sorgente (hero): bordo destro diviso in proporzione (i nastri riempiono il bordo).
  const srcX = 52, srcW = 168, srcY = midY - SANKEY_HERO_H / 2, srcH = SANKEY_HERO_H;
  const SX = srcX + srcW;
  const aEdgeBot = srcY + srcH * autoFrac;

  // Destinazioni: altezza proporzionale (con minimo leggibile), gruppo centrato.
  const dX = 480, dW = 168;
  const hCasa = clampN(srcH * autoFrac, SANKEY_MIN_H, SANKEY_MAX_H);
  const hRete = clampN(srcH * reteFrac, SANKEY_MIN_H, SANKEY_MAX_H);
  const gap = 14;
  const casaY = midY - (hCasa + hRete + gap) / 2;
  const reteY = casaY + hCasa + gap;

  const autoLabelY = ((srcY + aEdgeBot) / 2 + (casaY + hCasa / 2)) / 2;
  const reteLabelY = ((aEdgeBot + srcY + srcH) / 2 + (reteY + hRete / 2)) / 2;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">
    <defs>
      <linearGradient id="dvAuto" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.amber}"/>
        <stop offset="55%" stop-color="${C.greenLight}"/>
        <stop offset="100%" stop-color="${C.green}"/>
      </linearGradient>
      <linearGradient id="dvRete" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.amber}"/>
        <stop offset="60%" stop-color="${C.navyLight}"/>
        <stop offset="100%" stop-color="${C.navy}"/>
      </linearGradient>
      <linearGradient id="dvPv" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FCD34D"/><stop offset="100%" stop-color="${C.amber}"/>
      </linearGradient>
      <linearGradient id="dvCasa" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.greenLight}"/><stop offset="100%" stop-color="${C.green}"/>
      </linearGradient>
      <linearGradient id="dvGrid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.navyLight}"/><stop offset="100%" stop-color="${C.navy}"/>
      </linearGradient>
      ${sankeyDefs("dv")}
    </defs>

    <!-- Nastri (disegnati sotto i box) -->
    ${sankeyRibbon(SX, srcY, aEdgeBot, dX, casaY, casaY + hCasa, "url(#dvAuto)", "dv")}
    ${sankeyRibbon(SX, aEdgeBot, srcY + srcH, dX, reteY, reteY + hRete, "url(#dvRete)", "dv")}

    <!-- Etichette % centrate sui nastri -->
    ${sankeyPill((SX + dX) / 2, autoLabelY, `${autoPct}% in casa`, C.greenDark, "dv")}
    ${sankeyPill((SX + dX) / 2, reteLabelY, `${retePct}% in rete`, C.navy, "dv")}

    ${sankeyBox(srcX, srcY, srcW, srcH, "dvPv", "★ FOTOVOLTAICO", `${flows.produzione_kwh.toLocaleString("it-IT")}`, "kWh prodotti / anno", C.orangeDark, "dv", true)}
    ${sankeyBox(dX, casaY, dW, hCasa, "dvCasa", "⌂ CASA &amp; BATTERIA", `${auto.toLocaleString("it-IT")} kWh`, "autoconsumo diretto", "white", "dv")}
    ${sankeyBox(dX, reteY, dW, hRete, "dvGrid", "⚡ RETE PUBBLICA", `${rete.toLocaleString("it-IT")} kWh`, "energia immessa", "white", "dv")}
  </svg>`;
}

// ─── 3. SANKEY "DA DOVE VIENE L'ENERGIA CHE CONSUMI" ───────────────────────

export function svgSankeyDaDoveViene(flows: FvFlows, consumo_annuo_kwh: number): string {
  const W = 700, H = 216, midY = H / 2;
  // Percentuali derivate dai kWh REALI dei box (FV = autoconsumo, Rete = prelievo).
  const dalSole = Math.max(0, flows.autoconsumo_kwh);
  const dallaRete = Math.max(0, flows.prelievo_rete_kwh);
  const tot = Math.max(1, dalSole + dallaRete);
  const fvFrac = dalSole / tot, reteFrac = dallaRete / tot;
  const fvPct = Math.round(fvFrac * 100);
  const retePct = 100 - fvPct;

  // Destinazione (Casa, hero) a destra: bordo sinistro diviso in proporzione FV/Rete.
  const casaX = 480, casaW = 168, casaY = midY - SANKEY_HERO_H / 2, casaH = SANKEY_HERO_H;
  const DX = casaX;
  const fvEntryBot = casaY + casaH * fvFrac;

  // Sorgenti a sinistra: altezza proporzionale, gruppo centrato.
  const srcX = 52, srcW = 168, SX = srcX + srcW;
  const hFv = clampN(casaH * fvFrac, SANKEY_MIN_H, SANKEY_MAX_H);
  const hRete = clampN(casaH * reteFrac, SANKEY_MIN_H, SANKEY_MAX_H);
  const gap = 14;
  const fvY = midY - (hFv + hRete + gap) / 2;
  const reteY = fvY + hFv + gap;

  const fvLabelY = ((fvY + hFv / 2) + (casaY + fvEntryBot) / 2) / 2;
  const reteLabelY = ((reteY + hRete / 2) + (fvEntryBot + casaY + casaH) / 2) / 2;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">
    <defs>
      <linearGradient id="ddFv" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.amber}"/>
        <stop offset="55%" stop-color="${C.greenLight}"/>
        <stop offset="100%" stop-color="${C.green}"/>
      </linearGradient>
      <linearGradient id="ddRete" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.navy}"/>
        <stop offset="45%" stop-color="${C.navyLight}"/>
        <stop offset="100%" stop-color="${C.green}"/>
      </linearGradient>
      <linearGradient id="ddPv" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FCD34D"/><stop offset="100%" stop-color="${C.amber}"/>
      </linearGradient>
      <linearGradient id="ddCasa" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.greenLight}"/><stop offset="100%" stop-color="${C.green}"/>
      </linearGradient>
      <linearGradient id="ddGrid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.navyLight}"/><stop offset="100%" stop-color="${C.navy}"/>
      </linearGradient>
      ${sankeyDefs("dd")}
    </defs>

    <!-- Nastri -->
    ${sankeyRibbon(SX, fvY, fvY + hFv, DX, casaY, fvEntryBot, "url(#ddFv)", "dd")}
    ${sankeyRibbon(SX, reteY, reteY + hRete, DX, fvEntryBot, casaY + casaH, "url(#ddRete)", "dd")}

    <!-- Etichette % -->
    ${sankeyPill((SX + DX) / 2, fvLabelY, `${fvPct}% dal sole`, C.greenDark, "dd")}
    ${sankeyPill((SX + DX) / 2, reteLabelY, `${retePct}% dalla rete`, C.navy, "dd")}

    ${sankeyBox(srcX, fvY, srcW, hFv, "ddPv", "★ FOTOVOLTAICO", `${dalSole.toLocaleString("it-IT")} kWh`, "il tuo · gratis", C.orangeDark, "dd")}
    ${sankeyBox(srcX, reteY, srcW, hRete, "ddGrid", "⚡ RETE PUBBLICA", `${dallaRete.toLocaleString("it-IT")} kWh`, "prelievo residuo", "white", "dd")}
    ${sankeyBox(casaX, casaY, casaW, casaH, "ddCasa", "⌂ CASA", `${consumo_annuo_kwh.toLocaleString("it-IT")}`, "kWh consumati / anno", "white", "dd", true)}
  </svg>`;
}

// ─── 4. COSTI 20 ANNI (bar chart confronto) ────────────────────────────────

export function svgCosti20Anni(costi: FvCosti20Output): string {
  const W = 700, H = 240;
  const padL = 50, padR = 20, padT = 20, padB = 50;
  const N = costi.per_anno.length;
  const max = Math.max(...costi.per_anno.map((c) => c.costo_senza_fv_eur));
  const barGroupW = (W - padL - padR) / N;
  const barW = Math.min(8, barGroupW / 2 - 1);
  const yScale = (v: number) => padT + (1 - v / max) * (H - padT - padB);

  const bars = costi.per_anno
    .map((c, i) => {
      const xCenter = padL + barGroupW / 2 + i * barGroupW;
      const x1 = xCenter - barW - 1;
      const x2 = xCenter + 1;
      const y1 = yScale(c.costo_senza_fv_eur);
      const y2 = yScale(c.costo_con_fv_eur);
      return `<rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${barW}" height="${(H - padB - y1).toFixed(1)}" rx="2" fill="${C.orange}"/><rect x="${x2.toFixed(1)}" y="${y2.toFixed(1)}" width="${barW}" height="${(H - padB - y2).toFixed(1)}" rx="2" fill="${C.green}"/>`;
    })
    .join("");

  // X labels: ogni 5 anni
  const yearStart = new Date().getFullYear();
  const xLabels = costi.per_anno
    .filter((_, i) => i === 0 || (i + 1) % 5 === 0 || i === N - 1)
    .map((c) => {
      const x = padL + barGroupW / 2 + (c.anno - 1) * barGroupW;
      return `<text x="${x.toFixed(1)}" y="${H - padB + 16}" text-anchor="middle" font-size="9" fill="${C.gray}">${yearStart + c.anno - 1}</text>`;
    })
    .join("");

  const yLabels = [600, 1200, 1800, 2400]
    .filter((v) => v <= max * 1.1)
    .map((v) => {
      const y = yScale(v);
      return `<line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C.border}" stroke-dasharray="2,3"/><text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="${C.gray}">${v}€</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">
    ${yLabels}
    ${bars}
    ${xLabels}
    <!-- Legenda -->
    <rect x="${W / 2 - 100}" y="${H - 18}" width="10" height="10" fill="${C.orange}"/>
    <text x="${W / 2 - 86}" y="${H - 9}" font-size="9" fill="${C.grayDark}">Senza impianto</text>
    <rect x="${W / 2 + 10}" y="${H - 18}" width="10" height="10" fill="${C.green}"/>
    <text x="${W / 2 + 24}" y="${H - 9}" font-size="9" fill="${C.grayDark}">Con il tuo impianto</text>
  </svg>`;
}

// ─── 5. CASSA CUMULATA 25 ANNI (line chart con breakeven) ─────────────────

export interface CassaPoint {
  anno: number;
  cumulato: number;
}

export function svgCassaCumulata(
  cassa: CassaPoint[],
  paybackAnni: number | null,
  finalEur: number,
): string {
  if (cassa.length === 0) return "";
  const W = 700, H = 240;
  const padL = 50, padR = 30, padT = 30, padB = 40;
  const minCum = Math.min(...cassa.map((c) => c.cumulato), 0);
  const maxCum = Math.max(...cassa.map((c) => c.cumulato), 0);
  const xRange = cassa[cassa.length - 1].anno;
  const xScale = (a: number) => padL + (a / xRange) * (W - padL - padR);
  const yRange = Math.max(maxCum - minCum, 1);
  const yScale = (v: number) => padT + ((maxCum - v) / yRange) * (H - padT - padB);
  const yZero = yScale(0);
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n.toFixed(0)}`);

  const linePts = cassa.map((c) => `${xScale(c.anno).toFixed(1)},${yScale(c.cumulato).toFixed(1)}`).join(" L ");
  const negPts = cassa.filter((c) => c.cumulato <= 0);
  const posPts = cassa.filter((c) => c.cumulato >= 0);

  const negArea = negPts.length > 1
    ? `M ${xScale(negPts[0].anno).toFixed(1)},${yZero.toFixed(1)} L ${negPts.map((c) => `${xScale(c.anno).toFixed(1)},${yScale(c.cumulato).toFixed(1)}`).join(" L ")} L ${xScale(negPts[negPts.length - 1].anno).toFixed(1)},${yZero.toFixed(1)} Z`
    : "";
  const posArea = posPts.length > 1
    ? `M ${xScale(posPts[0].anno).toFixed(1)},${yZero.toFixed(1)} L ${posPts.map((c) => `${xScale(c.anno).toFixed(1)},${yScale(c.cumulato).toFixed(1)}`).join(" L ")} L ${xScale(posPts[posPts.length - 1].anno).toFixed(1)},${yZero.toFixed(1)} Z`
    : "";

  const breakX = paybackAnni != null ? xScale(paybackAnni) : null;
  const finalX = xScale(xRange);
  const finalY = yScale(finalEur);

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">
    <defs>
      <linearGradient id="cassaGreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.green}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${C.green}" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    ${[0, 0.25, 0.5, 0.75, 1]
      .map((p) => {
        const y = padT + p * (H - padT - padB);
        return `<line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C.border}" stroke-dasharray="2,3"/>`;
      })
      .join("")}
    ${negArea ? `<path d="${negArea}" fill="${C.redLight}" opacity="0.6"/>` : ""}
    ${posArea ? `<path d="${posArea}" fill="url(#cassaGreen)"/>` : ""}
    <line x1="${padL}" x2="${W - padR}" y1="${yZero.toFixed(1)}" y2="${yZero.toFixed(1)}" stroke="${C.gray}" stroke-width="1.5"/>
    <path d="M ${linePts}" stroke="${C.navy}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${breakX != null ? `<line x1="${breakX.toFixed(1)}" x2="${breakX.toFixed(1)}" y1="${padT}" y2="${(H - padB).toFixed(1)}" stroke="${C.orange}" stroke-width="2" stroke-dasharray="5,3"/>
    <circle cx="${breakX.toFixed(1)}" cy="${yZero.toFixed(1)}" r="6" fill="${C.orange}" stroke="white" stroke-width="3"/>
    <g transform="translate(${(breakX + 6).toFixed(1)}, ${(padT + 5).toFixed(1)})"><rect width="100" height="32" rx="6" fill="${C.orange}"/>
    <text x="10" y="14" font-size="9" fill="white" font-weight="700">BREAKEVEN</text>
    <text x="10" y="26" font-size="9" fill="white">Anno ${paybackAnni!.toFixed(0)} · 0 €</text></g>` : ""}
    <circle cx="${finalX.toFixed(1)}" cy="${finalY.toFixed(1)}" r="6" fill="${C.green}" stroke="white" stroke-width="3"/>
    <g transform="translate(${(finalX - 80).toFixed(1)}, ${(finalY - 30).toFixed(1)})"><rect width="80" height="22" rx="4" fill="${C.green}"/>
    <text x="40" y="15" font-size="10" fill="white" font-weight="700" text-anchor="middle">+${fmt(finalEur)} €</text></g>

    <!-- Y axis labels -->
    <text x="${padL - 5}" y="${(padT + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">+${fmt(maxCum)}</text>
    <text x="${padL - 5}" y="${(yZero + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">0</text>
    <text x="${padL - 5}" y="${(H - padB + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">${fmt(minCum)}</text>
    <!-- X axis -->
    ${[0, 5, 10, 15, 20, xRange]
      .map((a) => `<text x="${xScale(a).toFixed(1)}" y="${H - padB + 16}" text-anchor="middle" font-size="9" fill="${C.gray}">${a === 0 ? "Anno 0" : a}</text>`)
      .join("")}
  </svg>`;
}

// ─── 6. FORBICE BOLLETTE +240% vs REDDITO +11.5% ───────────────────────────

export function svgForbice(): string {
  // Dati statici Codacons + ISTAT 2012-2024 normalizzati a 100
  const W = 700, H = 240;
  const padL = 50, padR = 30, padT = 30, padB = 40;
  const points = [
    { anno: 2012, bollette: 100, reddito: 100 },
    { anno: 2014, bollette: 105, reddito: 101 },
    { anno: 2016, bollette: 115, reddito: 102 },
    { anno: 2018, bollette: 130, reddito: 105 },
    { anno: 2020, bollette: 155, reddito: 107 },
    { anno: 2022, bollette: 240, reddito: 109 },
    { anno: 2024, bollette: 265, reddito: 110 },
    { anno: 2026, bollette: 285, reddito: 111.5 },
  ];
  const xRange = 2026 - 2012;
  const xScale = (a: number) => padL + ((a - 2012) / xRange) * (W - padL - padR);
  const yMax = 320;
  const yMin = 80;
  const yScale = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const linePts = (key: "bollette" | "reddito") =>
    points.map((p) => `${xScale(p.anno).toFixed(1)},${yScale(p[key]).toFixed(1)}`).join(" L ");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">
    <defs>
      <linearGradient id="forbiceGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.red}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${C.red}" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    ${[0, 0.33, 0.66, 1]
      .map((p) => {
        const y = padT + p * (H - padT - padB);
        return `<line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C.border}" stroke-dasharray="2,3"/>`;
      })
      .join("")}
    <!-- Area forbice -->
    <path d="M ${linePts("bollette")} L ${[...points].reverse().map((p) => `${xScale(p.anno).toFixed(1)},${yScale(p.reddito).toFixed(1)}`).join(" L ")} Z" fill="url(#forbiceGrad)"/>
    <!-- Linea bollette -->
    <path d="M ${linePts("bollette")}" stroke="${C.red}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="${xScale(2026).toFixed(1)}" cy="${yScale(285).toFixed(1)}" r="5" fill="${C.red}" stroke="white" stroke-width="2"/>
    <text x="${(xScale(2026) - 8).toFixed(1)}" y="${(yScale(285) - 12).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="${C.red}">+240% bollette</text>
    <!-- Linea reddito -->
    <path d="M ${linePts("reddito")}" stroke="${C.gray}" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="6,3"/>
    <circle cx="${xScale(2026).toFixed(1)}" cy="${yScale(111.5).toFixed(1)}" r="4" fill="${C.gray}" stroke="white" stroke-width="2"/>
    <text x="${(xScale(2026) - 8).toFixed(1)}" y="${(yScale(111.5) + 18).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="${C.grayDark}">+11,5% reddito</text>
    <!-- Y axis -->
    <text x="${padL - 5}" y="${(padT + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">340</text>
    <text x="${padL - 5}" y="${(yScale(200) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">200</text>
    <text x="${padL - 5}" y="${(yScale(100) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">100</text>
    <!-- X axis -->
    ${[2012, 2016, 2020, 2024]
      .map((y) => `<text x="${xScale(y).toFixed(1)}" y="${H - padB + 16}" text-anchor="middle" font-size="9" fill="${C.gray}">${y}</text>`)
      .join("")}
  </svg>`;
}

// ─── 7. RATA vs RISPARMIO (3 colonne) ──────────────────────────────────────

export function svgRataRisparmio(rata: number, risparmio: number, netto: number): string {
  const W = 600, H = 240;
  const padL = 50, padR = 20, padT = 30, padB = 40;
  const max = Math.max(rata, risparmio, netto, 100) * 1.15;
  const yScale = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const colW = 100;
  const gap = 60;
  const xStart = padL + 30;

  const bars = [
    { x: xStart, h: rata, color: "url(#barNavy)", label: "Rata mensile", valColor: C.navy, valTxt: `${rata} €` },
    { x: xStart + colW + gap, h: risparmio, color: "url(#barGreen)", label: "Risparmio", valColor: C.green, valTxt: `−${risparmio} €` },
    { x: xStart + 2 * (colW + gap), h: netto, color: "url(#barOrange)", label: "Esborso reale", valColor: C.orangeDark, valTxt: `= ${netto} €` },
  ];

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">
    <defs>
      <linearGradient id="barNavy" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${C.navy}"/><stop offset="100%" stop-color="${C.navyLight}"/></linearGradient>
      <linearGradient id="barGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${C.green}"/><stop offset="100%" stop-color="${C.greenLight}"/></linearGradient>
      <linearGradient id="barOrange" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${C.orange}"/><stop offset="100%" stop-color="${C.amber}"/></linearGradient>
    </defs>
    <line x1="${padL}" x2="${W - padR}" y1="${(H - padB).toFixed(1)}" y2="${(H - padB).toFixed(1)}" stroke="${C.gray}" stroke-width="1"/>
    ${bars
      .map((b) => {
        const y = yScale(b.h);
        const h = H - padB - y;
        return `<rect x="${b.x}" y="${y.toFixed(1)}" width="${colW}" height="${h.toFixed(1)}" rx="6" fill="${b.color}"/>
        <text x="${b.x + colW / 2}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="700" fill="${b.valColor}">${b.valTxt}</text>
        <text x="${b.x + colW / 2}" y="${H - padB + 16}" text-anchor="middle" font-size="10" fill="${C.grayDark}">${b.label}</text>`;
      })
      .join("")}
    <!-- Operatori − e = -->
    <text x="${(xStart + colW + gap / 2).toFixed(1)}" y="${(H / 2).toFixed(1)}" text-anchor="middle" font-size="20" font-weight="700" fill="${C.grayDark}">−</text>
    <text x="${(xStart + 2 * colW + gap + gap / 2).toFixed(1)}" y="${(H / 2).toFixed(1)}" text-anchor="middle" font-size="20" font-weight="700" fill="${C.grayDark}">=</text>
    <!-- Y axis labels -->
    <text x="${padL - 6}" y="${(yScale(0) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">0 €</text>
    <text x="${padL - 6}" y="${(yScale(max / 3) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">${Math.round(max / 3)} €</text>
    <text x="${padL - 6}" y="${(yScale((2 * max) / 3) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.gray}">${Math.round((2 * max) / 3)} €</text>
  </svg>`;
}

// ─── 8. PLACEHOLDER VISTA SATELLITARE (mock SVG) ───────────────────────────
// W2: sostituire con Google Maps Static API. Per ora illustrazione.

/**
 * Vista zenitale con il LAYOUT REALE dei pannelli (coordinate Google Solar API).
 * Mirror ESATTO di `proiettaLayoutInRiquadro`/`layoutToSvg` testati in
 * src/lib/fotovoltaico/layout.ts (correttezza per equivalenza al codice coperto
 * da unit test). Se non ci sono coordinate, ricade sul mock zenitale.
 *
 * DORMIENTE: attivo solo quando fv-genera-pdf passa `layout_pannelli`; finché
 * non viene popolato+deployato, il PDF mostra il mock come prima.
 */
export function svgVistaLayoutReale(
  panels: Array<{
    centro_lat: number;
    centro_lng: number;
    orientamento?: "LANDSCAPE" | "PORTRAIT";
    segment_index?: number;
  }>,
): string {
  const W = 400, H = 300;
  if (!panels || panels.length === 0) return svgVistaSatellitareMock("zenitale", 0);

  const box = { x: 55, y: 52, w: 290, h: 140 }; // area-tetto entro il poligono mock
  const panelLongM = 1.72, panelShortM = 1.13;
  const meanLat = panels.reduce((s, p) => s + p.centro_lat, 0) / panels.length;
  const mPerLng = 111320 * Math.cos((meanLat * Math.PI) / 180);

  const pts = panels.map((p) => {
    const xm = p.centro_lng * mPerLng;
    const ym = p.centro_lat * 110540;
    const land = p.orientamento !== "PORTRAIT";
    return { xm, ym, wM: land ? panelLongM : panelShortM, hM: land ? panelShortM : panelLongM, seg: p.segment_index ?? 0 };
  });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.xm - p.wM / 2); maxX = Math.max(maxX, p.xm + p.wM / 2);
    minY = Math.min(minY, p.ym - p.hM / 2); maxY = Math.max(maxY, p.ym + p.hM / 2);
  }
  const spanX = Math.max(1e-6, maxX - minX), spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const offX = box.x + (box.w - spanX * scale) / 2;
  const offY = box.y + (box.h - spanY * scale) / 2;
  const colors = ["#0F1A2E", "#1E3A5F", "#2C5184", "#F97316", "#16A34A", "#7C3AED"];

  const rects = pts
    .map((p) => {
      const cx = offX + (p.xm - minX) * scale;
      const cy = offY + (maxY - p.ym) * scale; // flip Y: nord in alto
      const w = p.wM * scale, h = p.hM * scale;
      return `<rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${colors[p.seg % colors.length]}" stroke="#1E3A5F" stroke-width="0.5"/>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect width="${W}" height="${H}" fill="#5D8A4E"/>
      <polygon points="40,200 360,200 360,290 40,290" fill="#D4D4D4" stroke="#9CA3AF"/>
      <polygon points="40,40 360,40 360,200 40,200" fill="#A0623F" stroke="#5C3A22" stroke-width="2"/>
      ${rects}
    </svg>`;
}

export function svgVistaSatellitareMock(
  view: "nord" | "zenitale" | "3d" | "panoramica",
  numPannelli: number,
): string {
  const W = 400, H = 300;
  if (view === "zenitale") {
    // Vista dall'alto, dettaglio massimo pannelli
    const cols = 4;
    const rows = Math.ceil(numPannelli / cols);
    const startX = 100, startY = 60, panelW = 44, panelH = 32, gap = 4;
    const panels: string[] = [];
    let placed = 0;
    for (let r = 0; r < rows && placed < numPannelli; r++) {
      for (let c = 0; c < cols && placed < numPannelli; c++) {
        panels.push(
          `<rect x="${startX + c * (panelW + gap)}" y="${startY + r * (panelH + gap)}" width="${panelW}" height="${panelH}" fill="#0F1A2E" stroke="#1E3A5F" stroke-width="0.5"/>`,
        );
        placed++;
      }
    }
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect width="${W}" height="${H}" fill="#5D8A4E"/>
      <polygon points="40,200 360,200 360,290 40,290" fill="#D4D4D4" stroke="#9CA3AF"/>
      <polygon points="40,40 360,40 360,200 40,200" fill="#A0623F" stroke="#5C3A22" stroke-width="2"/>
      ${panels.join("")}
    </svg>`;
  }
  if (view === "3d") {
    // Vista 3D prospettica
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect width="${W}" height="${H}" fill="#5D8A4E"/>
      <polygon points="80,200 320,200 320,260 80,260" fill="#E5E5E5" stroke="#9CA3AF"/>
      <polygon points="80,200 200,120 320,200" fill="#9C5A38" stroke="#5C3A22" stroke-width="1.5"/>
      <g transform="rotate(-30 200 160)">
        ${Array.from({ length: Math.min(8, numPannelli) }, (_, i) => {
          const c = i % 4, r = Math.floor(i / 4);
          return `<rect x="${125 + c * 27}" y="${135 + r * 22}" width="25" height="18" fill="#0F1A2E" stroke="#1E3A5F" stroke-width="0.5"/>`;
        }).join("")}
      </g>
      <rect x="120" y="220" width="20" height="28" fill="#5B7A9E"/>
      <rect x="180" y="220" width="20" height="28" fill="#5B7A9E"/>
      <rect x="240" y="220" width="20" height="28" fill="#5B7A9E"/>
      <circle cx="40" cy="220" r="20" fill="#3D6633"/>
      <circle cx="365" cy="225" r="18" fill="#3D6633"/>
    </svg>`;
  }
  if (view === "panoramica") {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <rect width="${W}" height="${H}" fill="#5D8A4E"/>
      <rect x="0" y="0" width="${W}" height="40" fill="#5A5A5A"/>
      <line x1="0" y1="20" x2="${W}" y2="20" stroke="white" stroke-width="2" stroke-dasharray="15,15"/>
      <rect x="20" y="50" width="50" height="40" fill="#A0623F"/>
      <rect x="80" y="50" width="50" height="40" fill="#8B6F4E"/>
      <rect x="280" y="50" width="50" height="40" fill="#A0623F"/>
      <rect x="340" y="50" width="50" height="40" fill="#8B6F4E"/>
      <rect x="20" y="220" width="50" height="40" fill="#A0623F"/>
      <rect x="320" y="220" width="60" height="40" fill="#8B6F4E"/>
      <rect x="155" y="120" width="100" height="80" fill="#A0623F" stroke="${C.orange}" stroke-width="3"/>
      ${Array.from({ length: Math.min(16, numPannelli) }, (_, i) => {
        const c = i % 4, r = Math.floor(i / 4);
        return `<rect x="${170 + c * 16}" y="${130 + r * 12}" width="14" height="10" fill="#0F1A2E"/>`;
      }).join("")}
      <text x="100" y="158" font-size="9" fill="${C.orangeDark}" font-weight="700" text-anchor="middle">CASA TUA</text>
      <line x1="155" y1="160" x2="115" y2="160" stroke="${C.orange}" stroke-width="2"/>
    </svg>`;
  }
  // nord (default)
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect width="${W}" height="${H}" fill="#5D8A4E"/>
    <rect x="0" y="240" width="${W}" height="60" fill="#5A5A5A"/>
    <line x1="0" y1="270" x2="${W}" y2="270" stroke="white" stroke-width="2" stroke-dasharray="15,15"/>
    <rect x="20" y="40" width="60" height="50" fill="#8B6F4E" opacity="0.7"/>
    <rect x="320" y="60" width="60" height="50" fill="#8B6F4E" opacity="0.7"/>
    <polygon points="120,160 280,160 280,230 120,230" fill="#D4D4D4" stroke="#9CA3AF"/>
    <polygon points="120,80 280,80 280,160 120,160" fill="#A0623F" stroke="#5C3A22" stroke-width="1.5"/>
    ${Array.from({ length: Math.min(16, numPannelli) }, (_, i) => {
      const c = i % 4, r = Math.floor(i / 4);
      return `<rect x="${148 + c * 22}" y="${92 + r * 16}" width="20" height="14" fill="#0F1A2E" stroke="#1E3A5F" stroke-width="0.5"/>`;
    }).join("")}
  </svg>`;
}

// ─── 9. IMMAGINI PRODOTTO (mock SVG per pannello/inverter/accumulo) ────────

export function svgProdottoIcona(tipo: "pannello" | "inverter" | "accumulo"): string {
  if (tipo === "pannello") {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="15" width="60" height="70" fill="#0F1A2E" stroke="#1E3A5F" stroke-width="2" rx="2"/>
      ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 4 }, (_, c) =>
        `<rect x="${22 + c * 14.5}" y="${17 + r * 13.5}" width="13" height="12.5" fill="#1E3A5F" stroke="#0F1A2E" stroke-width="0.3"/>`,
      ).join("")).join("")}
    </svg>`;
  }
  if (tipo === "inverter") {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="20" width="60" height="60" rx="6" fill="white" stroke="#1E3A5F" stroke-width="2"/>
      <rect x="28" y="32" width="44" height="20" rx="3" fill="#0F1A2E"/>
      <text x="50" y="46" text-anchor="middle" font-size="9" fill="${C.amber}" font-family="monospace" font-weight="700">5,8kW</text>
      <text x="50" y="55" text-anchor="middle" font-size="4" fill="${C.amber}" font-family="monospace">PRODUCING NOW</text>
      <circle cx="34" cy="68" r="2" fill="${C.green}"/>
      <circle cx="42" cy="68" r="2" fill="#cbd5e1"/>
      <circle cx="50" cy="68" r="2" fill="#cbd5e1"/>
      <text x="62" y="71" font-size="6" font-weight="700" fill="#1E3A5F">HUAWEI</text>
    </svg>`;
  }
  // accumulo
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="25" y="15" width="50" height="70" rx="4" fill="white" stroke="#1E3A5F" stroke-width="2"/>
    <text x="50" y="26" text-anchor="middle" font-size="6" font-weight="700" fill="#1E3A5F">HUAWEI</text>
    ${[0, 1, 2, 3].map((i) =>
      `<rect x="30" y="${32 + i * 11}" width="40" height="9" rx="1" fill="#F1F5F9" stroke="${C.border}"/><text x="50" y="${39 + i * 11}" text-anchor="middle" font-size="4" fill="${C.gray}">BATTERY MODULE</text>`,
    ).join("")}
    <rect x="30" y="76" width="40" height="6" rx="1" fill="${C.green}" opacity="0.3"/>
    <text x="50" y="80" text-anchor="middle" font-size="4" fill="${C.greenDark}" font-weight="700">85%</text>
  </svg>`;
}
