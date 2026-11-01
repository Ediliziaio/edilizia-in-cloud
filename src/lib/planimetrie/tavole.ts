/**
 * Tavole (fase 8): al PDF della pianta si accodano i fogli dei prospetti e della sezione, in scala
 * vera e vettoriali, con titolo, scala e numero del foglio. Stampati al 100% si misurano col righello.
 *
 * L'impaginazione (`impaginaDisegni`) è pura e si prova senza pdf-lib; pdf-lib si carica solo quando serve.
 */
import type { Disegno2D } from "./prospetti";

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

const STILE: Record<string, { fill: string | null; stroke: string; width: number; dash?: number[] }> = {
  muro: { fill: "#ffffff", stroke: "#0f172a", width: 0.5 },
  muro_lontano: { fill: "#f8fafc", stroke: "#94a3b8", width: 0.3 },
  taglio: { fill: "#1e293b", stroke: "#0f172a", width: 0.5 },
  vano: { fill: "#ffffff", stroke: "#64748b", width: 0.3 },
  vetro: { fill: "#e0f2fe", stroke: "#0f172a", width: 0.35 },
  porta: { fill: "#f1f5f9", stroke: "#0f172a", width: 0.35 },
  terra: { fill: null, stroke: "#0f172a", width: 0.7 },
  quota: { fill: null, stroke: "#0f766e", width: 0.25 },
  solaio: { fill: null, stroke: "#475569", width: 0.35, dash: [2, 1.5] },
};

/** Testo sicuro per i font standard del PDF (WinAnsi): niente caratteri che pdf-lib rifiuta. */
const ansi = (s: string) => s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

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
    p.drawText(ansi("Misure in metri. Stampare al 100% (senza adattare alla pagina) per misurare col righello."), { x: MARGINE * PT, y: (MARGINE + 1) * PT, size: 7, font: normale, color: col("#64748b") });
    return p;
  });

  const k = 10 / imp.scala; // cm → mm
  for (const posto of imp.posti) {
    const d = disegni[posto.indice];
    const pagina = pagine[posto.foglio];
    const X = (u: number) => (posto.x + BORDO_DISEGNO + (u - d.minU) * k) * PT;
    const Y = (z: number) => (H - (posto.y + BORDO_DISEGNO + (d.maxZ - z) * k)) * PT;
    for (const pr of d.primitive) {
      const st = STILE[pr.stile] ?? STILE.muro;
      if (pr.tipo === "rett") {
        pagina.drawRectangle({
          x: X(pr.u1), y: Y(pr.z1), width: (pr.u2 - pr.u1) * k * PT, height: (pr.z2 - pr.z1) * k * PT,
          ...(st.fill ? { color: col(st.fill) } : {}), borderColor: col(st.stroke), borderWidth: st.width * PT * 0.6,
        });
        if (pr.stile === "porta") pagina.drawLine({ start: { x: X(pr.u1), y: Y(pr.z2) }, end: { x: X((pr.u1 + pr.u2) / 2), y: Y(pr.z1) }, thickness: 0.3, color: col("#94a3b8") });
      } else if (pr.tipo === "linea") {
        pagina.drawLine({ start: { x: X(pr.a.u), y: Y(pr.a.z) }, end: { x: X(pr.b.u), y: Y(pr.b.z) }, thickness: st.width * PT * 0.6, color: col(st.stroke), ...(st.dash ? { dashArray: st.dash.map((v) => v * PT) } : {}) });
      } else {
        const titolo = pr.stile === "titolo";
        const size = titolo ? 9 : 6.5;
        const testo = ansi(titolo ? pr.testo.toUpperCase() : pr.testo);
        const font = titolo ? grassetto : normale;
        const larghezza = font.widthOfTextAtSize(testo, size);
        pagina.drawText(testo, { x: titolo ? X(pr.u) : X(pr.u) - larghezza / 2, y: Y(pr.z), size, font, color: col(titolo ? "#0f172a" : "#0f766e") });
      }
    }
  }
  return { dati: await doc.save(), scala: imp.scala, fogli: imp.fogli };
}
