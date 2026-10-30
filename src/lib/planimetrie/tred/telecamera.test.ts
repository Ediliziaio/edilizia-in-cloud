import { describe, expect, it } from "vitest";
import {
  ALTEZZA_OCCHI,
  BILOCALE_DA_RISTRUTTURARE,
  apertureDelLocale,
  costruisciScena,
  pianteDaPlanimetria,
  metadatiFotogramma,
  proietta,
  vistaDallAlto,
  vistaDentroLocale,
} from "./index";
import { puntoNelPoligono, v2 } from "./geometria2d";

const pianta = pianteDaPlanimetria(BILOCALE_DA_RISTRUTTURARE).progetto;

describe("telecamere", () => {
  it("la proiezione mette al centro il punto guardato e a destra l'est", () => {
    const t = { posizione: [0, 1.6, 0] as [number, number, number], guarda: [0, 1.6, -1] as [number, number, number], fov: 60 };
    expect(proietta(t, 1, [0, 1.6, -5])).toMatchObject({ x: 0, y: 0, profondita: 5 });
    expect(proietta(t, 1, [1, 1.6, -5]).x).toBeGreaterThan(0);
    expect(proietta(t, 1, [0, 3, -5]).y).toBeGreaterThan(0);
  });

  it("dall'alto il nord della pianta sta in cima all'immagine", () => {
    const s = costruisciScena(pianta);
    const t = vistaDallAlto(s.limiti, 16 / 9);
    expect(proietta(t, 16 / 9, [4.5, 0, -6.5]).y).toBeGreaterThan(proietta(t, 16 / 9, [4.5, 0, 0]).y);
    // tutta la pianta nell'inquadratura
    for (const p of [[-0.15, 0, -6.65], [9.15, 2.7, 0.15]] as [number, number, number][]) {
      const q = proietta(t, 16 / 9, p);
      expect(Math.abs(q.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(q.y)).toBeLessThanOrEqual(1);
    }
  });

  it("«entra nella stanza» mette gli occhi a 1,60 m dentro il locale", () => {
    for (const l of pianta.locali) {
      const t = vistaDentroLocale(l);
      expect(t.posizione[1]).toBeCloseTo(ALTEZZA_OCCHI, 9);
      expect(puntoNelPoligono(v2(t.posizione[0] * 100, t.posizione[2] * 100), l.contorno)).toBe(true);
    }
  });
});

describe("metadati del fotogramma", () => {
  it("aperture del locale: il soggiorno ha ingresso, due finestre, portafinestra e due porte", () => {
    const ids = apertureDelLocale(pianta, "l1").map((a) => a.id).sort();
    expect(ids).toEqual(["a1", "f1", "f2", "p2", "p3", "pf1"]);
    // la porta nuova del ripostiglio c'è nel progetto, non nello stato di fatto
    expect(apertureDelLocale(pianta, "l4", "progetto").map((a) => a.id)).toContain("p4");
    expect(apertureDelLocale(pianta, "l4", "fatto").map((a) => a.id)).not.toContain("p4");
  });

  it("misure del bagno e finestra inquadrata guardando verso sud", () => {
    const t = { posizione: [6.15, 1.6, -2.3] as [number, number, number], guarda: [6.15, 1.5, 0] as [number, number, number], fov: 70 };
    const m = metadatiFotogramma(pianta, "l3", t, { larghezza: 1024, altezza: 768 })!;
    expect(m.locale).toMatchObject({ nome: "Bagno", superficie_mq: 5.06, perimetro_m: 9, altezza_m: 2.7, larghezza_m: 2.3, profondita_m: 2.2 });
    expect(m.aperture_del_locale).toBe(2);
    // la finestra davanti; la porta del bagno sul muro a ovest, che guardando a sud sta a destra
    expect(m.aperture_visibili.map((a) => a.id).sort()).toEqual(["f4", "p3"]);
    const f4 = m.aperture_visibili.find((a) => a.id === "f4")!;
    expect(f4.posizione).toBe("centro");
    expect(m.aperture_visibili.find((a) => a.id === "p3")!.posizione).toBe("destra");
    expect(f4.riquadro.y0).toBeLessThan(f4.riquadro.y1);
    expect(f4.distanza_m).toBeGreaterThan(2);
  });

  it("le aperture alle spalle non risultano visibili", () => {
    const t = { posizione: [6.15, 1.6, -0.5] as [number, number, number], guarda: [6.15, 1.6, -2.5] as [number, number, number], fov: 50 };
    const m = metadatiFotogramma(pianta, "l3", t, { larghezza: 800, altezza: 600 })!;
    expect(m.aperture_visibili.map((a) => a.id)).not.toContain("f4");
  });
});
