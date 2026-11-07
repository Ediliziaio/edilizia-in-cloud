/**
 * Tavole (fase 8): al PDF della pianta si accodano i fogli dei prospetti e della sezione, in scala
 * vera e vettoriali, con titolo, scala e numero del foglio. Stampati al 100% si misurano col righello.
 *
 * L'impaginazione (`impaginaDisegni`) è pura e si prova senza pdf-lib; pdf-lib si carica solo quando serve.
 */
import { STILE_DISEGNO, type Disegno2D } from "./prospetti";
import type { StatoPianta } from "../../../shared/planimetrie/modello.ts";
import { metriConSfrido, percorsiImpianti } from "../../../shared/planimetrie/impianti.ts";

export type Foglio = "A4" | "A3";

/** Fogli orizzontali in mm. */
const FOGLI: Record<Foglio, { larghezza: number; altezza: number }> = {
  A4: { larghezza: 297, altezza: 210 },
  A3: { larghezza: 420, altezza: 297 },
};
const MARGINE = 10;
const TESTATA = 12; // riga in alto con il titolo del foglio
const PIEDE = 8;
const SPAZIO = 8; // fra un disegno e l'altro
const BORDO_DISEGNO = 4; // aria attorno al disegno dentro la sua cella
const SCALE = [50, 100, 200] as const;
const PT = 72 / 25.4;

export interface Posto {
  indice: number;
  foglio: number;
  /** Angolo in alto a sinistra della cella, in mm dal bordo in alto a sinistra del foglio. */
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
}

export interface Impaginato {
  scala: number;
  fogli: number;
  posti: Posto[];
  foglio: { larghezza: number; altezza: number };
}

const misuraMm = (d: Disegno2D, scala: number) => ({
  larghezza: ((d.maxU - d.minU) * 10) / scala + 2 * BORDO_DISEGNO,
  altezza: ((d.maxZ - d.minZ) * 10) / scala + 2 * BORDO_DISEGNO,
});

/**
 * Mette i disegni sui fogli a righe, nell'ordine dato. La scala è la più grande fra 1:50, 1:100 e
 * 1:200 a cui ogni disegno entra in un foglio; la stessa per tutti, così si confrontano a occhio.
 */
export function impaginaDisegni(disegni: Disegno2D[], formato: Foglio = "A3", scalaVoluta?: number): Impaginato {
  const foglio = FOGLI[formato];
  const areaL = foglio.larghezza - 2 * MARGINE;
  const areaA = foglio.altezza - 2 * MARGINE - TESTATA - PIEDE;
  const candidate = scalaVoluta ? [scalaVoluta, ...SCALE.filter((s) => s > scalaVoluta)] : [...SCALE];
  const scala = candidate.find((s) => disegni.every((d) => { const m = misuraMm(d, s); return m.larghezza <= areaL && m.altezza <= areaA; }))
    ?? Math.ceil(Math.max(...disegni.map((d) => Math.max(((d.maxU - d.minU) * 10) / (areaL - 2 * BORDO_DISEGNO), ((d.maxZ - d.minZ) * 10) / (areaA - 2 * BORDO_DISEGNO))), 1) / 50) * 50;

  const posti: Posto[] = [];
  let f = 0, x = 0, y = 0, altezzaRiga = 0;
  disegni.forEach((d, indice) => {
    const m = misuraMm(d, scala);
    if (x > 0 && x + m.larghezza > areaL) { x = 0; y += altezzaRiga + SPAZIO; altezzaRiga = 0; }
    if (y > 0 && y + m.altezza > areaA) { f++; x = 0; y = 0; altezzaRiga = 0; }
    posti.push({ indice, foglio: f, x: MARGINE + x, y: MARGINE + TESTATA + y, larghezza: m.larghezza, altezza: m.altezza });
    x += m.larghezza + SPAZIO;
    altezzaRiga = Math.max(altezzaRiga, m.altezza);
  });
  return { scala, fogli: disegni.length ? f + 1 : 0, posti, foglio };
}

type Rgb = { r: number; g: number; b: number };
const hex = (c: string): Rgb => {
  const n = parseInt(c.replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

/** Testo sicuro per i font standard del PDF (WinAnsi): niente caratteri che pdf-lib rifiuta. */
const ansi = (s: string) => s.replace(/[–—−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export interface OpzioniTavole {
  formato?: Foglio;
  scala?: number;
  /** Riga in testa a ogni foglio, es. «Appartamento Rossi — Piano terra». */
  intestazione: string;
  /** Il primo foglio di tavola porta questo numero (dopo la pianta: 2). */
  primoNumero?: number;
  totaleFogli?: number;
}

/** Accoda al PDF (se c'è) i fogli con i disegni; senza PDF di partenza ne crea uno nuovo. */
export async function accodaTavole(pdf: Uint8Array | null, disegni: Disegno2D[], o: OpzioniTavole): Promise<{ dati: Uint8Array; scala: number; fogli: number }> {
  const lib = await import("pdf-lib");
  const doc = pdf ? await lib.PDFDocument.load(pdf) : await lib.PDFDocument.create();
  const imp = impaginaDisegni(disegni, o.formato ?? "A3", o.scala);
  const normale = await doc.embedFont(lib.StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  const W = imp.foglio.larghezza, H = imp.foglio.altezza;
  const primo = o.primoNumero ?? doc.getPageCount() + 1;
  const totale = o.totaleFogli ?? primo - 1 + imp.fogli;
  const col = (c: string) => { const v = hex(c); return lib.rgb(v.r, v.g, v.b); };

  const pagine = Array.from({ length: imp.fogli }, (_, i) => {
    const p = doc.addPage([W * PT, H * PT]);
    // y del PDF parte dal basso: si converte da mm dall'alto
    p.drawRectangle({ x: (MARGINE - 3) * PT, y: (MARGINE - 3) * PT, width: (W - 2 * MARGINE + 6) * PT, height: (H - 2 * MARGINE + 6) * PT, borderColor: col("#111111"), borderWidth: 0.5 });
    p.drawText(ansi(o.intestazione), { x: MARGINE * PT, y: (H - MARGINE - 6) * PT, size: 10, font: grassetto, color: col("#0f172a"), maxWidth: (W - 2 * MARGINE - 60) * PT });
    p.drawText(ansi(`Prospetti e sezioni - scala 1:${imp.scala}`), { x: (W - MARGINE - 70) * PT, y: (H - MARGINE - 6) * PT, size: 8, font: normale, color: col("#475569") });
    p.drawText(ansi(`Foglio ${primo + i} di ${totale}`), { x: (W - MARGINE - 30) * PT, y: (MARGINE + 1) * PT, size: 7, font: normale, color: col("#64748b") });
    p.drawText(ansi("Quote senza unità in cm; quote di livello e misure con 'm' in metri. Stampare al 100% (senza adattare alla pagina)."), { x: MARGINE * PT, y: (MARGINE + 1) * PT, size: 7, font: normale, color: col("#64748b") });
    return p;
  });

  const k = 10 / imp.scala; // cm → mm
  for (const posto of imp.posti) {
    const d = disegni[posto.indice];
    const pagina = pagine[posto.foglio];
    const X = (u: number) => (posto.x + BORDO_DISEGNO + (u - d.minU) * k) * PT;
    const Y = (z: number) => (H - (posto.y + BORDO_DISEGNO + (d.maxZ - z) * k)) * PT;
    for (const pr of d.primitive) {
      const st = STILE_DISEGNO[pr.stile] ?? STILE_DISEGNO.muro;
      const fill = st.fill !== "none" ? { color: col(st.fill) } : {};
      const dash = st.dash ? { dashArray: st.dash.split(" ").map((v) => Number(v) * PT) } : {};
      if (pr.tipo === "rett") {
        pagina.drawRectangle({
          x: X(pr.u1), y: Y(pr.z1), width: (pr.u2 - pr.u1) * k * PT, height: (pr.z2 - pr.z1) * k * PT,
          ...fill, ...dash, borderColor: col(st.stroke), borderWidth: st.width * PT * 0.6,
        });
        if (pr.stile === "porta") pagina.drawLine({ start: { x: X(pr.u1), y: Y(pr.z2) }, end: { x: X((pr.u1 + pr.u2) / 2), y: Y(pr.z1) }, thickness: 0.3, color: col("#94a3b8") });
      } else if (pr.tipo === "poligono") {
        // drawSvgPath ribalta la y: i punti vanno dati con la y cambiata di segno
        const path = pr.punti.map((q, i) => `${i ? "L" : "M"} ${X(q.u).toFixed(2)} ${(-Y(q.z)).toFixed(2)}`).join(" ") + " Z";
        pagina.drawSvgPath(path, { x: 0, y: 0, ...fill, ...dash, borderColor: col(st.stroke), borderWidth: st.width * PT * 0.6 });
      } else if (pr.tipo === "linea") {
        pagina.drawLine({ start: { x: X(pr.a.u), y: Y(pr.a.z) }, end: { x: X(pr.b.u), y: Y(pr.b.z) }, thickness: st.width * PT * 0.6, color: col(st.stroke), ...dash });
      } else {
        const titolo = pr.stile === "titolo", etichetta = pr.stile === "etichetta";
        const size = titolo ? 9 : 6.5;
        const testo = ansi(titolo ? pr.testo.toUpperCase() : pr.testo);
        const font = titolo ? grassetto : normale;
        const larghezza = font.widthOfTextAtSize(testo, size);
        const scarto = titolo ? 0 : pr.ancora === "fine" ? larghezza : larghezza / 2;
        pagina.drawText(testo, {
          x: pr.ruota ? X(pr.u) : X(pr.u) - scarto,
          y: pr.ruota ? Y(pr.z) - scarto : Y(pr.z),
          ...(pr.ruota ? { rotate: lib.degrees(90) } : {}),
          size, font, color: col(titolo || etichetta ? "#0f172a" : "#0f766e"),
        });
      }
    }
  }
  return { dati: await doc.save(), scala: imp.scala, fogli: imp.fogli };
}

// ─── Foglio impianti ─────────────────────────────────────────────────────────


/** Sigle dei punti impianto sul foglio (come negli schemi a mano). */
export const SIGLE_IMPIANTI: Record<string, { sigla: string; nome: string; colore: string }> = {
  quadro_elettrico: { sigla: "Q", nome: "Quadro elettrico", colore: "#dc2626" },
  presa: { sigla: "P", nome: "Presa", colore: "#dc2626" },
  interruttore: { sigla: "I", nome: "Interruttore", colore: "#dc2626" },
  punto_luce: { sigla: "L", nome: "Punto luce", colore: "#dc2626" },
  collettore: { sigla: "C", nome: "Collettore acqua", colore: "#2563eb" },
  punto_acqua: { sigla: "A", nome: "Punto acqua", colore: "#2563eb" },
  scarico: { sigla: "S", nome: "Scarico", colore: "#92400e" },
  colonna_scarico: { sigla: "K", nome: "Colonna di scarico", colore: "#92400e" },
  split: { sigla: "SP", nome: "Split clima", colore: "#0891b2" },
  unita_esterna: { sigla: "UE", nome: "Unità esterna", colore: "#0891b2" },
  termosifone: { sigla: "T", nome: "Termosifone", colore: "#ea580c" },
  caldaia: { sigla: "CA", nome: "Caldaia", colore: "#ea580c" },
  pompa_calore: { sigla: "PdC", nome: "Pompa di calore", colore: "#ea580c" },
  bollitore: { sigla: "B", nome: "Bollitore", colore: "#2563eb" },
  inverter: { sigla: "INV", nome: "Inverter fotovoltaico", colore: "#16a34a" },
  batteria_accumulo: { sigla: "BAT", nome: "Batteria di accumulo", colore: "#16a34a" },
  wallbox: { sigla: "W", nome: "Wallbox", colore: "#16a34a" },
  termostato: { sigla: "TA", nome: "Termostato", colore: "#ea580c" },
  vmc: { sigla: "V", nome: "VMC", colore: "#0891b2" },
};

const COLORE_LINEA: Record<string, string> = { elettrica: "#dc2626", acqua: "#2563eb", scarico: "#92400e", frigorifera: "#0891b2", condensa: "#65a30d", riscaldamento: "#ea580c" };
const NOME_LINEA: Record<string, string> = { elettrica: "Linee elettriche", acqua: "Acqua fredda e calda", scarico: "Scarichi", frigorifera: "Rame clima", condensa: "Condensa", riscaldamento: "Riscaldamento" };

/** Accoda un foglio con la pianta, i punti impianto, le linee stimate, legenda e metri. */
export async function accodaFoglioImpianti(pdf: Uint8Array | null, stato: StatoPianta, o: { formato?: Foglio; intestazione: string; numero?: number }): Promise<{ dati: Uint8Array; punti: number } | null> {
  const punti = stato.elementi.filter((e) => SIGLE_IMPIANTI[e.tipo] && e.stato !== "da_demolire");
  if (!punti.length) return null;
  const lib = await import("pdf-lib");
  const doc = pdf ? await lib.PDFDocument.load(pdf) : await lib.PDFDocument.create();
  const normale = await doc.embedFont(lib.StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  const f = FOGLI[o.formato ?? "A3"];
  const W = f.larghezza, H = f.altezza;
  const col = (c: string) => { const v = hex(c); return lib.rgb(v.r, v.g, v.b); };
  const p = doc.addPage([W * PT, H * PT]);
  const LEGENDA = 85; // mm a destra
  const area = { x: MARGINE, y: MARGINE + TESTATA, w: W - 2 * MARGINE - LEGENDA - 5, h: H - 2 * MARGINE - TESTATA - PIEDE };
  p.drawRectangle({ x: (MARGINE - 3) * PT, y: (MARGINE - 3) * PT, width: (W - 2 * MARGINE + 6) * PT, height: (H - 2 * MARGINE + 6) * PT, borderColor: col("#111111"), borderWidth: 0.5 });
  p.drawText(ansi(o.intestazione), { x: MARGINE * PT, y: (H - MARGINE - 6) * PT, size: 10, font: grassetto, color: col("#0f172a"), maxWidth: (W - 2 * MARGINE - 80) * PT });
  p.drawText(ansi("Impianti - punti e linee stimate"), { x: (W - MARGINE - 70) * PT, y: (H - MARGINE - 6) * PT, size: 8, font: normale, color: col("#475569") });

  // scala: tutta la pianta dentro l'area, al passo standard più grande che entra
  const xs = [...stato.muri.flatMap((m) => [m.p1.x, m.p2.x]), ...punti.map((e) => e.posizione.x)];
  const ys = [...stato.muri.flatMap((m) => [m.p1.y, m.p2.y]), ...punti.map((e) => e.posizione.y)];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const serve = Math.max(((maxX - minX) * 10) / area.w, ((maxY - minY) * 10) / area.h, 1);
  const scala = [20, 25, 50, 100, 200, 500].find((s) => s >= serve) ?? Math.ceil(serve / 100) * 100;
  const k = 10 / scala;
  // y del modello in su: più grande = più in alto sul foglio
  const X = (x: number) => (area.x + (x - minX) * k + (area.w - (maxX - minX) * k) / 2) * PT;
  const Y = (y: number) => (H - area.y - area.h + (y - minY) * k + (area.h - (maxY - minY) * k) / 2) * PT;

  for (const m of stato.muri) {
    if (m.stato === "da_demolire") continue;
    p.drawLine({ start: { x: X(m.p1.x), y: Y(m.p1.y) }, end: { x: X(m.p2.x), y: Y(m.p2.y) }, thickness: Math.max(0.6, m.spessore * k * PT), color: col("#cbd5e1") });
  }
  const { percorsi, mancano } = percorsiImpianti(stato);
  for (const r of percorsi) {
    const c = col(COLORE_LINEA[r.linea] ?? "#64748b");
    const angolo = { x: X(r.a.x), y: Y(r.da.y) };
    p.drawLine({ start: { x: X(r.da.x), y: Y(r.da.y) }, end: angolo, thickness: 0.6, color: c, dashArray: [3, 2] });
    p.drawLine({ start: angolo, end: { x: X(r.a.x), y: Y(r.a.y) }, thickness: 0.6, color: c, dashArray: [3, 2] });
  }
  for (const e of punti) {
    const s = SIGLE_IMPIANTI[e.tipo];
    const cx = X(e.posizione.x), cy = Y(e.posizione.y);
    p.drawCircle({ x: cx, y: cy, size: 5.5, color: lib.rgb(1, 1, 1), borderColor: col(s.colore), borderWidth: 0.8 });
    const w = grassetto.widthOfTextAtSize(s.sigla, 5);
    p.drawText(s.sigla, { x: cx - w / 2, y: cy - 1.8, size: 5, font: grassetto, color: col(s.colore) });
  }

  // legenda e metri
  let y = H - MARGINE - TESTATA - 4;
  const lx = (W - MARGINE - LEGENDA) * PT;
  const riga = (testo: string, colore = "#0f172a", font = normale, size = 7) => { p.drawText(ansi(testo), { x: lx, y: y * PT, size, font, color: col(colore), maxWidth: LEGENDA * PT }); y -= size * 0.55; };
  riga("Legenda", "#0f172a", grassetto, 9); y -= 1;
  const conta = new Map<string, number>();
  for (const e of punti) conta.set(e.tipo, (conta.get(e.tipo) ?? 0) + 1);
  for (const [tipo, n] of conta) riga(`${SIGLE_IMPIANTI[tipo].sigla}  ${SIGLE_IMPIANTI[tipo].nome}: ${n}`, SIGLE_IMPIANTI[tipo].colore);
  y -= 3;
  riga("Linee stimate (con 10% di sfrido)", "#0f172a", grassetto, 8);
  const tot = new Map<string, number>();
  for (const r of percorsi) tot.set(r.linea, (tot.get(r.linea) ?? 0) + r.lunghezzaCm);
  for (const [l, cm] of tot) riga(`${NOME_LINEA[l] ?? l}: ${metriConSfrido(cm).toLocaleString("it-IT")} m`, COLORE_LINEA[l]);
  if (mancano.length) { y -= 2; riga("Mancano le partenze: " + mancano.map((m) => SIGLE_IMPIANTI[m]?.nome ?? m).join(", "), "#b45309"); }
  y -= 3;
  riga("Percorsi indicativi a squadra lungo le pareti,", "#64748b");
  riga("con le calate in verticale: da verificare in cantiere.", "#64748b");
  p.drawText(ansi(`Scala 1:${scala}`), { x: MARGINE * PT, y: (MARGINE + 1) * PT, size: 7, font: normale, color: col("#64748b") });
  if (o.numero) p.drawText(ansi(`Foglio ${o.numero}`), { x: (W - MARGINE - 20) * PT, y: (MARGINE + 1) * PT, size: 7, font: normale, color: col("#64748b") });
  return { dati: await doc.save(), punti: punti.length };
}
