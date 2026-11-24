import { describe, expect, it } from "vitest";
import { scenaEdificio, type PianoPer3D } from "./edificio";
import type { PiantaPer3D } from "./tipi";

function piano(id: string, quota: number): PianoPer3D {
  const lati = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 400 }, { x: 0, y: 400 }];
  const pianta: PiantaPer3D = {
    muri: lati.map((a, i) => ({ id: `${id}-m${i}`, a, b: lati[(i + 1) % 4], spessore: 20, altezza: 280, stato: "esistente" })),
    aperture: [],
    locali: [{ id: `${id}-l`, nome: "Soggiorno", contorno: [{ x: 10, y: 10 }, { x: 590, y: 10 }, { x: 590, y: 390 }, { x: 10, y: 390 }], altezza: 280, destinazione: "soggiorno" }],
    elementi: [],
  };
  return { id, nome: id, quota, piante: { fatto: pianta, progetto: pianta } };
}

describe("edificio intero da fuori", () => {
  it("i soffitti si vedono anche da sopra: fanno da tetto piano", () => {
    const s = scenaEdificio([piano("pt", 0), piano("p1", 300)], { soffitto: true });
    const soffitti = s.mesh.filter((m) => m.genere === "soffitto");
    expect(soffitti.length).toBe(2);
    expect(soffitti.every((m) => s.materiali[m.materiale]?.doppioLato)).toBe(true);
  });
});
