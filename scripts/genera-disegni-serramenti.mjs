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
// Ridisegnate sulla «Libreria icone persiane» del 14/09/2026: vista interna,
// testata in alto, ante a lamelle. Il simbolo rosso ha il vertice dalla parte
// indicata nel nome («1 Anta DX» ha il vertice a destra), le frecce rosse dicono
// dove vanno scorrevoli e pacchetti, il vetro azzurro è il pannello fisso. Ogni
// disegno ha la tela ritagliata su misura, così nel listino e nel PDF si vede
// intero e senza bianco attorno.

const f1 = (v) => v.toFixed(1);
const pt = (x, y) => `${f1(x)},${f1(y)}`;

const PERS = {
  margine: 6,      // bianco attorno al disegno
  testata: 7,      // spessore della testata sopra il telaio
  sporgenza: 4,    // quanto la testata sporge ai lati del telaio
  stipite: 4,      // telaio fisso ai lati
  soglia: 3,       // telaio fisso in basso
  montante: 4,     // profilo verticale dell'anta
  traverso: 5,     // profilo orizzontale dell'anta
  passo: 5.2,      // distanza tra le lamelle
  tratto: "#7d858c",
  lamella: "#a3aab0",
  riflesso: "#dde1e4",
  fondo: "#f6f7f8",
  legno: "#eceef0",
  vetro: "#dcedf6",
  vetroBordo: "#9fb3bf",
  rosso: "#e4322b",
  ombra: "#c9ced3",
};

function tela(larghezza, altezza, contenuto) {
  const w = Math.ceil(larghezza), h = Math.ceil(altezza);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">` +
    `<rect width="${w}" height="${h}" fill="#ffffff"/>` + contenuto + `</svg>`;
}

function rett(x, y, w, h, fill, { bordo = PERS.tratto, spessore = 1, extra = "" } = {}) {
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}" stroke="${bordo}" stroke-width="${spessore}"${extra}/>`;
}

const tratto = (x1, y1, x2, y2, colore = PERS.tratto, largh = 1) =>
  `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${colore}" stroke-width="${largh}" stroke-linecap="round"/>`;

const poligono = (punti, fill, { bordo = PERS.tratto, spessore = 1 } = {}) =>
  `<polygon points="${punti.map(([x, y]) => pt(x, y)).join(" ")}" fill="${fill}" stroke="${bordo}" stroke-width="${spessore}" stroke-linejoin="round"/>`;

const rossa = (x1, y1, x2, y2) => tratto(x1, y1, x2, y2, PERS.rosso, 1.8);

/** Freccia rossa piena, orizzontale: asta e punta triangolare. */
function frecciaRossa(x1, y, x2) {
  const verso = Math.sign(x2 - x1) || 1, punta = 7;
  return tratto(x1, y, x2 - verso * punta * 0.7, y, PERS.rosso, 2.2) +
    poligono([[x2, y], [x2 - verso * punta, y - 3.8], [x2 - verso * punta, y + 3.8]], PERS.rosso, { bordo: PERS.rosso, spessore: 0.6 });
}

/** Le lamelle di un pannello: una riga scura con il riflesso chiaro sotto. */
function righeLamelle(x, y, w, h) {
  let out = rett(x, y, w, h, PERS.fondo, { spessore: 0.8 });
  for (let sy = y + PERS.passo * 0.7; sy < y + h - 1.5; sy += PERS.passo) {
    out += tratto(x + 1, sy, x + w - 1, sy, PERS.lamella, 0.9);
    out += tratto(x + 1, sy + 1.5, x + w - 1, sy + 1.5, PERS.riflesso, 0.8);
  }
  return out;
}

/** Il pomolo della chiusura, sul montante. */
const pomolo = (cx, cy) => rett(cx - 1.1, cy - 3, 2.2, 6, "#ffffff", { spessore: 0.7 });

/**
 * Un'anta a lamelle. simbolo ">" o "<": due linee rosse dagli angoli di un lato
 * al centro del lato opposto, dove sta il vertice; il pomolo va dalla parte della
 * base. Senza simbolo l'anta segue le altre.
 */
function antaLamelle(x, y, w, h, { simbolo = null, montante = PERS.montante } = {}) {
  const T = PERS.traverso;
  const px = x + montante, py = y + T, pw = w - montante * 2, ph = h - T * 2, cy = py + ph / 2;
  let out = rett(x, y, w, h, PERS.legno) + righeLamelle(px, py, pw, ph);
  if (simbolo === ">") {
    out += rossa(px + 1, py + 1, px + pw - 1, cy) + rossa(px + 1, py + ph - 1, px + pw - 1, cy) + pomolo(x + montante / 2, y + h * 0.52);
  } else if (simbolo === "<") {
    out += rossa(px + pw - 1, py + 1, px + 1, cy) + rossa(px + pw - 1, py + ph - 1, px + 1, cy) + pomolo(x + w - montante / 2, y + h * 0.52);
  }
  return out;
}

/** Pannello fisso in vetro, con un riflesso. */
function vetroFisso(x, y, w, h) {
  return rett(x, y, w, h, PERS.legno) +
    rett(x + 3, y + 3, w - 6, h - 6, PERS.vetro, { bordo: PERS.vetroBordo, spessore: 0.9 }) +
    tratto(x + 7, y + Math.min(h * 0.45, 26), x + Math.min(w * 0.4, 30), y + 7, "#ffffff", 1.2);
}

/**
 * La testata sopra il telaio. pieghe: per le ante a libro, le x dei giunti; la
 * testata fa una punta sopra un giunto sì e uno no, come le pieghe delle ante.
 */
function testata(x, y, w, pieghe = null) {
  const T = PERS.testata;
  if (!pieghe) {
    return rett(x, y, w, T, PERS.legno, { spessore: 1.1 }) + tratto(x + 1.5, y + 2.2, x + w - 1.5, y + 2.2, "#ffffff", 1);
  }
  const alto = pieghe.map((gx, i) => [gx, i % 2 === 0 ? y - 2 : y + 2]);
  return poligono([[x, y + T], [x, y + 2], ...alto, [x + w, y + 2], [x + w, y + T]], PERS.legno, { spessore: 1.1 });
}

const A = (simbolo, peso = 1) => ({ simbolo, peso });

/**
 * Ante affiancate sotto una testata: i battenti di finestre e portefinestre e le
 * ante a libro. montanteDopo mette un montante fisso dopo quell'anta (la 4 ante a
 * due coppie); libro fa la testata a pieghe.
 */
function persianaAnte({ larghezza, altezza, ante, montanteDopo = null, libro = false }) {
  const M = PERS.margine, S = PERS.sporgenza, T = PERS.testata;
  const ty = M + (libro ? 2 : 0);
  const fx = M + S, fy = ty + T;
  const vx = fx + PERS.stipite, vy = fy + 1.5;
  const vw = larghezza - PERS.stipite * 2, vh = altezza - 1.5 - PERS.soglia;
  const luce = 1.5, fisso = montanteDopo === null ? 0 : 4;
  const pesoTot = ante.reduce((s, a) => s + a.peso, 0);
  const utile = vw - luce * (ante.length - 1) - fisso;
  const posizioni = [], giunti = [];
  let ax = vx;
  ante.forEach((a, i) => {
    const aw = (utile * a.peso) / pesoTot;
    posizioni.push([ax, aw]);
    ax += aw;
    if (i < ante.length - 1) {
      if (montanteDopo === i) ax += fisso;
      giunti.push(ax + luce / 2);
      ax += luce;
    }
  });
  let out = rett(fx, fy, larghezza, altezza, PERS.legno, { spessore: 1.2 });
  out += rett(vx, vy, vw, vh, PERS.ombra, { bordo: "none", spessore: 0 });
  if (montanteDopo !== null) {
    const [mx, mw] = posizioni[montanteDopo];
    out += rett(mx + mw, vy, fisso, vh, PERS.legno);
  }
  posizioni.forEach(([x, w], i) => { out += antaLamelle(x, vy, w, vh, { simbolo: ante[i].simbolo }); });
  out += testata(M, ty, larghezza + S * 2, libro ? giunti : null);
  return tela(larghezza + (M + S) * 2, fy + altezza + M, out);
}

/**
 * A pacchetto: da una parte le ante ripiegate viste di taglio, dall'altra la parte
 * stesa a lamelle con la freccia che si allontana dal pacco. DX: pacco a sinistra
 * e freccia verso destra; SX speculare. Nella libreria la 4 ante DX aveva la
 * freccia al contrario delle altre tre: qui seguono tutte la stessa regola.
 */
function persianaPacchetto({ larghezza, altezza, ante, verso }) {
  const M = PERS.margine, S = PERS.sporgenza, T = PERS.testata;
  const fx = M + S, fy = M + T;
  const vx = fx + PERS.stipite, vy = fy + 1.5;
  const vw = larghezza - PERS.stipite * 2, vh = altezza - 1.5 - PERS.soglia;
  const pieghe = ante * 2 - 1, passoPiega = 5.5, pacco = pieghe * passoPiega + 2;
  const px = verso === "dx" ? vx : vx + vw - pacco;
  const sx = verso === "dx" ? vx + pacco : vx, sw = vw - pacco;
  let out = rett(fx, fy, larghezza, altezza, PERS.legno, { spessore: 1.2 });
  out += antaLamelle(sx, vy, sw, vh);
  for (let i = 0; i < pieghe; i++) {
    const x = px + 1 + i * passoPiega, lw = passoPiega - 1;
    out += rett(x, vy, lw, vh, i % 2 === 0 ? "#ffffff" : PERS.fondo, { spessore: 0.8 });
    out += tratto(x + lw / 2, vy + 5, x + lw / 2, vy + vh - 5, PERS.lamella, 0.7);
  }
  const cy = vy + vh / 2;
  out += verso === "dx" ? frecciaRossa(sx + sw * 0.28, cy, sx + sw * 0.8) : frecciaRossa(sx + sw * 0.72, cy, sx + sw * 0.2);
  out += testata(M, M, larghezza + S * 2);
  return tela(larghezza + (M + S) * 2, fy + altezza + M, out);
}

/**
 * Scorrevoli: la guida in alto è la testata. Con un'anta la guida prosegue sopra
 * la finestra e l'anta sta dalla parte in cui apre, con il fermo a terra: DX a
 * destra con la freccia verso destra, SX speculare. Due ante sotto la stessa
 * guida, frecce come nella libreria; sovrapposte: l'anta dietro è più chiara e
 * quella davanti porta la freccia.
 */
function persianaScorrevole(tipo) {
  const M = PERS.margine, T = PERS.testata, h = 150, antaW = 90, fermo = 11;
  const due = tipo === "2-ante" || tipo === "2-ante-sovrapposte";
  const y0 = M + T + 1, cy = y0 + h / 2;
  const pendini = (x, w) =>
    rett(x + 10, M + T - 1, 4, 3, PERS.legno, { spessore: 0.7 }) + rett(x + w - 14, M + T - 1, 4, 3, PERS.legno, { spessore: 0.7 });
  const anta = (x, w) => antaLamelle(x, y0, w, h, { montante: 5 }) + pendini(x, w);
  let out = "";
  if (!due) {
    const dx = tipo === "1-anta-dx", prolunga = 62;
    const guidaW = antaW + prolunga + 8;
    const gx = dx ? M : M + fermo;
    const ax = dx ? gx + prolunga + 4 : gx + 4;
    out += anta(ax, antaW);
    out += rett(dx ? ax + antaW : ax - fermo, y0 + h - 5, fermo, 5, PERS.legno, { spessore: 0.9 });
    out += dx ? frecciaRossa(ax + antaW * 0.24, cy, ax + antaW * 0.78) : frecciaRossa(ax + antaW * 0.76, cy, ax + antaW * 0.22);
    out += testata(gx, M, guidaW);
    return tela(guidaW + fermo + M * 2, y0 + h + M, out);
  }
  const corpoW = 172, guidaW = corpoW + 8, ax = M + 4;
  if (tipo === "2-ante") {
    const aw = (corpoW - 2) / 2, bx = ax + aw + 2;
    out += anta(ax, aw) + anta(bx, aw);
    out += frecciaRossa(ax + aw * 0.22, cy, ax + aw * 0.78) + frecciaRossa(bx + aw * 0.22, cy, bx + aw * 0.78);
  } else {
    const aw = corpoW * 0.54, bx = ax + corpoW - aw;
    out += anta(ax, aw) + rett(ax, y0, aw, h, "#ffffff", { bordo: "none", spessore: 0, extra: ` fill-opacity="0.4"` });
    out += anta(bx, aw) + frecciaRossa(bx + aw * 0.25, cy, bx + aw * 0.78);
  }
  out += testata(M, M, guidaW);
  return tela(guidaW + M * 2, y0 + h + M, out);
}

/** Sopraluce e pannello fisso superiore: vetro in alto, traverso, due ante a lamelle. */
function persianaVetroSopra(tipo) {
  const sopraluce = tipo === "sopraluce";
  const larghezza = 150, altezza = sopraluce ? 170 : 156;
  const M = PERS.margine, S = PERS.sporgenza, T = PERS.testata;
  const fx = M + S, fy = M + T;
  const vx = fx + PERS.stipite, vy = fy + 2;
  const vw = larghezza - PERS.stipite * 2, vh = altezza - 2 - PERS.soglia;
  const hVetro = vh * (sopraluce ? 0.22 : 0.2), traverso = 5;
  let out = rett(fx, fy, larghezza, altezza, PERS.legno, { spessore: 1.2 });
  out += vetroFisso(vx, vy, vw, hVetro);
  out += rett(vx - 1, vy + hVetro, vw + 2, traverso, PERS.legno);
  const ya = vy + hVetro + traverso, ha = vh - hVetro - traverso, aw = (vw - 1.5) / 2;
  out += antaLamelle(vx, ya, aw, ha) + antaLamelle(vx + aw + 1.5, ya, aw, ha);
  out += pomolo(vx + aw - 2, ya + ha * 0.52);
  out += testata(M, M, larghezza + S * 2);
  return tela(larghezza + (M + S) * 2, fy + altezza + M, out);
}

/** Pannello fisso laterale: anta a lamelle a sinistra, vetro fisso a destra. */
function persianaVetroLato() {
  const larghezza = 164, altezza = 150;
  const M = PERS.margine, S = PERS.sporgenza, T = PERS.testata;
  const fx = M + S, fy = M + T;
  const vx = fx + PERS.stipite, vy = fy + 1.5;
  const vw = larghezza - PERS.stipite * 2, vh = altezza - 1.5 - PERS.soglia;
  const antaW = vw * 0.6, montante = 4;
  let out = rett(fx, fy, larghezza, altezza, PERS.legno, { spessore: 1.2 });
  out += antaLamelle(vx, vy, antaW, vh) + pomolo(vx + antaW - 2, vy + vh * 0.52);
  out += rett(vx + antaW, vy, montante, vh, PERS.legno);
  out += vetroFisso(vx + antaW + montante, vy, vw - antaW - montante, vh);
  out += testata(M, M, larghezza + S * 2);
  return tela(larghezza + (M + S) * 2, fy + altezza + M, out);
}

/**
 * Anta vista di scorcio: i bordi verticali restano verticali, sopra e sotto
 * convergono verso il bordo più lontano. vicino: "sx" o "dx", il bordo più alto.
 */
function antaScorcio(x, y, w, h, rientro, vicino) {
  const [dl, dr] = vicino === "dx" ? [rientro, 0] : [0, rientro];
  let out = poligono([[x, y + dl], [x + w, y + dr], [x + w, y + h - dr], [x, y + h - dl]], PERS.legno);
  const m = 4, t = 5, lx = x + m, rx = x + w - m;
  const topL = y + dl + t, topR = y + dr + t, botL = y + h - dl - t, botR = y + h - dr - t;
  out += poligono([[lx, topL], [rx, topR], [rx, botR], [lx, botL]], PERS.fondo, { spessore: 0.8 });
  const n = Math.floor(Math.min(botL - topL, botR - topR) / PERS.passo);
  for (let i = 1; i < n; i++) {
    const s = i / n, yl = topL + (botL - topL) * s, yr = topR + (botR - topR) * s;
    out += tratto(lx + 1, yl, rx - 1, yr, PERS.lamella, 0.9) + tratto(lx + 1, yl + 1.4, rx - 1, yr + 1.4, PERS.riflesso, 0.7);
  }
  return out;
}

/** Ad angolo, come nella libreria: ante di scorcio attorno all'angolo; con due ante la luce in vetro sta in mezzo. */
function persianaAngolo(ante) {
  const M = PERS.margine, h = 150, r = 9, y = M + 2, x = M + 2;
  let out = "";
  if (ante === 2) {
    const aw = 66, vetroW = 9;
    out += antaScorcio(x, y, aw, h, r, "dx");
    const gx = x + aw + 1;
    out += rett(gx, y, vetroW, h, PERS.legno) + rett(gx + 2, y + 3, vetroW - 4, h - 6, PERS.vetro, { bordo: PERS.vetroBordo, spessore: 0.7 });
    out += antaScorcio(gx + vetroW + 1, y, aw, h, r, "sx");
    return tela(gx + vetroW + 1 + aw + M + 2, h + y + M, out);
  }
  const aw = 58;
  ["dx", "sx", "dx"].forEach((vicino, i) => { out += antaScorcio(x + i * (aw + 1.5), y, aw, h, r, vicino); });
  return tela(x + (aw + 1.5) * 3 + M, h + y + M, out);
}

/** Le tre lamelle della libreria, per la scheda della linea: fisse, orientabili, regolabili. */
function disegnoLamelle(tipo) {
  const w = 156, h = 124;
  let out = "";
  if (tipo === "fisse") {
    out += rett(10, 8, 11, h - 16, PERS.legno) + tratto(13, 10, 13, h - 10, "#ffffff", 1.2);
    const bx = 21, bw = w - 31, n = 5, bh = (h - 16) / n;
    for (let i = 0; i < n; i++) {
      const by = 8 + i * bh;
      out += rett(bx, by, bw, bh, i % 2 ? "#f1f3f4" : "#f7f8f9", { spessore: 0.9 });
      out += tratto(bx + 1, by + 2, bx + bw - 1, by + 2, "#ffffff", 1.2);
      out += tratto(bx + 1, by + bh - 1.2, bx + bw - 1, by + bh - 1.2, PERS.lamella, 0.9);
    }
    return tela(w, h, out);
  }
  const regolabili = tipo === "regolabili";
  const mx = regolabili ? 22 : 10;
  if (regolabili) out += rett(8, 16, 8, h - 26, PERS.legno);
  out += rett(mx, 8, 12, h - 16, PERS.legno) + tratto(mx + 3, 10, mx + 3, h - 10, "#ffffff", 1.2);
  const x0 = mx + 12, x1 = w - 10, alto = regolabili ? 20 : 8;
  if (regolabili) out += rett(x0, 8, x1 - x0, 12, PERS.legno) + tratto(x0 + 2, 11, x1 - 2, 11, "#ffffff", 1.2);
  out += rett(x0, alto, x1 - x0, h - 8 - alto, PERS.ombra, { spessore: 0.8 });
  const n = regolabili ? 3 : 4, passo = (h - 8 - alto) / n;
  const faccia = regolabili ? 4.5 : 3.5, scorcio = regolabili ? 14 : 10;
  for (let i = 0; i < n; i++) {
    const yb = alto + 3 + i * passo, yf = yb + passo * 0.62;
    out += poligono([[x0, yb], [x1, yb], [x1, yf], [x0 + scorcio, yf]], "#ffffff");
    out += poligono([[x0 + scorcio, yf], [x1, yf], [x1, yf + faccia], [x0 + scorcio, yf + faccia]], "#e6e9ec", { spessore: 0.9 });
  }
  return tela(w, h, out);
}

// Le misure a disegno, dalle proporzioni della libreria: la finestra è più bassa
// della portafinestra e ogni anta in più allarga la tela.
const LARGHEZZA_FINESTRA = { 1: 78, 2: 122, 3: 150, 4: 176 };
const LARGHEZZA_PORTAFINESTRA = { 1: 80, 2: 118, 3: 136, 4: 150 };

// I simboli anta per anta, come nella libreria (null = anta senza simbolo).
const CONFIGURAZIONI_BATTENTE = [
  ["1-anta-dx", [A(">")]],
  ["1-anta-sx", [A("<")]],
  ["2-ante", [A(">"), A("<")]],
  ["2-ante-asimmetriche-principale-sx", [A(">", 1.7), A(null)]],
  ["2-ante-asimmetriche-principale-dx", [A(null), A("<", 1.7)]],
  ["3-ante-2-1-sx", [A(null, 0.75), A(">", 1.2), A(">")]],
  ["3-ante-1-2-dx", [A(null), A("<", 1.4), A(null, 0.75)]],
  ["3-ante", [A("<"), A(">"), A(">")]],
  ["4-ante-2-2", [A("<"), A(null), A(null), A(">")], { montanteDopo: 1 }],
  ["4-ante", [A("<"), A(null), A(null), A(">")]],
];

for (const [chiave, ante, opzioni = {}] of CONFIGURAZIONI_BATTENTE) {
  DISEGNI[`products/persiana-finestra-${chiave}`] = persianaAnte({ larghezza: LARGHEZZA_FINESTRA[ante.length], altezza: 124, ante, ...opzioni });
  DISEGNI[`products/persiana-portafinestra-${chiave}`] = persianaAnte({ larghezza: LARGHEZZA_PORTAFINESTRA[ante.length], altezza: 210, ante, ...opzioni });
}
Object.assign(DISEGNI, {
  "products/persiana-libro-2-ante": persianaAnte({ larghezza: 116, altezza: 140, ante: [A(">"), A("<")], libro: true }),
  "products/persiana-libro-3-ante": persianaAnte({ larghezza: 138, altezza: 140, ante: [A(">"), A(">"), A("<")], libro: true }),
  "products/persiana-libro-4-ante": persianaAnte({ larghezza: 156, altezza: 140, ante: [A(">"), A("<"), A(">"), A("<")], libro: true }),
  "products/persiana-pacchetto-3-ante-dx": persianaPacchetto({ larghezza: 122, altezza: 140, ante: 3, verso: "dx" }),
  "products/persiana-pacchetto-3-ante-sx": persianaPacchetto({ larghezza: 122, altezza: 140, ante: 3, verso: "sx" }),
  "products/persiana-pacchetto-4-ante-dx": persianaPacchetto({ larghezza: 140, altezza: 140, ante: 4, verso: "dx" }),
  "products/persiana-pacchetto-4-ante-sx": persianaPacchetto({ larghezza: 140, altezza: 140, ante: 4, verso: "sx" }),
  "products/persiana-scorrevole-1-anta-dx": persianaScorrevole("1-anta-dx"),
  "products/persiana-scorrevole-1-anta-sx": persianaScorrevole("1-anta-sx"),
  "products/persiana-scorrevole-2-ante": persianaScorrevole("2-ante"),
  "products/persiana-scorrevole-2-ante-sovrapposte": persianaScorrevole("2-ante-sovrapposte"),
  "products/persiana-con-sopraluce": persianaVetroSopra("sopraluce"),
  "products/persiana-pannello-fisso-laterale": persianaVetroLato(),
  "products/persiana-pannello-fisso-superiore": persianaVetroSopra("superiore"),
  "products/persiana-angolo-2-ante": persianaAngolo(2),
  "products/persiana-angolo-3-ante": persianaAngolo(3),
  "products/lamelle-fisse": disegnoLamelle("fisse"),
  "products/lamelle-orientabili": disegnoLamelle("orientabili"),
  "products/lamelle-regolabili": disegnoLamelle("regolabili"),
});

mkdirSync(join(USCITA, "products"), { recursive: true });
let n = 0;
for (const [nome, contenuto] of Object.entries(DISEGNI)) {
  writeFileSync(join(USCITA, `${nome}.svg`), contenuto, "utf8");
  n++;
}
console.log(`Disegni scritti: ${n} in public/templates/serramenti/`);
