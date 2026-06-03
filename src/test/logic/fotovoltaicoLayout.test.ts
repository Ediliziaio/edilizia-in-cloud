import { describe, it, expect } from "vitest";
import {
  proiettaLayout,
  layoutToSvg,
  metriPerGradoLng,
  type PannelloGeo,
} from "@/lib/fotovoltaico/layout";

/**
 * Test della proiezione geo→SVG del layout reale pannelli
 * (src/lib/fotovoltaico/layout.ts). Esercita il CODICE DI PRODUZIONE che
 * disegnerà la disposizione vera (coordinate Google Solar API) al posto del mock.
 */

describe("metriPerGradoLng — correzione coseno-latitudine", () => {
  it("all'equatore ≈ 111320 m/grado, e diminuisce con la latitudine", () => {
    expect(metriPerGradoLng(0)).toBeCloseTo(111320, 0);
    expect(metriPerGradoLng(45)).toBeLessThan(metriPerGradoLng(0));
    expect(metriPerGradoLng(45)).toBeCloseTo(111320 * Math.SQRT1_2, 0);
    // a ~45° (Italia) il fattore è circa 0.707 dell'equatore
    expect(metriPerGradoLng(60)).toBeCloseTo(111320 * 0.5, 0);
  });
});

describe("proiettaLayout — proiezione dei pannelli", () => {
  it("lista vuota → viewport vuoto", () => {
    const out = proiettaLayout([]);
    expect(out).toEqual({ width: 0, height: 0, rects: [], count: 0 });
  });

  it("un pannello → un rettangolo, larghezza pari al target", () => {
    const out = proiettaLayout([{ centro_lat: 45, centro_lng: 9 }], { targetWidth: 600, margin: 10 });
    expect(out.count).toBe(1);
    expect(out.rects).toHaveLength(1);
    expect(out.width).toBe(600);
    // landscape default: w > h
    expect(out.rects[0].w).toBeGreaterThan(out.rects[0].h);
  });

  it("orientamento PORTRAIT scambia larghezza/altezza", () => {
    const land = proiettaLayout([{ centro_lat: 45, centro_lng: 9, orientamento: "LANDSCAPE" }]);
    const port = proiettaLayout([{ centro_lat: 45, centro_lng: 9, orientamento: "PORTRAIT" }]);
    expect(land.rects[0].w).toBeGreaterThan(land.rects[0].h);
    expect(port.rects[0].h).toBeGreaterThan(port.rects[0].w);
  });

  it("due pannelli affiancati in longitudine → due rettangoli separati in X, stessa Y", () => {
    const panels: PannelloGeo[] = [
      { centro_lat: 45, centro_lng: 9.0, segment_index: 0 },
      { centro_lat: 45, centro_lng: 9.00003, segment_index: 0 },
    ];
    const out = proiettaLayout(panels, { targetWidth: 600, margin: 10 });
    expect(out.count).toBe(2);
    const [a, b] = out.rects;
    expect(b.x).toBeGreaterThan(a.x); // il secondo è più a destra
    expect(a.y).toBeCloseTo(b.y, 1); // stessa quota verticale
  });

  it("preserva le proporzioni reali (stesso scale su X e Y)", () => {
    // griglia 3×2 di pannelli; il rapporto width/height del contenuto deve
    // riflettere lo span reale in metri (stesso fattore di scala sui due assi).
    const panels: PannelloGeo[] = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        panels.push({ centro_lat: 45 + r * 0.00002, centro_lng: 9 + c * 0.00003 });
      }
    }
    const out = proiettaLayout(panels, { targetWidth: 600, margin: 0 });
    const aspect = out.width / out.height;
    expect(aspect).toBeGreaterThan(1); // più largo che alto (3 colonne, 2 file)
    expect(out.rects).toHaveLength(6);
  });

  it("mantiene il segment_index per colorare le falde", () => {
    const out = proiettaLayout([
      { centro_lat: 45, centro_lng: 9, segment_index: 0 },
      { centro_lat: 45, centro_lng: 9.00003, segment_index: 2 },
    ]);
    expect(out.rects.map((r) => r.segment)).toEqual([0, 2]);
  });
});

describe("layoutToSvg — generazione SVG", () => {
  it("stringa vuota se non ci sono pannelli", () => {
    expect(layoutToSvg([])).toBe("");
  });

  it("produce un <svg> con un <rect> per pannello (+ sfondo)", () => {
    const panels: PannelloGeo[] = [
      { centro_lat: 45, centro_lng: 9, segment_index: 0 },
      { centro_lat: 45, centro_lng: 9.00003, segment_index: 1 },
      { centro_lat: 45.00002, centro_lng: 9, segment_index: 0 },
    ];
    const svg = layoutToSvg(panels);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox=");
    // 3 pannelli + 1 sfondo = 4 <rect
    expect(svg.match(/<rect/g) ?? []).toHaveLength(4);
    expect(svg).toContain("</svg>");
  });
});
