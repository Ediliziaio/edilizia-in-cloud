import { describe, expect, it } from "vitest";
import { MODELLI } from "@/lib/planimetrie/tred/elementi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { TIPI_SU_TUTTI_I_PIANI } from "@/lib/planimetrie/copiaSuiPiani";

const alto = (bl: Array<{ y: number; h: number }>) => Math.max(...bl.map((x) => x.y + x.h));

describe("scale a U e a chiocciola", () => {
  it("la scala a U arriva esattamente al piano sopra, a metà sul pianerottolo, con pedata ≈ 25 cm", () => {
    const h = 3.15;
    const bl = MODELLI.scala_u.blocchi(2.0, 3.6, h);
    expect(alto(bl)).toBeCloseTo(h, 5);
    const n = Math.round(h / 0.175);
    const pianerottolo = bl.find((x) => x.l === 2.0)!;
    expect(pianerottolo.h).toBeCloseTo((h / n) * Math.floor(n / 2), 5);
    const gradino = bl.find((x) => x.l < 2.0)!;
    expect(gradino.p).toBeGreaterThan(0.2);
    expect(gradino.p).toBeLessThan(0.3);
  });
  it("le due rampe non si sovrappongono", () => {
    const bl = MODELLI.scala_u.blocchi(2.0, 3.6, 2.8).filter((x) => x.l < 2.0);
    const a = bl.filter((x) => x.x < 0), b = bl.filter((x) => x.x > 0);
    expect(a.length).toBeGreaterThan(3);
    expect(b.length).toBeGreaterThan(3);
    expect(Math.max(...a.map((x) => x.x + x.l / 2))).toBeLessThan(Math.min(...b.map((x) => x.x - x.l / 2)));
  });
  it("la chiocciola sale col palo e un gradino per alzata, ruotando", () => {
    const h = 3.0;
    const bl = MODELLI.scala_chiocciola.blocchi(1.6, 1.6, h);
    expect(bl.filter((x) => x.materiale === "legno").length).toBe(Math.round(h / 0.175));
    expect(alto(bl)).toBeCloseTo(h, 2);
    const angoli = bl.filter((x) => x.girata !== undefined).map((x) => x.girata!);
    expect(new Set(angoli.map((a) => a.toFixed(3))).size).toBe(angoli.length);
  });
  it("sono nel catalogo e si ripetono su tutti i piani", () => {
    expect(CATALOGO.some((c) => c.tipo === "scala_u")).toBe(true);
    expect(CATALOGO.some((c) => c.tipo === "scala_chiocciola")).toBe(true);
    expect(TIPI_SU_TUTTI_I_PIANI).toContain("scala_u");
  });
});
