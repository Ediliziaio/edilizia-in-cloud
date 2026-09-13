#!/usr/bin/env node
/**
 * Disegni tecnici delle tipologie di serramento per il catalogo standard.
 *
 * Il catalogo aveva sei tipologie con l'immagine rotta (404 in produzione) e
 * mancavano le configurazioni più comuni in Italia: sopraluce, sottoluce, forme
 * speciali, scorri-ribalta, a libro, persiane. Disegnarle a mano una per una
 * avrebbe prodotto venti stili diversi; qui escono tutte dallo stesso
 * vocabolario — telaio grigio, vetro azzurro, simboli di apertura in rosso,
 * come i disegni già presenti.
 *
 * Uso:  node scripts/genera-disegni-serramenti.mjs
 * Scrive in public/templates/serramenti/ un file .svg per tipologia.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = join(dirname(fileURLToPath(import.meta.url)), "..");
const USCITA = join(RADICE, "public/templates/serramenti");

const W = 200;      // larghezza del disegno
const H = 230;      // altezza
const TELAIO = 11;  // spessore del telaio esterno
const ANTA = 7;     // spessore del profilo dell'anta

const C = {
  telaio: "#d0d2d4",
  telaioBordo: "#9aa0a6",
  vetro: "#eaf7fb",
  vetroBordo: "#b9c2c9",
  apertura: "#e4322b",
  meccanismo: "#8b9298",
};

/** Vetro di un riquadro, con il suo profilo attorno. */
function riquadro(x, y, w, h, { profilo = ANTA } = {}) {
  const vx = x + profilo, vy = y + profilo, vw = w - profilo * 2, vh = h - profilo * 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1"/>` +
    `<rect x="${vx}" y="${vy}" width="${Math.max(vw, 1)}" height="${Math.max(vh, 1)}" fill="${C.vetro}" stroke="${C.vetroBordo}" stroke-width="1"/>`;
}

const linea = (x1, y1, x2, y2, largh = 1.6) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.apertura}" stroke-width="${largh}" stroke-linecap="round"/>`;

/** Freccia: il verso in cui la parte mobile si muove. */
function freccia(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const p = 7;
  return linea(x1, y1, x2, y2) +
    linea(x2, y2, x2 - ux * p - uy * p * 0.5, y2 - uy * p + ux * p * 0.5) +
    linea(x2, y2, x2 - ux * p + uy * p * 0.5, y2 - uy * p - ux * p * 0.5);
}

/**
 * Simboli di apertura, come si leggono su un disegno di serramenti: la base del
 * triangolo sta dalla parte delle cerniere, il vertice dalla parte che si apre.
 */
function apertura(tipo, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2;
  switch (tipo) {
    case "battente_sx": // cerniere a sinistra
      return linea(x, y, x + w, cy) + linea(x, y + h, x + w, cy);
    case "battente_dx": // cerniere a destra
      return linea(x + w, y, x, cy) + linea(x + w, y + h, x, cy);
    case "ribalta": // vasistas: cerniere in basso
      return linea(x, y + h, cx, y) + linea(x + w, y + h, cx, y);
    case "anta_ribalta_sx":
      return apertura("battente_sx", x, y, w, h) + apertura("ribalta", x, y, w, h);
    case "anta_ribalta_dx":
      return apertura("battente_dx", x, y, w, h) + apertura("ribalta", x, y, w, h);
    case "scorrevole_dx": // scorre verso destra
      return freccia(cx - w * 0.26, cy, cx + w * 0.26, cy);
    case "scorrevole_sx":
      return freccia(cx + w * 0.26, cy, cx - w * 0.26, cy);
    case "libro_sx": // a soffietto: due pieghe
      return linea(x, y, x + w, cy) + linea(x, y + h, x + w, cy) + linea(x + w * 0.5, y, x + w * 0.5, y + h);
    case "fisso":
    default:
      return "";
  }
}

function svg(contenuto) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` + contenuto + `</svg>`;
}

/** Serramento rettangolare: righe orizzontali (sopraluce/sottoluce) e ante affiancate. */
function serramento({ righe }) {
  const x0 = 4, y0 = 4, w = W - 8, h = H - 8;
  let out = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.5"/>`;
  const ix = x0 + TELAIO, iy = y0 + TELAIO, iw = w - TELAIO * 2, ih = h - TELAIO * 2;
  const pesoTot = righe.reduce((s, r) => s + r.peso, 0);
  let cy = iy;
  for (const riga of righe) {
    const rh = (ih * riga.peso) / pesoTot;
    const n = riga.ante.length;
    let cx = ix;
    for (const anta of riga.ante) {
      const aw = (iw * (anta.peso ?? 1)) / riga.ante.reduce((s, a) => s + (a.peso ?? 1), 0);
      out += riquadro(cx, cy, aw, rh);
      out += apertura(anta.tipo, cx + ANTA, cy + ANTA, aw - ANTA * 2, rh - ANTA * 2);
      cx += aw;
    }
    if (n === 0) out += riquadro(ix, cy, iw, rh);
    cy += rh;
  }
  return svg(out);
}

/** Forme non rettangolari: arco, tondo, triangolo, trapezio. */
function forma(tipo) {
  const p = 6;
  let corpo = "";
  if (tipo === "arco") {
    const d = `M ${p} ${H - p} L ${p} ${H * 0.45} A ${(W - p * 2) / 2} ${H * 0.4} 0 0 1 ${W - p} ${H * 0.45} L ${W - p} ${H - p} Z`;
    corpo = `<path d="${d}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.5"/>` +
      `<path d="${`M ${p + TELAIO} ${H - p - TELAIO} L ${p + TELAIO} ${H * 0.45} A ${(W - (p + TELAIO) * 2) / 2} ${H * 0.36} 0 0 1 ${W - p - TELAIO} ${H * 0.45} L ${W - p - TELAIO} ${H - p - TELAIO} Z`}" fill="${C.vetro}" stroke="${C.vetroBordo}" stroke-width="1"/>`;
  } else if (tipo === "tondo") {
    const r = Math.min(W, H) / 2 - p;
    corpo = `<circle cx="${W / 2}" cy="${H / 2}" r="${r}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.5"/>` +
      `<circle cx="${W / 2}" cy="${H / 2}" r="${r - TELAIO}" fill="${C.vetro}" stroke="${C.vetroBordo}" stroke-width="1"/>`;
  } else if (tipo === "triangolo") {
    const d = `M ${W / 2} ${p} L ${W - p} ${H - p} L ${p} ${H - p} Z`;
    const d2 = `M ${W / 2} ${p + TELAIO * 1.9} L ${W - p - TELAIO * 1.4} ${H - p - TELAIO} L ${p + TELAIO * 1.4} ${H - p - TELAIO} Z`;
    corpo = `<path d="${d}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.5"/>` +
      `<path d="${d2}" fill="${C.vetro}" stroke="${C.vetroBordo}" stroke-width="1"/>`;
  } else if (tipo === "trapezio") {
    const d = `M ${p} ${H - p} L ${p} ${H * 0.42} L ${W - p} ${p} L ${W - p} ${H - p} Z`;
    const d2 = `M ${p + TELAIO} ${H - p - TELAIO} L ${p + TELAIO} ${H * 0.46} L ${W - p - TELAIO} ${p + TELAIO} L ${W - p - TELAIO} ${H - p - TELAIO} Z`;
    corpo = `<path d="${d}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.5"/>` +
      `<path d="${d2}" fill="${C.vetro}" stroke="${C.vetroBordo}" stroke-width="1"/>`;
  }
  return svg(corpo);
}

/** Stecche orizzontali dentro un rettangolo: il telo della tapparella. */
function telo(x, y, w, h, passo = 9) {
  let out = "";
  for (let sy = y; sy < y + h - 2; sy += passo) {
    const hs = Math.min(passo - 2, y + h - sy);
    out += `<rect x="${x}" y="${sy.toFixed(1)}" width="${w}" height="${hs.toFixed(1)}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="0.7"/>`;
  }
  return out;
}

/**
 * Tapparella: il telo copre tutto il vano, la freccia indica la discesa.
 * Il cassonetto è la stessa scena con il telo quasi tutto avvolto: quello che
 * si vende è la scatola in alto, e nel disegno deve essere lei a pesare.
 */
function tapparella({ passo = 9, soloCassonetto = false }) {
  const x0 = 6, y0 = 6, w = W - 12, h = H - 12;
  let out = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fbfbfc" stroke="${C.telaioBordo}" stroke-width="1.5"/>`;
  const altezzaCassonetto = soloCassonetto ? 58 : 24;
  out += `<rect x="${x0 + 3}" y="${y0 + 3}" width="${w - 6}" height="${altezzaCassonetto}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.2"/>`;
  if (soloCassonetto) {
    // Il rullo dentro la scatola, e solo un accenno di telo che ne esce.
    out += `<circle cx="${W / 2}" cy="${y0 + 3 + altezzaCassonetto / 2}" r="15" fill="none" stroke="${C.meccanismo}" stroke-width="1.2"/>`;
    out += `<circle cx="${W / 2}" cy="${y0 + 3 + altezzaCassonetto / 2}" r="6" fill="none" stroke="${C.meccanismo}" stroke-width="1.2"/>`;
  }
  const cy = y0 + 3 + altezzaCassonetto + 5;
  const hTelo = soloCassonetto ? 44 : h - (cy - y0) - 8;
  out += telo(x0 + 7, cy, w - 14, hTelo, passo);
  // Guide laterali: la tapparella scorre dentro di loro.
  out += `<rect x="${x0 + 3}" y="${cy}" width="4" height="${(hTelo + 2).toFixed(1)}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="0.8"/>`;
  out += `<rect x="${x0 + w - 7}" y="${cy}" width="4" height="${(hTelo + 2).toFixed(1)}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="0.8"/>`;
  out += freccia(W / 2, cy + 10, W / 2, cy + hTelo - 6);
  return svg(out);
}

/** Zanzariera: rete a trama fitta, laterale scorrevole o verticale a molla. */
function zanzariera({ laterale = false }) {
  const x0 = 6, y0 = 6, w = W - 12, h = H - 12;
  let out = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.5"/>`;
  const ix = x0 + TELAIO, iy = y0 + TELAIO, iw = w - TELAIO * 2, ih = h - TELAIO * 2;
  out += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#f7f9fa" stroke="${C.vetroBordo}" stroke-width="1"/>`;
  for (let gx = ix + 5; gx < ix + iw; gx += 5) out += `<line x1="${gx}" y1="${iy}" x2="${gx}" y2="${iy + ih}" stroke="${C.meccanismo}" stroke-width="0.35"/>`;
  for (let gy = iy + 5; gy < iy + ih; gy += 5) out += `<line x1="${ix}" y1="${gy}" x2="${ix + iw}" y2="${gy}" stroke="${C.meccanismo}" stroke-width="0.35"/>`;
  if (laterale) {
    // Cassonetto verticale a sinistra: la rete esce di lato.
    out += `<rect x="${x0}" y="${y0}" width="${TELAIO + 5}" height="${h}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.2"/>`;
    out += freccia(ix + 10, y0 + h / 2, x0 + w - TELAIO - 6, y0 + h / 2);
  } else {
    // Cassonetto orizzontale in alto: la rete scende.
    out += `<rect x="${x0}" y="${y0}" width="${w}" height="${TELAIO + 7}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.2"/>`;
    out += freccia(W / 2, iy + 14, W / 2, iy + ih - 10);
  }
  return svg(out);
}

/** Persiana / scuro a battente: stecche orizzontali dentro ogni anta. */
function persiana({ ante = 2, stecche = true }) {
  const x0 = 4, y0 = 4, w = W - 8, h = H - 8;
  let out = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.5"/>`;
  const ix = x0 + TELAIO, iy = y0 + TELAIO, iw = w - TELAIO * 2, ih = h - TELAIO * 2;
  const aw = iw / ante;
  for (let i = 0; i < ante; i++) {
    const ax = ix + i * aw;
    out += `<rect x="${ax}" y="${iy}" width="${aw}" height="${ih}" fill="#eceef0" stroke="${C.telaioBordo}" stroke-width="1"/>`;
    const px = ax + ANTA, py = iy + ANTA, pw = aw - ANTA * 2, ph = ih - ANTA * 2;
    if (stecche) {
      out += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#f6f7f8" stroke="${C.vetroBordo}" stroke-width="0.8"/>`;
      for (let sy = py + 6; sy < py + ph - 2; sy += 8) {
        out += `<line x1="${px + 3}" y1="${sy.toFixed(1)}" x2="${px + pw - 3}" y2="${sy.toFixed(1)}" stroke="${C.meccanismo}" stroke-width="1.1"/>`;
      }
    } else {
      // Lo scuro è un pannello pieno: nessuna stecca.
      out += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#e2e5e8" stroke="${C.vetroBordo}" stroke-width="0.8"/>`;
    }
    // Le ante si aprono verso l'esterno: la prima a sinistra, l'ultima a destra.
    out += apertura(i === 0 ? "battente_sx" : "battente_dx", px, py, pw, ph);
  }
  return svg(out);
}

/** Il pavimento sotto una porta: dà il verso al disegno. */
const PAVIMENTO_Y = H - 8;
const pavimento = () =>
  `<line x1="10" y1="${PAVIMENTO_Y}" x2="${W - 10}" y2="${PAVIMENTO_Y}" stroke="${C.telaioBordo}" stroke-width="1.4" stroke-linecap="round"/>`;

/** Maniglia a leva: rosetta e leva rivolta verso le cerniere. */
function manigliaPorta(x, y, levaASinistra = true) {
  const lx = levaASinistra ? x - 15 : x;
  return `<rect x="${(x - 2.2).toFixed(1)}" y="${(y - 7).toFixed(1)}" width="4.4" height="14" rx="2" fill="${C.meccanismo}"/>` +
    `<rect x="${lx.toFixed(1)}" y="${(y - 1.9).toFixed(1)}" width="15" height="3.8" rx="1.9" fill="${C.meccanismo}"/>`;
}

/** Il cilindro della serratura, sotto la maniglia. */
const cilindro = (x, y) =>
  `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="none" stroke="${C.meccanismo}" stroke-width="1.3"/>` +
  `<rect x="${(x - 0.8).toFixed(1)}" y="${y.toFixed(1)}" width="1.6" height="5" fill="${C.meccanismo}"/>`;

/**
 * Porta blindata: telaio in acciaio più spesso di quello di un serramento,
 * pannello pieno con una bugna, spioncino, maniglia e cilindro. La classe 4 si
 * riconosce dai deviatori, i catenacci in più sul lato cerniere, in alto e in
 * basso. A due ante: anta principale e anta semifissa più stretta.
 */
function portaBlindata({ ante = 1, classe = 3 }) {
  const largh = ante === 1 ? 116 : 156;
  const x0 = (W - largh) / 2, y0 = 6;
  const T = classe >= 4 ? 15 : 12;
  let out = pavimento();
  out += `<rect x="${x0}" y="${y0}" width="${largh}" height="${PAVIMENTO_Y - y0}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.5"/>`;
  const ix = x0 + T, iy = y0 + T, iw = largh - T * 2, ih = PAVIMENTO_Y - iy - 2;
  const parti = ante === 1
    ? [{ w: iw, principale: true }]
    : [{ w: iw * 0.62, principale: true }, { w: iw * 0.38, principale: false }];
  let ax = ix;
  for (const parte of parti) {
    out += `<rect x="${ax.toFixed(1)}" y="${iy}" width="${parte.w.toFixed(1)}" height="${ih}" fill="#e1e4e7" stroke="${C.telaioBordo}" stroke-width="1"/>`;
    out += `<rect x="${(ax + 9).toFixed(1)}" y="${iy + 14}" width="${(parte.w - 18).toFixed(1)}" height="${ih - 28}" fill="none" stroke="${C.vetroBordo}" stroke-width="1"/>`;
    if (parte.principale) {
      out += apertura("battente_sx", ax + 5, iy + 5, parte.w - 10, ih - 10);
      const mx = ax + parte.w - 11, my = iy + ih * 0.53;
      out += manigliaPorta(mx, my, true) + cilindro(mx, my + 15);
      out += `<circle cx="${(ax + parte.w / 2).toFixed(1)}" cy="${iy + 30}" r="2.6" fill="${C.meccanismo}"/>`;
      if (classe >= 4) {
        for (const y of [iy + 26, iy + ih * 0.5, iy + ih - 26]) {
          out += `<rect x="${(ax - 3).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="6" height="12" fill="${C.meccanismo}"/>`;
        }
        out += `<rect x="${(ax + parte.w / 2 - 7).toFixed(1)}" y="${iy - 3}" width="14" height="6" fill="${C.meccanismo}"/>`;
        out += `<rect x="${(ax + parte.w / 2 - 7).toFixed(1)}" y="${iy + ih - 3}" width="14" height="6" fill="${C.meccanismo}"/>`;
      }
    } else {
      // Semifissa: chiavistelli in alto e in basso, nessuna apertura.
      out += `<rect x="${(ax + parte.w / 2 - 2).toFixed(1)}" y="${iy + 4}" width="4" height="16" fill="${C.meccanismo}"/>`;
      out += `<rect x="${(ax + parte.w / 2 - 2).toFixed(1)}" y="${iy + ih - 20}" width="4" height="16" fill="${C.meccanismo}"/>`;
    }
    ax += parte.w;
  }
  return svg(out);
}

/**
 * Porta da interno in una luce 80×210. Quello che si vende è il modo in cui si
 * apre: a battente, dentro il muro, sul muro, a soffietto. Nel disegno deve
 * leggersi a colpo d'occhio.
 */
function portaInterna(tipo) {
  const ANTA_FILL = "#f5f6f7";
  let out = pavimento();
  if (tipo === "battente" || tipo === "soffietto") {
    const largh = 104, x0 = (W - largh) / 2, y0 = 8, T = 7;
    out += `<rect x="${x0}" y="${y0}" width="${largh}" height="${PAVIMENTO_Y - y0}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.4"/>`;
    const ix = x0 + T, iy = y0 + T, iw = largh - T * 2, ih = PAVIMENTO_Y - iy - 2;
    if (tipo === "battente") {
      out += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="${ANTA_FILL}" stroke="${C.telaioBordo}" stroke-width="1"/>`;
      out += apertura("battente_sx", ix + 5, iy + 5, iw - 10, ih - 10);
      const mx = ix + iw - 10, my = iy + ih * 0.53;
      out += manigliaPorta(mx, my, true);
      out += `<rect x="${(mx - 1).toFixed(1)}" y="${(my + 11).toFixed(1)}" width="2" height="5" rx="1" fill="${C.meccanismo}"/>`;
    } else {
      // Quattro pannelli che si piegano a coppie.
      const pw = iw / 4;
      for (let i = 0; i < 4; i++) {
        out += `<rect x="${(ix + i * pw).toFixed(1)}" y="${iy}" width="${pw.toFixed(1)}" height="${ih}" fill="${ANTA_FILL}" stroke="${C.telaioBordo}" stroke-width="1"/>`;
      }
      out += apertura("battente_sx", ix + 4, iy + 6, pw * 2 - 8, ih - 12);
      out += apertura("battente_sx", ix + pw * 2 + 4, iy + 6, pw * 2 - 8, ih - 12);
      out += `<circle cx="${(ix + iw - 6).toFixed(1)}" cy="${(iy + ih * 0.53).toFixed(1)}" r="3" fill="${C.meccanismo}"/>`;
    }
  } else if (tipo === "scomparsa") {
    // A sinistra il muro con la tasca: l'anta è per metà già dentro.
    const muroX = 18, luceX = 104, luceW = 80, y0 = 8;
    out += `<rect x="${luceX}" y="${y0}" width="${luceW}" height="${PAVIMENTO_Y - y0}" fill="#fbfbfc" stroke="${C.telaioBordo}" stroke-width="1.4"/>`;
    out += `<rect x="${luceX - 36}" y="${y0 + 7}" width="${luceW}" height="${PAVIMENTO_Y - y0 - 9}" fill="${ANTA_FILL}" stroke="${C.telaioBordo}" stroke-width="1"/>`;
    const muroW = luceX - muroX, muroH = PAVIMENTO_Y - y0;
    out += `<defs><clipPath id="muro-tasca"><rect x="${muroX}" y="${y0}" width="${muroW}" height="${muroH}"/></clipPath></defs>`;
    out += `<rect x="${muroX}" y="${y0}" width="${muroW}" height="${muroH}" fill="#e9ecef" fill-opacity="0.92"/>`;
    out += `<g clip-path="url(#muro-tasca)">`;
    for (let x = muroX - muroH; x < muroX + muroW; x += 12) {
      out += `<line x1="${x}" y1="${PAVIMENTO_Y}" x2="${x + muroH * 0.35}" y2="${y0}" stroke="${C.vetroBordo}" stroke-width="0.6"/>`;
    }
    out += `</g><rect x="${muroX}" y="${y0}" width="${muroW}" height="${muroH}" fill="none" stroke="${C.telaioBordo}" stroke-width="1.2"/>`;
    out += `<rect x="${luceX - 36}" y="${y0 + 7}" width="36" height="${PAVIMENTO_Y - y0 - 9}" fill="none" stroke="${C.meccanismo}" stroke-width="1" stroke-dasharray="4 3"/>`;
    out += `<rect x="${luceX + luceW - 44}" y="${(H / 2 - 12).toFixed(1)}" width="4" height="24" rx="2" fill="${C.meccanismo}"/>`;
    out += freccia(luceX + 30, H / 2, luceX - 8, H / 2);
  } else if (tipo === "esterno_muro") {
    // Il binario a vista sul muro: l'anta scorre accanto alla luce e la copre.
    const luceX = 96, luceW = 80, y0 = 24;
    out += `<rect x="${luceX}" y="${y0}" width="${luceW}" height="${PAVIMENTO_Y - y0}" fill="#fbfbfc" stroke="${C.telaioBordo}" stroke-width="1.2" stroke-dasharray="5 3"/>`;
    out += `<rect x="16" y="12" width="${W - 32}" height="6" rx="2" fill="${C.meccanismo}"/>`;
    const antaX = 22, antaW = 84;
    out += `<rect x="${antaX}" y="${y0}" width="${antaW}" height="${PAVIMENTO_Y - y0 - 2}" fill="${ANTA_FILL}" stroke="${C.telaioBordo}" stroke-width="1.2"/>`;
    for (const cx of [antaX + 16, antaX + antaW - 16]) {
      out += `<line x1="${cx}" y1="18" x2="${cx}" y2="${y0}" stroke="${C.meccanismo}" stroke-width="1.4"/>`;
      out += `<circle cx="${cx}" cy="18" r="3.4" fill="#ffffff" stroke="${C.meccanismo}" stroke-width="1.3"/>`;
    }
    out += `<rect x="${antaX + antaW - 12}" y="${(H / 2 - 16).toFixed(1)}" width="4" height="32" rx="2" fill="${C.meccanismo}"/>`;
    out += freccia(antaX + 22, H / 2 + 34, antaX + antaW + 30, H / 2 + 34);
  }
  return svg(out);
}

const F = (tipo, peso = 1) => ({ tipo, peso });

/** Il catalogo: nome file → disegno. */
const DISEGNI = {
  // --- le sei che erano rotte in produzione
  "products/tapparella-pvc": tapparella({ passo: 8 }),
  "products/tapparella-alluminio": tapparella({ passo: 11 }),
  "products/zanzariera-molla-classica": zanzariera({ laterale: false }),
  "products/zanzariera-laterale": zanzariera({ laterale: true }),
  "products/cassonetto-pvc-isolato": tapparella({ passo: 9, soloCassonetto: true }),
  "products/cassonetto-effetto-legno": tapparella({ passo: 9, soloCassonetto: true }),

  // --- sopraluce e sottoluce: le configurazioni più comuni che mancavano
  "finestra-1-anta-sopraluce": serramento({ righe: [{ peso: 0.3, ante: [F("fisso")] }, { peso: 1, ante: [F("anta_ribalta_dx")] }] }),
  "finestra-1-anta-sottoluce": serramento({ righe: [{ peso: 1, ante: [F("anta_ribalta_dx")] }, { peso: 0.3, ante: [F("fisso")] }] }),
  "finestra-2-ante-sopraluce": serramento({ righe: [{ peso: 0.3, ante: [F("fisso")] }, { peso: 1, ante: [F("battente_sx"), F("anta_ribalta_dx")] }] }),
  "finestra-2-ante-sottoluce": serramento({ righe: [{ peso: 1, ante: [F("battente_sx"), F("anta_ribalta_dx")] }, { peso: 0.3, ante: [F("fisso")] }] }),
  "finestra-2-ante-sopraluce-due-sezioni": serramento({ righe: [{ peso: 0.3, ante: [F("fisso"), F("fisso")] }, { peso: 1, ante: [F("battente_sx"), F("anta_ribalta_dx")] }] }),
  "finestra-3-ante-sopraluce": serramento({ righe: [{ peso: 0.3, ante: [F("fisso")] }, { peso: 1, ante: [F("battente_sx"), F("fisso"), F("anta_ribalta_dx")] }] }),
  "portafinestra-2-ante-sopraluce": serramento({ righe: [{ peso: 0.22, ante: [F("fisso")] }, { peso: 1, ante: [F("battente_sx"), F("anta_ribalta_dx")] }] }),

  // --- forme speciali
  "finestra-arco": forma("arco"),
  "finestra-tonda": forma("tondo"),
  "finestra-triangolare": forma("triangolo"),
  "finestra-trapezoidale": forma("trapezio"),

  // --- aperture che mancavano
  "scorri-ribalta-patio": serramento({ righe: [{ peso: 1, ante: [F("fisso"), F("scorrevole_sx")] }] }),
  "portafinestra-a-libro-3-ante": serramento({ righe: [{ peso: 1, ante: [F("libro_sx"), F("libro_sx"), F("battente_dx")] }] }),
  "portafinestra-a-libro-4-ante": serramento({ righe: [{ peso: 1, ante: [F("libro_sx"), F("libro_sx"), F("libro_sx"), F("battente_dx")] }] }),
  "finestra-scorrevole-2-ante": serramento({ righe: [{ peso: 1, ante: [F("scorrevole_dx"), F("scorrevole_sx")] }] }),

  // --- oscuranti a battente
  "persiana-1-anta": persiana({ ante: 1 }),
  "persiana-2-ante": persiana({ ante: 2 }),
  "scuro-2-ante": persiana({ ante: 2, stecche: false }),

  // --- porte: blindate e da interno (tipologie standard dell'area serramenti)
  "products/porta-blindata-classe-3": portaBlindata({ ante: 1, classe: 3 }),
  "products/porta-blindata-classe-4": portaBlindata({ ante: 1, classe: 4 }),
  "products/porta-blindata-2-ante": portaBlindata({ ante: 2, classe: 3 }),
  "products/porta-interna-battente": portaInterna("battente"),
  "products/porta-interna-scorrevole-scomparsa": portaInterna("scomparsa"),
  "products/porta-interna-scorrevole-esterno-muro": portaInterna("esterno_muro"),
  "products/porta-interna-soffietto": portaInterna("soffietto"),
};

// ─── Persiane: tutte le configurazioni ─────────────────────────────────────
//
// Le configurazioni della «Libreria icone persiane»: vista interna, simboli di
// apertura in rosso con la stessa regola dei serramenti (base dalla parte delle
// cerniere, vertice dalla parte che si apre): «DX» si apre verso destra. Ogni
// disegno ha la tela ritagliata su misura, così nel listino e nel PDF si vede
// intero e senza bianco attorno.

const f1 = (v) => v.toFixed(1);
const pt = (x, y) => `${f1(x)},${f1(y)}`;

const PERSIANA = {
  telaio: 7,     // telaio fisso attorno alle ante
  profilo: 5,    // profilo dell'anta
  margine: 5,    // bianco attorno al disegno
  passo: 7,      // distanza tra le stecche
  anta: "#eceef0",
  pannello: "#f6f7f8",
  luce: "#fbfbfc",
};

function tela(larghezza, altezza, contenuto) {
  const w = Math.ceil(larghezza), h = Math.ceil(altezza);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">` +
    `<rect width="${w}" height="${h}" fill="#ffffff"/>` + contenuto + `</svg>`;
}

function rett(x, y, w, h, fill, { bordo = C.telaioBordo, spessore = 1, extra = "" } = {}) {
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}" stroke="${bordo}" stroke-width="${spessore}"${extra}/>`;
}

/** Le stecche orizzontali dentro il pannello di un'anta. */
function stecchePersiana(x, y, w, h) {
  let out = "";
  for (let sy = y + PERSIANA.passo * 0.75; sy < y + h - 2; sy += PERSIANA.passo) {
    out += `<line x1="${f1(x + 2.5)}" y1="${f1(sy)}" x2="${f1(x + w - 2.5)}" y2="${f1(sy)}" stroke="${C.meccanismo}" stroke-width="1"/>`;
  }
  return out;
}

/** Due cardini sul bordo verticale di un'anta. */
function cardini(x, y, h) {
  return [0.16, 0.84]
    .map((t) => rett(x - 1.8, y + h * t - 5, 3.6, 10, C.meccanismo, { bordo: C.meccanismo, spessore: 0.5 }))
    .join("");
}

/**
 * Un'anta: profilo, pannello a stecche e simbolo di apertura.
 * apre: "dx" (vertice a destra), "sx", oppure null per un pannello fermo.
 */
function antaPersiana(x, y, w, h, { apre = null, vetro = false } = {}) {
  const P = PERSIANA.profilo;
  const px = x + P, py = y + P, pw = w - P * 2, ph = h - P * 2;
  let out = rett(x, y, w, h, PERSIANA.anta);
  out += vetro
    ? rett(px, py, pw, ph, C.vetro, { bordo: C.vetroBordo, spessore: 0.8 })
    : rett(px, py, pw, ph, PERSIANA.pannello, { bordo: C.vetroBordo, spessore: 0.8 }) + stecchePersiana(px, py, pw, ph);
  if (apre === "dx") out += apertura("battente_sx", px, py, pw, ph);
  if (apre === "sx") out += apertura("battente_dx", px, py, pw, ph);
  return out;
}

/** Il telaio fisso attorno alle ante: restituisce il vano interno e la tela su misura. */
function telaioPersiana(larghezza, altezza) {
  const M = PERSIANA.margine, T = PERSIANA.telaio;
  return {
    out: rett(M, M, larghezza, altezza, C.telaio, { spessore: 1.4 }),
    x: M + T, y: M + T, w: larghezza - T * 2, h: altezza - T * 2,
    chiudi: (contenuto) => tela(larghezza + M * 2, altezza + M * 2, contenuto),
  };
}

const A = (apre, peso = 1) => ({ apre, peso });

/**
 * A battente: le ante una accanto all'altra, i cardini dalla parte opposta al
 * vertice. montanteDopo mette un montante fisso dopo quell'anta: la 4 ante
 * fatta di due coppie.
 */
function persianaBattente({ larghezza, altezza, ante, montanteDopo = null }) {
  const vano = telaioPersiana(larghezza, altezza);
  let out = vano.out;
  const montante = montanteDopo === null ? 0 : 6;
  const pesoTot = ante.reduce((s, a) => s + a.peso, 0);
  let ax = vano.x;
  ante.forEach((a, i) => {
    const aw = ((vano.w - montante) * a.peso) / pesoTot;
    out += antaPersiana(ax, vano.y, aw, vano.h, { apre: a.apre });
    if (a.apre === "dx") out += cardini(ax, vano.y, vano.h);
    if (a.apre === "sx") out += cardini(ax + aw, vano.y, vano.h);
    ax += aw;
    if (montanteDopo === i) {
      out += rett(ax, vano.y, montante, vano.h, C.telaio);
      ax += montante;
    }
  });
  return vano.chiudi(out);
}

/**
 * A libro: ante incernierate tra loro che si piegano a fisarmonica. gruppi dice
 * quante ante vanno a sinistra e quante a destra: [3] tutte a sinistra, [2, 2]
 * due per lato. I cardini stanno sullo stipite e tra le ante dello stesso gruppo.
 */
function persianaLibro({ larghezza, altezza, gruppi }) {
  const vano = telaioPersiana(larghezza, altezza);
  let out = vano.out;
  const aw = vano.w / gruppi.reduce((s, g) => s + g, 0);
  let inizio = 0;
  gruppi.forEach((quante, g) => {
    const aDestra = g === 1;
    for (let k = 0; k < quante; k++) {
      const pari = (aDestra ? quante - 1 - k : k) % 2 === 0;
      const apre = aDestra ? (pari ? "sx" : "dx") : (pari ? "dx" : "sx");
      out += antaPersiana(vano.x + (inizio + k) * aw, vano.y, aw, vano.h, { apre });
    }
    out += cardini(vano.x + (aDestra ? inizio + quante : inizio) * aw, vano.y, vano.h);
    for (let k = 1; k < quante; k++) out += cardini(vano.x + (inizio + k) * aw, vano.y, vano.h);
    inizio += quante;
  });
  return vano.chiudi(out);
}

/**
 * A pacchetto: le ante si ripiegano una sull'altra e si raccolgono da un lato.
 * Il disegno le mostra già raccolte da quel lato, con il tratteggio di dove
 * arrivano da chiuse e la freccia verso il pacchetto.
 */
function persianaPacchetto({ larghezza, altezza, ante, verso }) {
  const vano = telaioPersiana(larghezza, altezza);
  let out = vano.out + rett(vano.x, vano.y, vano.w, vano.h, PERSIANA.luce, { bordo: C.vetroBordo, spessore: 0.8 });
  const aw = vano.w / ante;
  for (let i = 1; i < ante; i++) {
    const x = vano.x + i * aw;
    out += `<line x1="${f1(x)}" y1="${f1(vano.y + 4)}" x2="${f1(x)}" y2="${f1(vano.y + vano.h - 4)}" stroke="${C.vetroBordo}" stroke-width="0.9" stroke-dasharray="4 3"/>`;
  }
  const spessore = 10;
  const pacco = ante * spessore;
  const px = verso === "dx" ? vano.x + vano.w - pacco : vano.x;
  for (let i = 0; i < ante; i++) {
    const sx = px + i * spessore;
    out += rett(sx, vano.y, spessore, vano.h, PERSIANA.anta, { spessore: 0.9 });
    for (let sy = vano.y + 5; sy < vano.y + vano.h - 4; sy += PERSIANA.passo) {
      out += `<line x1="${f1(sx + 2)}" y1="${f1(sy)}" x2="${f1(sx + spessore - 2)}" y2="${f1(sy + 2.2)}" stroke="${C.meccanismo}" stroke-width="0.8"/>`;
    }
  }
  out += cardini(verso === "dx" ? vano.x + vano.w : vano.x, vano.y, vano.h);
  const cy = vano.y + vano.h / 2;
  out += verso === "dx"
    ? freccia(vano.x + vano.w * 0.22, cy, px - 8, cy)
    : freccia(vano.x + vano.w * 0.78, cy, px + pacco + 8, cy);
  return vano.chiudi(out);
}

/**
 * Scorrevole: le ante corrono su una guida in alto che prosegue oltre la luce
 * del muro (tratteggiata), dove l'anta va a parcheggiarsi quando si apre.
 */
function persianaScorrevole(tipo) {
  const M = PERSIANA.margine, altezza = 178, guida = 7;
  const dueAnte = tipo === "2-ante" || tipo === "2-ante-sovrapposte";
  const luceW = dueAnte ? 168 : 108;
  const oltreSx = tipo === "1-anta-sx" ? luceW * 0.7 : tipo === "2-ante" ? luceW * 0.4 : 0;
  const oltreDx = tipo === "1-anta-dx" || tipo === "2-ante-sovrapposte" ? luceW * 0.7 : tipo === "2-ante" ? luceW * 0.4 : 0;
  const larghezza = oltreSx + luceW + oltreDx;
  const luceX = M + oltreSx, y0 = M + guida + 3, hAnta = altezza - guida - 6;
  let out = rett(M, M, larghezza, guida, C.telaio, { spessore: 1.2 });
  out += rett(luceX, y0, luceW, altezza - guida - 3, PERSIANA.luce, { spessore: 1, extra: ` stroke-dasharray="5 3"` });
  const carrelli = (x, w) => [x + 12, x + w - 12]
    .map((cx) => `<circle cx="${f1(cx)}" cy="${f1(M + guida)}" r="3" fill="#ffffff" stroke="${C.meccanismo}" stroke-width="1.1"/>`)
    .join("");
  const cy = y0 + 2 + hAnta / 2;
  if (tipo === "1-anta-dx" || tipo === "1-anta-sx") {
    out += antaPersiana(luceX, y0 + 2, luceW, hAnta) + carrelli(luceX, luceW);
    out += tipo === "1-anta-dx"
      ? freccia(luceX + luceW * 0.28, cy, luceX + luceW * 0.72, cy)
      : freccia(luceX + luceW * 0.72, cy, luceX + luceW * 0.28, cy);
  } else if (tipo === "2-ante") {
    const aw = luceW / 2;
    out += antaPersiana(luceX, y0 + 2, aw, hAnta) + antaPersiana(luceX + aw, y0 + 2, aw, hAnta);
    out += carrelli(luceX, aw) + carrelli(luceX + aw, aw);
    out += freccia(luceX + aw * 0.75, cy, luceX + aw * 0.25, cy) + freccia(luceX + aw * 1.25, cy, luceX + aw * 1.75, cy);
  } else {
    // Sovrapposte: due binari, l'anta dietro sfalsata scorre sotto quella davanti.
    const aw = luceW * 0.58;
    out += `<line x1="${f1(M + 2)}" y1="${f1(M + guida / 2)}" x2="${f1(M + larghezza - 2)}" y2="${f1(M + guida / 2)}" stroke="${C.telaioBordo}" stroke-width="0.8"/>`;
    out += antaPersiana(luceX + luceW - aw, y0 + 2, aw, hAnta) + carrelli(luceX + luceW - aw, aw);
    out += rett(luceX + luceW - aw, y0 + 2, aw, hAnta, "#ffffff", { bordo: "none", spessore: 0, extra: ` fill-opacity="0.35"` });
    out += antaPersiana(luceX, y0 + 2, aw, hAnta) + carrelli(luceX, aw);
    out += freccia(luceX + luceW * 0.2, cy, luceX + luceW * 0.8, cy);
  }
  return tela(larghezza + M * 2, altezza + M * 2, out);
}

/** Con sopraluce, con pannello fisso superiore o laterale. */
function persianaConPannello(tipo) {
  if (tipo === "laterale") {
    const vano = telaioPersiana(152, 178);
    const montante = 5, fissoW = vano.w * 0.36, antaW = vano.w - fissoW - montante;
    let out = vano.out;
    out += antaPersiana(vano.x, vano.y, antaW, vano.h, { apre: "dx" }) + cardini(vano.x, vano.y, vano.h);
    out += rett(vano.x + antaW, vano.y, montante, vano.h, C.telaio);
    out += antaPersiana(vano.x + antaW + montante, vano.y, fissoW, vano.h);
    return vano.chiudi(out);
  }
  const vano = telaioPersiana(134, 198);
  const hSopra = vano.h * 0.24, traverso = 5;
  let out = vano.out;
  out += tipo === "sopraluce"
    ? rett(vano.x, vano.y, vano.w, hSopra, C.vetro, { bordo: C.vetroBordo })
    : antaPersiana(vano.x, vano.y, vano.w, hSopra);
  out += rett(vano.x, vano.y + hSopra, vano.w, traverso, C.telaio);
  const yA = vano.y + hSopra + traverso, hA = vano.h - hSopra - traverso, aw = vano.w / 2;
  out += antaPersiana(vano.x, yA, aw, hA, { apre: "dx" }) + cardini(vano.x, yA, hA);
  out += antaPersiana(vano.x + aw, yA, aw, hA, { apre: "sx" }) + cardini(vano.x + vano.w, yA, hA);
  return vano.chiudi(out);
}

/**
 * Anta sull'altro muro dell'angolo, vista di scorcio: i bordi verticali restano
 * verticali, sopra e sotto convergono verso il fondo. Cardini sul bordo in
 * fondo, vertice del simbolo verso l'angolo.
 */
function antaScorcio(x, y, w, h, rientro) {
  const P = PERSIANA.profilo;
  const yf = (t) => y + rientro + (h - rientro * 2) * t; // bordo in fondo
  const yv = (t) => y + h * t;                           // bordo sull'angolo
  let out = `<polygon points="${[pt(x, y), pt(x + w, y + rientro), pt(x + w, y + h - rientro), pt(x, y + h)].join(" ")}" fill="${PERSIANA.anta}" stroke="${C.telaioBordo}" stroke-width="1"/>`;
  const tIn = P / h;
  out += `<polygon points="${[pt(x + P, yv(tIn)), pt(x + w - P * 0.7, yf(tIn)), pt(x + w - P * 0.7, yf(1 - tIn)), pt(x + P, yv(1 - tIn))].join(" ")}" fill="${PERSIANA.pannello}" stroke="${C.vetroBordo}" stroke-width="0.8"/>`;
  const passi = Math.floor((h - P * 2) / PERSIANA.passo);
  for (let s = 1; s < passi; s++) {
    const t = tIn + (1 - tIn * 2) * (s / passi);
    out += `<line x1="${f1(x + P + 2)}" y1="${f1(yv(t))}" x2="${f1(x + w - P * 0.7 - 2)}" y2="${f1(yf(t))}" stroke="${C.meccanismo}" stroke-width="1"/>`;
  }
  out += linea(x + w - P, yf(tIn), x + P, yv(0.5)) + linea(x + w - P, yf(1 - tIn), x + P, yv(0.5));
  out += [0.16, 0.84].map((t) => rett(x + w - 1.8, yf(t) - 5, 3.6, 10, C.meccanismo, { bordo: C.meccanismo, spessore: 0.5 })).join("");
  return out;
}

/** Ad angolo: una parte sul muro di fronte, l'ultima anta di scorcio sull'altro muro. */
function persianaAngolo(ante) {
  const M = PERSIANA.margine, T = PERSIANA.telaio, h = 178, palo = 7, rientro = 16;
  const frontW = ante === 3 ? 136 : 80, scorcioW = 60;
  let out = rett(M, M, frontW + T * 2, h, C.telaio, { spessore: 1.4 });
  const fx = M + T, fy = M + T, fh = h - T * 2;
  if (ante === 3) {
    const aw = frontW / 2;
    out += antaPersiana(fx, fy, aw, fh, { apre: "dx" }) + cardini(fx, fy, fh);
    out += antaPersiana(fx + aw, fy, aw, fh, { apre: "sx" }) + cardini(fx + frontW, fy, fh);
  } else {
    out += antaPersiana(fx, fy, frontW, fh, { apre: "dx" }) + cardini(fx, fy, fh);
  }
  const ax = M + frontW + T * 2;
  out += rett(ax, M, palo, h, C.telaio, { spessore: 1.2 });
  const sx = ax + palo;
  out += `<polygon points="${[pt(sx, M), pt(sx + scorcioW, M + rientro), pt(sx + scorcioW, M + h - rientro), pt(sx, M + h)].join(" ")}" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1.4"/>`;
  out += antaScorcio(sx, M + T, scorcioW - T * 0.8, h - T * 2, rientro * 0.8);
  return tela(sx + scorcioW + M, h + M * 2, out);
}

/** Le lamelle in sezione, per la scheda della linea: fisse inclinate, oppure orientabili con l'asta di manovra. */
function lamelle({ orientabili }) {
  const w = 184, h = 150, cx = w / 2;
  let out = rett(8, 6, 12, h - 12, C.telaio, { spessore: 1.2 }) + rett(w - 20, 6, 12, h - 12, C.telaio, { spessore: 1.2 });
  const angolo = orientabili ? -16 : -38;
  const rad = (angolo * Math.PI) / 180;
  const punte = [];
  // Nelle orientabili una lamella in meno: sotto c'è la freccia della rotazione.
  for (let i = 0; i < (orientabili ? 5 : 6); i++) {
    const cy = 22 + i * 21.5;
    out += `<rect x="${f1(cx - 56)}" y="${f1(cy - 3.5)}" width="112" height="7" rx="2.5" fill="${C.telaio}" stroke="${C.telaioBordo}" stroke-width="1" transform="rotate(${angolo} ${f1(cx)} ${f1(cy)})"/>`;
    if (orientabili) {
      out += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="2.4" fill="${C.meccanismo}"/>`;
      punte.push([cx + 44 * Math.cos(rad), cy + 44 * Math.sin(rad)]);
    }
  }
  if (orientabili) {
    // L'asta muove tutte le lamelle insieme: la freccia curva dice che ruotano.
    const ultima = punte[punte.length - 1];
    out += `<line x1="${f1(punte[0][0])}" y1="${f1(punte[0][1])}" x2="${f1(ultima[0])}" y2="${f1(ultima[1])}" stroke="${C.meccanismo}" stroke-width="2"/>`;
    for (const [px, py] of punte) out += `<circle cx="${f1(px)}" cy="${f1(py)}" r="1.8" fill="#ffffff" stroke="${C.meccanismo}" stroke-width="1"/>`;
    out += `<path d="M ${f1(cx - 30)} ${f1(h - 22)} A 30 14 0 0 0 ${f1(cx + 30)} ${f1(h - 22)}" fill="none" stroke="${C.apertura}" stroke-width="1.6" stroke-linecap="round"/>`;
    out += linea(cx + 30, h - 22, cx + 22, h - 26) + linea(cx + 30, h - 22, cx + 29, h - 31);
  }
  return tela(w, h, out);
}

// Le misure a disegno: la finestra è più bassa della portafinestra, e ogni anta
// in più allarga la tela invece di stringere le ante.
const LARGHEZZA_FINESTRA = { 1: 72, 2: 132, 3: 186, 4: 244 };
const LARGHEZZA_PORTAFINESTRA = { 1: 86, 2: 150, 3: 210, 4: 268 };

const CONFIGURAZIONI_BATTENTE = [
  ["1-anta-dx", [A("dx")]],
  ["1-anta-sx", [A("sx")]],
  ["2-ante", [A("dx"), A("sx")]],
  ["2-ante-asimmetriche-principale-sx", [A("dx", 1.6), A("sx")]],
  ["2-ante-asimmetriche-principale-dx", [A("dx"), A("sx", 1.6)]],
  ["3-ante-2-1-sx", [A("dx"), A("dx"), A("sx")]],
  ["3-ante-1-2-dx", [A("dx"), A("sx"), A("sx")]],
  ["3-ante", [A("dx"), A(null), A("sx")]],
  ["4-ante-2-2", [A("dx"), A("dx"), A("sx"), A("sx")]],
  ["4-ante", [A("dx"), A("sx"), A("dx"), A("sx")], { montanteDopo: 1 }],
];

for (const [chiave, ante, opzioni = {}] of CONFIGURAZIONI_BATTENTE) {
  DISEGNI[`products/persiana-finestra-${chiave}`] = persianaBattente({ larghezza: LARGHEZZA_FINESTRA[ante.length], altezza: 150, ante, ...opzioni });
  DISEGNI[`products/persiana-portafinestra-${chiave}`] = persianaBattente({ larghezza: LARGHEZZA_PORTAFINESTRA[ante.length], altezza: 232, ante, ...opzioni });
}
Object.assign(DISEGNI, {
  "products/persiana-libro-2-ante": persianaLibro({ larghezza: 132, altezza: 196, gruppi: [2] }),
  "products/persiana-libro-3-ante": persianaLibro({ larghezza: 186, altezza: 196, gruppi: [3] }),
  "products/persiana-libro-4-ante": persianaLibro({ larghezza: 244, altezza: 196, gruppi: [2, 2] }),
  "products/persiana-pacchetto-3-ante-dx": persianaPacchetto({ larghezza: 186, altezza: 196, ante: 3, verso: "dx" }),
  "products/persiana-pacchetto-3-ante-sx": persianaPacchetto({ larghezza: 186, altezza: 196, ante: 3, verso: "sx" }),
  "products/persiana-pacchetto-4-ante-dx": persianaPacchetto({ larghezza: 244, altezza: 196, ante: 4, verso: "dx" }),
  "products/persiana-pacchetto-4-ante-sx": persianaPacchetto({ larghezza: 244, altezza: 196, ante: 4, verso: "sx" }),
  "products/persiana-scorrevole-1-anta-dx": persianaScorrevole("1-anta-dx"),
  "products/persiana-scorrevole-1-anta-sx": persianaScorrevole("1-anta-sx"),
  "products/persiana-scorrevole-2-ante": persianaScorrevole("2-ante"),
  "products/persiana-scorrevole-2-ante-sovrapposte": persianaScorrevole("2-ante-sovrapposte"),
  "products/persiana-con-sopraluce": persianaConPannello("sopraluce"),
  "products/persiana-pannello-fisso-laterale": persianaConPannello("laterale"),
  "products/persiana-pannello-fisso-superiore": persianaConPannello("superiore"),
  "products/persiana-angolo-2-ante": persianaAngolo(2),
  "products/persiana-angolo-3-ante": persianaAngolo(3),
  "products/lamelle-fisse": lamelle({ orientabili: false }),
  "products/lamelle-orientabili": lamelle({ orientabili: true }),
});

mkdirSync(join(USCITA, "products"), { recursive: true });
let n = 0;
for (const [nome, contenuto] of Object.entries(DISEGNI)) {
  writeFileSync(join(USCITA, `${nome}.svg`), contenuto, "utf8");
  n++;
}
console.log(`Disegni scritti: ${n} in public/templates/serramenti/`);
