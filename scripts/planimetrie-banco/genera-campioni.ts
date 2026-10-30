// Genera il banco di prova: piante sintetiche (PNG e PDF) con la loro verità.
//   node scripts/planimetrie-banco/genera-campioni.ts
// Deterministico: gli stessi semi danno gli stessi file.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generaPianta, SPESSORE_EST, type PiantaVera, type Rett } from "./layout.ts";

const QUI = dirname(fileURLToPath(import.meta.url));
const OUT = join(QUI, "campioni");

type Stile = "geometra" | "catastale" | "schizzo";

interface Definizione {
  id: string;
  stile: Stile;
  seme: number;
  stanze: number;
  larghezza: number;
  profondita: number;
  formato: "png" | "pdf";
  superfici?: boolean;
  altezzaScritta?: boolean;
  /** Schizzo: stanze senza misure scritte. */
  senzaMisure?: string[];
}

const DEFINIZIONI: Definizione[] = [
  { id: "g01-bilocale", stile: "geometra", seme: 11, stanze: 4, larghezza: 820, profondita: 640, formato: "png" },
  { id: "g02-trilocale", stile: "geometra", seme: 23, stanze: 6, larghezza: 1050, profondita: 760, formato: "png", superfici: true },
  { id: "g03-quadrilocale", stile: "geometra", seme: 37, stanze: 8, larghezza: 1240, profondita: 880, formato: "png", altezzaScritta: true },
  { id: "g04-trilocale-lungo", stile: "geometra", seme: 41, stanze: 6, larghezza: 1400, profondita: 620, formato: "png" },
  { id: "g05-monolocale", stile: "geometra", seme: 53, stanze: 3, larghezza: 640, profondita: 560, formato: "png", superfici: true },
  { id: "g06-trilocale-pdf", stile: "geometra", seme: 67, stanze: 6, larghezza: 1000, profondita: 800, formato: "pdf" },
  { id: "g07-quadrilocale-pdf", stile: "geometra", seme: 71, stanze: 7, larghezza: 1180, profondita: 820, formato: "pdf", superfici: true },
  { id: "c01-catastale-bilocale", stile: "catastale", seme: 83, stanze: 4, larghezza: 760, profondita: 620, formato: "png", altezzaScritta: true },
  { id: "c02-catastale-trilocale", stile: "catastale", seme: 97, stanze: 6, larghezza: 1080, profondita: 740, formato: "png", altezzaScritta: true },
  { id: "c03-catastale-quadrilocale", stile: "catastale", seme: 101, stanze: 7, larghezza: 1200, profondita: 860, formato: "pdf", altezzaScritta: true },
  { id: "s01-schizzo-bilocale", stile: "schizzo", seme: 113, stanze: 4, larghezza: 780, profondita: 600, formato: "png" },
  { id: "s02-schizzo-trilocale", stile: "schizzo", seme: 127, stanze: 6, larghezza: 1020, profondita: 720, formato: "png" },
  { id: "s03-schizzo-senza-misure", stile: "schizzo", seme: 131, stanze: 5, larghezza: 900, profondita: 700, formato: "png", senzaMisure: ["Disimpegno"] },
];

const DESCRIZIONI = [
  {
    id: "t01-bilocale-testo",
    testo: "Bilocale di circa 50 mq: soggiorno con angolo cottura di 5 x 4,5 m, camera matrimoniale 3,5 x 4 m, bagno 2 x 2,5 m con finestra, piccolo disimpegno.",
    locali: [
      { destinazione: "soggiorno", area_mq: 22.5 },
      { destinazione: "camera", area_mq: 14 },
      { destinazione: "bagno", area_mq: 5 },
      { destinazione: "disimpegno", area_mq: null },
    ],
  },
  {
    id: "t02-trilocale-testo",
    testo: "Trilocale 75 mq, si entra nel soggiorno di 25 mq; cucina abitabile 3 x 3,5; due camere, matrimoniale 14 mq e singola 9 mq; un bagno 2 x 2,5 e un disimpegno che porta alle camere.",
    locali: [
      { destinazione: "soggiorno", area_mq: 25 },
      { destinazione: "cucina", area_mq: 10.5 },
      { destinazione: "camera", area_mq: 14 },
      { destinazione: "camera", area_mq: 9 },
      { destinazione: "bagno", area_mq: 5 },
      { destinazione: "disimpegno", area_mq: null },
    ],
  },
  {
    id: "t03-quadrilocale-testo",
    testo: "Quadrilocale di 95 mq: soggiorno 28 mq, cucina 12 mq, tre camere da 14, 11 e 9 mq, due bagni da 5 e 3,5 mq, disimpegno, balcone di 6 mq.",
    locali: [
      { destinazione: "soggiorno", area_mq: 28 },
      { destinazione: "cucina", area_mq: 12 },
      { destinazione: "camera", area_mq: 14 },
      { destinazione: "camera", area_mq: 11 },
      { destinazione: "camera", area_mq: 9 },
      { destinazione: "bagno", area_mq: 5 },
      { destinazione: "bagno", area_mq: 3.5 },
      { destinazione: "disimpegno", area_mq: null },
      { destinazione: "balcone", area_mq: 6 },
    ],
  },
];

const fmt = (cm: number) => (cm / 100).toFixed(2).replace(".", ",");
const mq = (r: Rett) => ((r.x1 - r.x0) * (r.y1 - r.y0)) / 10_000;
const ABBREV: Record<string, string> = { soggiorno: "Sogg.", cucina: "Cuc.", camera: "Letto", bagno: "W.C.", disimpegno: "Dis." };

interface Disegno {
  svg: string;
  larghezzaPx: number;
  altezzaPx: number;
  /** cm → px */
  px: (p: { x: number; y: number }) => { x: number; y: number };
}

function disegnaTecnico(p: PiantaVera, d: Definizione): Disegno {
  const k = d.stile === "catastale" ? 0.95 : 1.4;
  const M = d.stile === "catastale" ? 110 : 150;
  const W = Math.round((p.ingombro.x1 - p.ingombro.x0) * k + 2 * M);
  const H = Math.round((p.ingombro.y1 - p.ingombro.y0) * k + 2 * M + (d.stile === "catastale" ? 60 : 0));
  const X = (x: number) => M + x * k;
  const Y = (y: number) => M + y * k;
  const out: string[] = [];
  const font = d.stile === "catastale" ? "Times New Roman, serif" : "Arial, Helvetica, sans-serif";
  out.push(`<rect width="${W}" height="${H}" fill="${d.stile === "catastale" ? "#f7f6f1" : "#fff"}"/>`);
  const e = SPESSORE_EST / 2;
  out.push(`<rect x="${X(-e)}" y="${Y(-e)}" width="${(p.ingombro.x1 + 2 * e) * k}" height="${(p.ingombro.y1 + 2 * e) * k}" fill="#111"/>`);
  for (const s of p.stanze) {
    out.push(`<rect x="${X(s.netto.x0)}" y="${Y(s.netto.y0)}" width="${(s.netto.x1 - s.netto.x0) * k}" height="${(s.netto.y1 - s.netto.y0) * k}" fill="${d.stile === "catastale" ? "#f7f6f1" : "#fff"}"/>`);
  }
  for (const a of p.aperture) {
    const orizz = a.da.y === a.a.y;
    const t = (SPESSORE_EST / 2 + 2) * k;
    const x0 = X(Math.min(a.da.x, a.a.x));
    const y0 = Y(Math.min(a.da.y, a.a.y));
    const l = Math.hypot(a.a.x - a.da.x, a.a.y - a.da.y) * k;
    const bg = d.stile === "catastale" ? "#f7f6f1" : "#fff";
    if (orizz) out.push(`<rect x="${x0}" y="${y0 - t}" width="${l}" height="${2 * t}" fill="${bg}"/>`);
    else out.push(`<rect x="${x0 - t}" y="${y0}" width="${2 * t}" height="${l}" fill="${bg}"/>`);
    // spalle del vano
    const sw = d.stile === "catastale" ? 1 : 1.4;
    if (a.tipo === "porta") {
      if (d.stile === "geometra") {
        const cx = X(a.da.x);
        const cy = Y(a.da.y);
        const ex = orizz ? cx : cx + l;
        const ey = orizz ? cy - l : cy;
        const ax = X(a.a.x);
        const ay = Y(a.a.y);
        out.push(`<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="#111" stroke-width="${sw}"/>`);
        out.push(`<path d="M ${ex} ${ey} A ${l} ${l} 0 0 ${orizz ? 1 : 1} ${ax} ${ay}" fill="none" stroke="#111" stroke-width="0.8" stroke-dasharray="${orizz ? "0" : "0"}"/>`);
      }
    } else {
      const linee = a.tipo === "portafinestra" ? [-0.6, 0, 0.6] : [-0.4, 0.4];
      for (const f of linee) {
        if (orizz) out.push(`<line x1="${x0}" y1="${y0 + f * t}" x2="${x0 + l}" y2="${y0 + f * t}" stroke="#111" stroke-width="0.9"/>`);
        else out.push(`<line x1="${x0 + f * t}" y1="${y0}" x2="${x0 + f * t}" y2="${y0 + l}" stroke="#111" stroke-width="0.9"/>`);
      }
      if (orizz) {
        out.push(`<line x1="${x0}" y1="${y0 - t}" x2="${x0}" y2="${y0 + t}" stroke="#111" stroke-width="${sw}"/><line x1="${x0 + l}" y1="${y0 - t}" x2="${x0 + l}" y2="${y0 + t}" stroke="#111" stroke-width="${sw}"/>`);
      } else {
        out.push(`<line x1="${x0 - t}" y1="${y0}" x2="${x0 + t}" y2="${y0}" stroke="#111" stroke-width="${sw}"/><line x1="${x0 - t}" y1="${y0 + l}" x2="${x0 + t}" y2="${y0 + l}" stroke="#111" stroke-width="${sw}"/>`);
      }
    }
  }
  // testi e quote
  for (const s of p.stanze) {
    const cx = X((s.netto.x0 + s.netto.x1) / 2);
    const cy = Y((s.netto.y0 + s.netto.y1) / 2);
    const nome = d.stile === "catastale" ? ABBREV[s.destinazione] ?? s.nome : s.nome.toUpperCase();
    const fs = d.stile === "catastale" ? 13 : 17;
    out.push(`<text x="${cx}" y="${cy}" font-family="${font}" font-size="${fs}" text-anchor="middle" ${d.stile === "catastale" ? 'font-style="italic"' : 'font-weight="bold"'}>${nome}</text>`);
    let riga = cy + fs + 4;
    if (d.superfici) {
      out.push(`<text x="${cx}" y="${riga}" font-family="${font}" font-size="14" text-anchor="middle">S = ${mq(s.netto).toFixed(2).replace(".", ",")} mq</text>`);
      riga += 18;
    }
    if (d.altezzaScritta) out.push(`<text x="${cx}" y="${riga}" font-family="${font}" font-size="${d.stile === "catastale" ? 11 : 13}" text-anchor="middle">h ${d.stile === "catastale" ? "= 2,70" : "2,70"}</text>`);
    if (d.stile === "geometra") {
      const yq = Y(s.netto.y0) + 22;
      const xa = X(s.netto.x0);
      const xb = X(s.netto.x1);
      out.push(`<line x1="${xa}" y1="${yq}" x2="${xb}" y2="${yq}" stroke="#c0392b" stroke-width="0.8"/>`);
      out.push(`<line x1="${xa - 4}" y1="${yq + 4}" x2="${xa + 4}" y2="${yq - 4}" stroke="#c0392b" stroke-width="1.2"/><line x1="${xb - 4}" y1="${yq + 4}" x2="${xb + 4}" y2="${yq - 4}" stroke="#c0392b" stroke-width="1.2"/>`);
      out.push(`<text x="${(xa + xb) / 2}" y="${yq - 4}" font-family="${font}" font-size="13" fill="#c0392b" text-anchor="middle">${fmt(s.netto.x1 - s.netto.x0)}</text>`);
      const xq = X(s.netto.x0) + 22;
      const ya = Y(s.netto.y0);
      const yb = Y(s.netto.y1);
      out.push(`<line x1="${xq}" y1="${ya}" x2="${xq}" y2="${yb}" stroke="#c0392b" stroke-width="0.8"/>`);
      out.push(`<line x1="${xq - 4}" y1="${ya + 4}" x2="${xq + 4}" y2="${ya - 4}" stroke="#c0392b" stroke-width="1.2"/><line x1="${xq - 4}" y1="${yb + 4}" x2="${xq + 4}" y2="${yb - 4}" stroke="#c0392b" stroke-width="1.2"/>`);
      out.push(`<text x="${xq - 4}" y="${(ya + yb) / 2}" font-family="${font}" font-size="13" fill="#c0392b" text-anchor="middle" transform="rotate(-90 ${xq - 4} ${(ya + yb) / 2})">${fmt(s.netto.y1 - s.netto.y0)}</text>`);
    }
  }
  if (d.stile === "geometra") {
    // quote totali fuori
    const yq = Y(-e) - 50;
    out.push(`<line x1="${X(-e)}" y1="${yq}" x2="${X(p.ingombro.x1 + e)}" y2="${yq}" stroke="#111" stroke-width="0.8"/>`);
    out.push(`<text x="${(X(-e) + X(p.ingombro.x1 + e)) / 2}" y="${yq - 6}" font-family="${font}" font-size="15" text-anchor="middle">${fmt(p.ingombro.x1 + 2 * e)}</text>`);
    const xq = X(-e) - 50;
    out.push(`<line x1="${xq}" y1="${Y(-e)}" x2="${xq}" y2="${Y(p.ingombro.y1 + e)}" stroke="#111" stroke-width="0.8"/>`);
    out.push(`<text x="${xq - 6}" y="${(Y(-e) + Y(p.ingombro.y1 + e)) / 2}" font-family="${font}" font-size="15" text-anchor="middle" transform="rotate(-90 ${xq - 6} ${(Y(-e) + Y(p.ingombro.y1 + e)) / 2})">${fmt(p.ingombro.y1 + 2 * e)}</text>`);
    out.push(`<text x="${W - 30}" y="${H - 30}" font-family="${font}" font-size="14" text-anchor="end">PIANTA PIANO PRIMO — STATO DI FATTO — scala 1:100</text>`);
  } else {
    out.push(`<text x="${M}" y="${H - 40}" font-family="${font}" font-size="13">Scala 1:200</text>`);
    out.push(`<text x="${W / 2}" y="${50}" font-family="${font}" font-size="14" text-anchor="middle">PIANO PRIMO</text>`);
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join("")}</svg>`, larghezzaPx: W, altezzaPx: H, px: (pt) => ({ x: X(pt.x), y: Y(pt.y) }) };
}

function disegnaSchizzo(p: PiantaVera, d: Definizione, seme: number): Disegno {
  let s = seme;
  const caso = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const k = 1.2;
  const M = 140;
  const fase = caso() * 6;
  // Deformazione: lo schizzo non è in scala.
  const wx = (x: number) => x * (1 + 0.16 * Math.sin(x / 380 + fase));
  const wy = (y: number) => y * (1 - 0.14 * Math.sin(y / 330 + fase));
  const X = (x: number) => M + wx(x) * k;
  const Y = (y: number) => M + wy(y) * k;
  const W = Math.round(X(p.ingombro.x1) + M);
  const H = Math.round(Y(p.ingombro.y1) + M);
  const inchiostro = "#1f2d6e";
  const out: string[] = [`<rect width="${W}" height="${H}" fill="#fbf8ee"/>`];
  for (let y = 40; y < H; y += 32) out.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#c9d8ef" stroke-width="1"/>`);
  const tratto = (x1: number, y1: number, x2: number, y2: number) => {
    const n = 6;
    let dd = `M ${X(x1) + (caso() - 0.5) * 3} ${Y(y1) + (caso() - 0.5) * 3}`;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      dd += ` L ${X(x1 + (x2 - x1) * t) + (caso() - 0.5) * 3} ${Y(y1 + (y2 - y1) * t) + (caso() - 0.5) * 3}`;
    }
    out.push(`<path d="${dd}" fill="none" stroke="${inchiostro}" stroke-width="2.3" stroke-linecap="round"/>`);
  };
  // lati con i vani lasciati aperti
  for (const st of p.stanze) {
    const r = st.assi;
    const lati: Array<[number, number, number, number]> = [[r.x0, r.y0, r.x1, r.y0], [r.x1, r.y0, r.x1, r.y1], [r.x1, r.y1, r.x0, r.y1], [r.x0, r.y1, r.x0, r.y0]];
    for (const [x1, y1, x2, y2] of lati) {
      const orizz = y1 === y2;
      const lo = orizz ? Math.min(x1, x2) : Math.min(y1, y2);
      const hi = orizz ? Math.max(x1, x2) : Math.max(y1, y2);
      const buchi = p.aperture
        .filter((a) => a.tipo === "porta" && (orizz ? a.da.y === y1 && a.a.y === y1 : a.da.x === x1 && a.a.x === x1))
        .map((a) => (orizz ? [Math.min(a.da.x, a.a.x), Math.max(a.da.x, a.a.x)] : [Math.min(a.da.y, a.a.y), Math.max(a.da.y, a.a.y)]))
        .filter(([a, b]) => a >= lo - 1 && b <= hi + 1)
        .sort((a, b) => a[0] - b[0]);
      let cur = lo;
      for (const [a, b] of [...buchi, [hi, hi]]) {
        if (a - cur > 2) orizz ? tratto(cur, y1, a, y1) : tratto(x1, cur, x1, a);
        cur = Math.max(cur, b);
      }
    }
  }
  const mano = "Bradley Hand, Chalkboard, Comic Sans MS, cursive";
  for (const a of p.aperture) {
    const orizz = a.da.y === a.a.y;
    if (a.tipo === "porta") {
      const cx = X(a.da.x);
      const cy = Y(a.da.y);
      const ax = X(a.a.x);
      const ay = Y(a.a.y);
      const l = Math.hypot(ax - cx, ay - cy);
      out.push(`<path d="M ${ax} ${ay} A ${l} ${l} 0 0 0 ${orizz ? cx : cx + l} ${orizz ? cy - l : cy}" fill="none" stroke="${inchiostro}" stroke-width="1.3"/>`);
    } else {
      for (const off of a.tipo === "portafinestra" ? [-6, 0, 6] : [-5, 5]) {
        if (orizz) out.push(`<line x1="${X(a.da.x)}" y1="${Y(a.da.y) + off}" x2="${X(a.a.x)}" y2="${Y(a.a.y) + off}" stroke="${inchiostro}" stroke-width="1.4"/>`);
        else out.push(`<line x1="${X(a.da.x) + off}" y1="${Y(a.da.y)}" x2="${X(a.a.x) + off}" y2="${Y(a.a.y)}" stroke="${inchiostro}" stroke-width="1.4"/>`);
      }
    }
  }
  for (const st of p.stanze) {
    const cx = (X(st.assi.x0) + X(st.assi.x1)) / 2;
    const cy = (Y(st.assi.y0) + Y(st.assi.y1)) / 2;
    out.push(`<text x="${cx}" y="${cy - 6}" font-family="${mano}" font-size="20" fill="${inchiostro}" text-anchor="middle">${st.nome.toUpperCase()}</text>`);
    if (!d.senzaMisure?.includes(st.nome)) {
      out.push(`<text x="${cx}" y="${cy + 20}" font-family="${mano}" font-size="19" fill="${inchiostro}" text-anchor="middle">${fmt(st.netto.x1 - st.netto.x0)} x ${fmt(st.netto.y1 - st.netto.y0)}</text>`);
    }
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join("")}</svg>`, larghezzaPx: W, altezzaPx: H, px: (pt) => ({ x: X(pt.x), y: Y(pt.y) }) };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const indice: string[] = [];
  for (const d of DEFINIZIONI) {
    const pianta = generaPianta(d.seme, d.stanze, d.larghezza, d.profondita);
    const dis = d.stile === "schizzo" ? disegnaSchizzo(pianta, d, d.seme) : disegnaTecnico(pianta, d);
    const page = await browser.newPage({ viewport: { width: dis.larghezzaPx, height: dis.altezzaPx } });
    await page.setContent(`<html><body style="margin:0">${dis.svg}</body></html>`);
    const file = `${d.id}.${d.formato}`;
    if (d.formato === "png") await page.screenshot({ path: join(OUT, file), clip: { x: 0, y: 0, width: dis.larghezzaPx, height: dis.altezzaPx } });
    else await page.pdf({ path: join(OUT, file), width: `${dis.larghezzaPx}px`, height: `${dis.altezzaPx}px`, printBackground: true, pageRanges: "1" });
    await page.close();
    // misura che l'utente confermerebbe sui catastali (senza quote): la larghezza del soggiorno
    const sogg = pianta.stanze.find((s) => s.destinazione === "soggiorno")!;
    const verita = {
      id: d.id,
      ingresso: d.stile === "schizzo" ? "schizzo" : "documento",
      stile: d.stile,
      file,
      mime: d.formato === "pdf" ? "application/pdf" : "image/png",
      larghezza_px: dis.larghezzaPx,
      altezza_px: dis.altezzaPx,
      locali: pianta.stanze.map((s) => ({
        nome: s.nome,
        destinazione: s.destinazione,
        area_mq: Math.round(mq(s.netto) * 100) / 100,
        contorno_px: [[s.netto.x0, s.netto.y0], [s.netto.x1, s.netto.y0], [s.netto.x1, s.netto.y1], [s.netto.x0, s.netto.y1]].map(([x, y]) => {
          const q = dis.px({ x, y });
          return [Math.round((q.x / dis.larghezzaPx) * 1000), Math.round((q.y / dis.altezzaPx) * 1000)];
        }),
        contorno_cm: [[s.netto.x0, s.netto.y0], [s.netto.x1, s.netto.y0], [s.netto.x1, s.netto.y1], [s.netto.x0, s.netto.y1]],
        larghezza_cm: s.netto.x1 - s.netto.x0,
        profondita_cm: s.netto.y1 - s.netto.y0,
        misure_scritte: d.stile !== "schizzo" || !d.senzaMisure?.includes(s.nome),
      })),
      aperture: pianta.aperture.map((a) => ({
        tipo: a.tipo,
        larghezza_cm: Math.round(Math.hypot(a.a.x - a.da.x, a.a.y - a.da.y)),
        stanze: a.stanze,
        da_cm: [a.da.x, a.da.y],
        a_cm: [a.a.x, a.a.y],
        da_px: (() => { const q = dis.px(a.da); return [Math.round((q.x / dis.larghezzaPx) * 1000), Math.round((q.y / dis.altezzaPx) * 1000)]; })(),
        a_px: (() => { const q = dis.px(a.a); return [Math.round((q.x / dis.larghezzaPx) * 1000), Math.round((q.y / dis.altezzaPx) * 1000)]; })(),
      })),
      misura_utente: d.stile === "catastale" ? { locale: sogg.nome, asse: "x", valore_cm: sogg.netto.x1 - sogg.netto.x0 } : null,
    };
    writeFileSync(join(OUT, `${d.id}.json`), JSON.stringify(verita, null, 1));
    indice.push(d.id);
    console.log(`${file}  ${pianta.stanze.length} stanze, ${pianta.aperture.length} aperture`);
  }
  for (const t of DESCRIZIONI) {
    writeFileSync(join(OUT, `${t.id}.json`), JSON.stringify({ id: t.id, ingresso: "descrizione", stile: "testo", testo: t.testo, locali: t.locali, aperture: null, misura_utente: null }, null, 1));
    indice.push(t.id);
  }
  writeFileSync(join(OUT, "indice.json"), JSON.stringify(indice, null, 1));
  await browser.close();
}

main();
