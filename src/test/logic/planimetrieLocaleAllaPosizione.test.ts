import { describe, expect, it } from "vitest";
import { localeAllaPosizione } from "@/lib/planimetrie/tred";
import type { PiantaPer3D, V3 } from "@/lib/planimetrie/tred/tipi";

// due stanze affiancate: soggiorno 0-4 m × 0-3 m, camera 4-7 m × 0-3 m (contorni in cm)
const rett = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const pianta = {
  locali: [
    { id: "sog", nome: "Soggiorno", destinazione: "soggiorno", contorno: rett(0, 0, 400, 300), altezza: 270 },
    { id: "cam", nome: "Camera", destinazione: "camera", contorno: rett(400, 0, 700, 300), altezza: 270 },
  ],
} as unknown as PiantaPer3D;

// la telecamera ha [x, altezza, y]: in pianta contano il primo e il terzo numero, in metri
const a = (x: number, y: number): V3 => [x, 1.6, y];

describe("in quale stanza si trova la telecamera", () => {
  it("riconosce la stanza dove si è, anche camminando da una all'altra", () => {
    expect(localeAllaPosizione(pianta, a(1, 1))).toBe("sog");
    expect(localeAllaPosizione(pianta, a(3.9, 2.9))).toBe("sog");
    expect(localeAllaPosizione(pianta, a(4.1, 1))).toBe("cam");
    expect(localeAllaPosizione(pianta, a(6.5, 0.2))).toBe("cam");
  });

  it("fuori da ogni stanza non inventa nulla", () => {
    expect(localeAllaPosizione(pianta, a(-1, 1))).toBeNull();
    expect(localeAllaPosizione(pianta, a(2, 3.5))).toBeNull();
    expect(localeAllaPosizione(pianta, a(8, 1))).toBeNull();
  });
});
