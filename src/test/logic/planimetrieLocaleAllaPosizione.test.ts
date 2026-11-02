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

import { passoLibero } from "@/lib/planimetrie/tred";

describe("camminare nel 3D: i muri bloccano, le porte no", () => {
  // muro verticale fra soggiorno e camera a x = 4 m, lungo y da 0 a 3 m; porta larga 90 cm al centro (y = 1,5 m);
  // finestra larga 100 cm a y = 0,5 m... non conta: le finestre non si attraversano
  const p = {
    locali: [],
    muri: [
      { id: "m1", a: { x: 400, y: 0 }, b: { x: 400, y: 300 }, spessore: 10, altezza: 270, stato: "esistente" },
      { id: "m2", a: { x: 0, y: 300 }, b: { x: 700, y: 300 }, spessore: 30, altezza: 270, stato: "esistente" },
    ],
    aperture: [
      { id: "a1", muroId: "m1", tipo: "porta", posizione: 150, larghezza: 90, altezza: 210, davanzale: 0, stato: "esistente" },
      { id: "a2", muroId: "m2", tipo: "finestra", posizione: 200, larghezza: 120, altezza: 140, davanzale: 90, stato: "esistente" },
    ],
  } as unknown as PiantaPer3D;
  const v = (x: number, y: number): V3 => [x, 1.6, y];

  it("si passa dalla porta, non dal muro", () => {
    expect(passoLibero(p, "fatto", v(3.8, 1.5), v(4.2, 1.5))).toBe(true); // dentro la porta
    expect(passoLibero(p, "fatto", v(3.8, 0.5), v(4.2, 0.5))).toBe(false); // sul muro
    expect(passoLibero(p, "fatto", v(3.8, 2.8), v(4.2, 2.8))).toBe(false);
  });
  it("una finestra non si attraversa, e non si esce dalla casa", () => {
    expect(passoLibero(p, "fatto", v(2, 2.8), v(2, 3.2))).toBe(false);
    expect(passoLibero(p, "fatto", v(5, 2.8), v(5, 3.2))).toBe(false);
  });
  it("dalla casa non si esce", () => {
    expect(passoLibero(p, "fatto", v(6.8, 1), v(6.95, 1))).toBe(true);
    expect(passoLibero(p, "fatto", v(6.95, 1), v(7.2, 1))).toBe(false);
  });
  it("camminare dentro la stanza è libero", () => {
    expect(passoLibero(p, "fatto", v(1, 1), v(2, 2))).toBe(true);
  });
});

import esempioTrilocale from "../../../shared/planimetrie/esempi/trilocale.json";
import { pianteDaPlanimetria, vistaDentroLocale } from "@/lib/planimetrie/tred";

describe("camminare in una pianta vera (trilocale d'esempio)", () => {
  const piante = pianteDaPlanimetria(esempioTrilocale as never, {});
  const pianta = piante.fatto;
  const cammina = (id: string) => {
    const loc = pianta.locali.find((l) => l.id === id)!;
    const cam = vistaDentroLocale(loc as never);
    let pos = [...cam.posizione] as V3;
    const dx = cam.guarda[0] - cam.posizione[0];
    const dz = cam.guarda[2] - cam.posizione[2];
    const n = Math.hypot(dx, dz);
    for (let i = 0; i < 120; i++) {
      const nuovo: V3 = [pos[0] + (dx / n) * 0.25, pos[1], pos[2] + (dz / n) * 0.25];
      if (!passoLibero(pianta, "fatto", pos, nuovo)) break;
      pos = nuovo;
    }
    return { partito: localeAllaPosizione(pianta, cam.posizione), arrivato: localeAllaPosizione(pianta, pos) };
  };

  it("non si resta mai dentro un muro né fuori dalla casa: si finisce sempre in una stanza", () => {
    for (const l of pianta.locali) {
      const { partito, arrivato } = cammina(l.id);
      expect(partito).toBe(l.id);
      expect(arrivato).not.toBeNull();
    }
  });

  it("dall'ingresso, camminando dritti, si passa dalla porta e si arriva in un'altra stanza", () => {
    const { arrivato } = cammina("ingresso");
    expect(arrivato).not.toBe("ingresso");
    expect(arrivato).not.toBeNull();
  });
});
