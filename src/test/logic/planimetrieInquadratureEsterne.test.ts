import { describe, expect, it } from "vitest";
import { inquadraturaEsterna, orbita } from "@/lib/planimetrie/tred/telecamera";

const limiti = { min: [0, 0, 0] as [number, number, number], max: [20, 10, 12] as [number, number, number] };

describe("inquadrature pronte dell'esterno", () => {
  it("dalla strada da sud e dal giardino da nord, all'altezza di una persona", () => {
    const strada = inquadraturaEsterna("strada", limiti), giardino = inquadraturaEsterna("giardino", limiti);
    expect(strada.posizione[2]).toBeGreaterThan(limiti.max[2]);
    expect(giardino.posizione[2]).toBeLessThan(limiti.min[2]);
    expect(strada.posizione[1]).toBeCloseTo(2.2);
  });
  it("a volo d'uccello sta in alto, fuori dall'edificio, e guarda il centro", () => {
    const volo = inquadraturaEsterna("volo", limiti);
    expect(volo.posizione[1]).toBeGreaterThan(limiti.max[1]);
    expect(volo.guarda).toEqual([10, 5, 6]);
  });
  it("il giro torna al punto di partenza e a metà sta dall'altra parte", () => {
    const t = { posizione: [10, 5, 0] as [number, number, number], guarda: [0, 0, 0] as [number, number, number], fov: 45 };
    expect(orbita(t, 1).posizione.map((v) => Math.round(v * 1000) / 1000 + 0)).toEqual([10, 5, 0]);
    expect(orbita(t, .5).posizione.map((v) => Math.round(v * 1000) / 1000 + 0)).toEqual([-10, 5, 0]);
  });
});
