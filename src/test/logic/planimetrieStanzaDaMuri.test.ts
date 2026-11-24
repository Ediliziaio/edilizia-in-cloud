import { describe, expect, it } from "vitest";
import { segmentiDaTracciato, stanzaDaMuri } from "@/components/planimetrie/editor/stanzaDaMuri";

const muro = (x1: number, y1: number, x2: number, y2: number, spessore = 30) => ({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore });
// Due stanze 4 × 3 m affiancate, muri da 30 cm sugli assi.
const pareti = [muro(0, 0, 800, 0), muro(0, 300, 800, 300), muro(0, 0, 0, 300), muro(400, 0, 400, 300), muro(800, 0, 800, 300)];

describe("stanza dai muri", () => {
  it("un clic dentro chiude la stanza lungo il filo interno", () => {
    const e = stanzaDaMuri(pareti, { x: 200, y: 150 });
    expect("punti" in e).toBe(true);
    if (!("punti" in e)) return;
    expect(e.punti).toHaveLength(4);
    // filo interno: 15 cm dentro gli assi da ogni lato → 3,70 × 2,70 = 9,99 m² (griglia da 5 cm)
    expect(e.areaMq).toBeCloseTo(9.99, 0);
    expect(e.varcoChiusoCm).toBe(0);
  });

  it("un varco di 80 cm nel muro (porta senza parete nel DWG) si chiude da solo", () => {
    const conVarco = [...pareti.filter((m) => !(m.p1.x === 0 && m.p2.x === 0)), muro(0, 0, 0, 100), muro(0, 180, 0, 300)];
    const e = stanzaDaMuri(conVarco, { x: 200, y: 150 });
    expect("punti" in e && e.varcoChiusoCm).toBeGreaterThan(0);
    expect("punti" in e && e.areaMq).toBeGreaterThan(9);
  });

  it("dove mancano i muri, chiude con le linee della tavola DWG", () => {
    const pochi = [muro(0, 0, 400, 0), muro(0, 0, 0, 300)];
    expect("errore" in stanzaDaMuri(pochi, { x: 200, y: 150 })).toBe(true);
    const linee = segmentiDaTracciato("M400 0L400 300L0 300");
    const e = stanzaDaMuri(pochi, { x: 200, y: 150 }, linee);
    expect("punti" in e && e.areaMq).toBeGreaterThan(10);
  });

  it("fuori dall'edificio non chiude una stanza contro le linee lontane della tavola", () => {
    const lontane = segmentiDaTracciato("M-5000 -5000L5000 -5000L5000 5000L-5000 5000Z");
    const e = stanzaDaMuri(pareti, { x: 900, y: 150 }, lontane);
    expect("errore" in e).toBe(true);
  });

  it("legge i tracciati SVG della tavola, relativi e assoluti", () => {
    expect(segmentiDaTracciato("M0 0l10 0v5h-10z")).toEqual([
      [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 10, y: 0 }, { x: 10, y: 5 }], [{ x: 10, y: 5 }, { x: 0, y: 5 }], [{ x: 0, y: 5 }, { x: 0, y: 0 }],
    ]);
  });

  it("dice perché non può: su una parete, fuori, o pareti troppo aperte", () => {
    expect(stanzaDaMuri(pareti, { x: 400, y: 150 })).toEqual({ errore: "Hai cliccato su una parete: clicca dentro la stanza." });
    expect(stanzaDaMuri(pareti, { x: 5000, y: 150 })).toEqual({ errore: "Clicca dentro una stanza, fra le pareti." });
    const aperte = [muro(0, 0, 800, 0), muro(0, 0, 0, 300)];
    expect("errore" in stanzaDaMuri(aperte, { x: 200, y: 150 })).toBe(true);
  });
});
