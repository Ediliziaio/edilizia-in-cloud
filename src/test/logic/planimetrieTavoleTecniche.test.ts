import { describe, expect, it } from "vitest";
import { verificheTavolaTecnica } from "@/lib/planimetrie/analisiTavola";
import { analizzaRasterTavola, aperturaCopertaDaiCanali, leggiDatiHvac, scalaRasterHvacDiscordante, type TavolaTecnica } from "@/lib/planimetrie/tavolaTecnica";
import { rilevaSullaTavola } from "@/lib/planimetrie/rilevaTavola";
import type { PlanText } from "@/lib/preventivi/planReading";
import { verificheLetturaValide } from "../../../shared/planimetrie/letturaTipi.ts";

const testo = (text: string, x: number, y: number, w = 0.06, h = 0.016): PlanText => ({ text, confidence: 0.98, bbox: [x, y, w, h] });
const intera = { x: 0, y: 0, larghezza: 1, altezza: 1 };
const nero = [30, 30, 30];
const blu = [30, 130, 194];
const rosso = [208, 108, 99];

function disegno(w: number, h: number) {
  const pixel = new Uint8ClampedArray(w * h * 4).fill(255);
  return {
    pixel,
    rettangolo(x: number, y: number, larghezza: number, altezza: number, tinta = nero) {
      for (let riga = y; riga < y + altezza; riga++) {
        for (let colonna = x; colonna < x + larghezza; colonna++) pixel.set(tinta, (riga * w + colonna) * 4);
      }
    },
  };
}

describe("analisi delle tavole tecniche", () => {
  it("conserva due portate con didascalia identica e segnala le sezioni prive di una lettura certa", () => {
    const righe = [
      testo("CABIN-3", 0.12, 0.15), testo("(300 CFM)", 0.12, 0.17),
      testo("(300 CFM)", 0.121, 0.171),
      testo("CABIN-3", 0.44, 0.15), testo("(300 CFM)", 0.44, 0.17),
      testo("CONFERENCE", 0.6, 0.21), testo("ROOM", 0.6, 0.23), testo("(800 CFM)", 0.6, 0.25),
      testo("STORAGE (100 CFM)", 0.8, 0.62, 0.15),
      testo("S.A. 600x300", 0.4, 0.32), testo("S.A. 600x300", 0.5, 0.32),
      testo("R.A. 600x300", 0.7, 0.48), testo("S.A. 600x30îŚš", 0.2, 0.32), testo("A. 600x300", 0.7, 0.32),
      testo("AHU", 0.86, 0.22), testo("RETURN AIR GRILLE", 0.1, 0.88), testo("AHU", 0.1, 0.94),
    ];
    const area = { ...intera, y: 0.1, altezza: 0.68 };
    const dati = leggiDatiHvac(righe, area);
    expect(dati.portate.map((p) => [p.nome, p.cfm])).toEqual([["CABIN-3", 300], ["CABIN-3", 300], ["CONFERENCE ROOM", 800], ["STORAGE", 100]]);
    expect(dati.portate[0].zona).not.toEqual(dati.portate[1].zona);
    expect(dati.sezioni).toEqual([
      { rete: "mandata", larghezzaMm: 600, altezzaMm: 300, letture: 2 },
      { rete: "ripresa", larghezzaMm: 600, altezzaMm: 300, letture: 1 },
    ]);
    expect(dati.sigleDaVerificare).toBe(2);
    expect(dati.unitaTrattamentoAria?.x).toBe(0.86);
    expect(dati.simboli).toEqual(["Griglia di ripresa"]);
    const lettura = verificheTavolaTecnica({
      tipo: "hvac", area, raster: { pixel: new Uint8Array(), larghezza: 1, altezza: 1 },
      colori: null, segniEsclusi: null, codiceMandata: 0, dati,
    }, false);
    expect(lettura?.verifiche?.find((v) => v.id === "hvac-etichetta-1")?.zoneFoto).toHaveLength(2);
    expect(verificheLetturaValide(lettura?.verifiche)).toBe(true);
  });

  it("riconosce quote in millimetri soltanto con campate coerenti e unità dichiarata", () => {
    const area = { ...intera, y: 0.12, altezza: 0.7 };
    const orizzontali = [testo("30000", 0.48, 0.04), ...[0.2, 0.4, 0.6, 0.8].map(x => testo("7500", x, 0.065))];
    const verticali = [testo("12000", 0.03, 0.43), testo("6000", 0.05, 0.26), testo("6000", 0.05, 0.55)];
    const unita = testo("ALL DIMENSIONS ARE IN MILLIMETERS", 0.68, 0.94);
    const dati = leggiDatiHvac([...orizzontali, unita], area, verticali);
    expect(dati.orizzontale).toMatchObject({ totaleMm: 30000, campateMm: [7500, 7500, 7500, 7500] });
    expect(dati.verticale).toMatchObject({ totaleMm: 12000, campateMm: [6000, 6000] });
    expect(leggiDatiHvac(orizzontali, area, verticali).orizzontale).toBeNull();
    expect(leggiDatiHvac([...orizzontali.slice(0, -1), unita], area, verticali.slice(0, -1)).verticale).toBeNull();
    const tavola: Extract<TavolaTecnica, { tipo: "hvac" }> = {
      tipo: "hvac", area, colori: null, segniEsclusi: null, codiceMandata: 0, dati,
      raster: { larghezza: 1450, altezza: 800, pixel: new Uint8Array() },
    };
    expect(scalaRasterHvacDiscordante(tavola)).toBe(false);
    expect(scalaRasterHvacDiscordante({ ...tavola, raster: { ...tavola.raster, larghezza: 2175 } })).toBe(true);
  });

  it("lascia i muri sulla base e scarta i tratti colorati e le aperture coperte", () => {
    const w = 700, h = 500;
    const d = disegno(w, h);
    d.rettangolo(50, 50, 610, 5);
    d.rettangolo(50, 370, 610, 5);
    d.rettangolo(50, 53, 7, 319);
    d.rettangolo(130, 101, 421, 14);
    d.rettangolo(130, 103, 420, 10, blu);
    d.rettangolo(300, 285, 220, 15, rosso);
    d.rettangolo(20, 430, 51, 9, rosso); // Swatch of the supply duct in this legend.
    const righe = [testo("SUPPLY AIR DUCT", 0.12, 0.860)];
    const tavola = analizzaRasterTavola(d.pixel, w, h, righe);
    expect(tavola.tipo).toBe("hvac");
    if (tavola.tipo !== "hvac") throw new Error("Tavola HVAC attesa.");
    expect(tavola.codiceMandata).toBe(2);
    expect(tavola.raster.pixel[101 * w + 250]).toBe(0);
    expect(tavola.raster.pixel[51 * w + 250]).toBe(1);
    expect(aperturaCopertaDaiCanali({ x: .3, y: .2, larghezza: .04, altezza: .036 }, tavola)).toBe(true);
    expect(aperturaCopertaDaiCanali({ x: .3, y: .1, larghezza: .04, altezza: .02 }, tavola)).toBe(false);
    const muri = rilevaSullaTavola(tavola.raster, []).filter(m => m.tipo === "muro");
    expect(muri.some((m) => Math.abs(m.tratto!.da.y - .1) < .01)).toBe(true);
    expect(muri.some((m) => Math.abs(m.tratto!.da.y - .215) < .02)).toBe(false);
  });

  it("propone il ritaglio solo con una separazione e più gruppi grafici laterali", () => {
    const w = 1000, h = 700;
    const d = disegno(w, h);
    for (let y = 200; y < 580; y += 44) d.rettangolo(90, y, 540, 8);
    expect(analizzaRasterTavola(d.pixel, w, h, []).tipo).toBe("ordinaria");
    for (const su of [107, 310, 490]) {
      for (let y = su; y < su + 115; y += 27) d.rettangolo(750, y, 191, 10);
    }
    const tavola = analizzaRasterTavola(d.pixel, w, h, []);
    expect(tavola.tipo).toBe("composita");
    if (tavola.tipo !== "composita") throw new Error("Tavola composita attesa.");
    expect(tavola.area.x + tavola.area.larghezza).toBeGreaterThan(.63);
    expect(tavola.area.x + tavola.area.larghezza).toBeLessThan(.75);
    expect(verificheTavolaTecnica(tavola, false)).toBeUndefined();
    expect(verificheTavolaTecnica(tavola, true)?.verifiche?.[0]?.zoneFoto).toEqual([tavola.area]);
  });
});
