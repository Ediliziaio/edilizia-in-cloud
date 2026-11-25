import { describe, expect, it } from "vitest";
import { soloEdificio } from "@/lib/planimetrie/esporta";
import type { VistaPianta } from "@/lib/planimetrie/esporta";

const muro = (x1: number, y1: number, x2: number, y2: number) => ({ id: `${x1}${y1}`, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore: 30, stato: "esistente" as const });
const casa: VistaPianta = {
  titolo: "Piano terra", muri: [muro(0, 0, 1000, 0), muro(1000, 0, 1000, 800), muro(1000, 800, 0, 800), muro(0, 800, 0, 0)],
  aperture: [], locali: [], quote: [], testi: [],
  elementi: [
    { id: "scala", tipo: "scala", posizione: { x: 500, y: 880 }, larghezza: 100, profondita: 120 },
    { id: "albero", tipo: "albero", posizione: { x: 4000, y: 3000 }, larghezza: 300, profondita: 300 },
    { id: "piscina", tipo: "piscina", posizione: { x: 2500, y: 2000 }, larghezza: 500, profondita: 1000 },
  ],
};

describe("tavola del piano senza il lotto", () => {
  it("col lotto grande tiene la casa e quello che le sta a ridosso", () => {
    const lotto = { id: "l", tipo: "lotto", contorno: [{ x: -1000, y: -1000 }, { x: 5000, y: -1000 }, { x: 5000, y: 4000 }, { x: -1000, y: 4000 }] };
    const v = soloEdificio({ ...casa, aree: [lotto] });
    expect(v.aree).toEqual([]);
    expect(v.elementi.map((e) => e.id)).toEqual(["scala"]);
    expect(v.muri).toHaveLength(4);
  });
  it("senza lotto, o con un cortile appena più grande della casa, la vista resta quella", () => {
    expect(soloEdificio(casa)).toBe(casa);
    const cortile: VistaPianta = { ...casa, elementi: [], aree: [{ id: "c", tipo: "prato", contorno: [{ x: -200, y: -200 }, { x: 1200, y: -200 }, { x: 1200, y: 1000 }, { x: -200, y: 1000 }] }] };
    expect(soloEdificio(cortile)).toBe(cortile);
  });
});
