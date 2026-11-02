import { describe, expect, it } from "vitest";
import { aPlanimetria, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { esportaDxf, esportaSvg, vistaDaPlanimetria } from "@/lib/planimetrie/esporta";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { curveDiLivello, leggiQuota, puntiTerreno, quotaTerreno, rettangoloPunti, scriviQuota } from "../../../shared/planimetrie/terreno.ts";

const voce = CATALOGO.find((v) => v.tipo === "quota_terreno")!;

/** Casa 8 × 6 e tre punti quotati: il terreno sale di 2 m verso est. */
function casaInPendenza() {
  let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
  const r = C.aggiungiStanza(p, C.rettangolo({ x: 0, y: 0 }, { x: 800, y: 600 }));
  p = r.pianta;
  for (const [x, y, q] of [[-800, 300, 0], [1600, 300, 200], [400, -800, 100]] as const) {
    const e = C.aggiungiElemento(p, voce, { x, y });
    p = C.modificaElemento(e.pianta, e.id!, { etichetta: scriviQuota(q) });
  }
  return aPlanimetria(p, nuovaPlanimetria("In pendenza"));
}

describe("terreno in pendenza", () => {
  it("legge e scrive le quote", () => {
    expect(leggiQuota("+1,20 m")).toBe(120);
    expect(leggiQuota("−0,50 m")).toBe(-50);
    expect(leggiQuota("-0.5")).toBe(-50);
    expect(leggiQuota("35 cm")).toBe(35);
    expect(leggiQuota("boh")).toBeNull();
    expect(scriviQuota(120)).toBe("+1,20 m");
    expect(scriviQuota(-50)).toBe("−0,50 m");
  });
  it("quote esatte nei punti, intermedie fra uno e l'altro; curve ogni 50 cm", () => {
    const doc = casaInPendenza();
    expect(validaPlanimetria(doc).ok).toBe(true);
    const punti = puntiTerreno(doc);
    expect(punti).toHaveLength(3);
    const est = punti.find((q) => q.quota === 200)!;
    expect(quotaTerreno(punti, est.x, est.y)).toBe(200);
    const mezzo = quotaTerreno(punti, 400, 0);
    expect(mezzo).toBeGreaterThan(0);
    expect(mezzo).toBeLessThan(200);
    const curve = curveDiLivello(punti, rettangoloPunti(punti)!);
    expect(new Set(curve.map((c) => c.quota))).toEqual(new Set([50, 100, 150]));
    expect(curveDiLivello([punti[0]], rettangoloPunti(punti)!)).toEqual([]);
  });
  it("PDF/SVG e DXF: curve e quote sul layer TERRENO", () => {
    const vista = vistaDaPlanimetria(casaInPendenza(), { modo: "fatto" });
    expect(vista.terreno?.curve.length).toBeGreaterThan(10);
    expect(vista.terreno?.punti.map((q) => q.testo)).toContain("+2,00 m");
    expect(esportaSvg(vista, { scala: 100 }).svg).toContain("+2,00 m");
    expect(new TextDecoder().decode(esportaDxf(vista).dati)).toContain("TERRENO");
  });
  it("3D: il prato sale verso est e sotto la casa resta a zero", () => {
    const pt = pianteDaPlanimetria(casaInPendenza()).fatto;
    expect(pt.terreno).toHaveLength(3);
    const s = costruisciScena(pt, { vista: "fatto", terreno: 10 });
    const t = s.mesh.find((m) => m.id === "terreno")!;
    const ys = t.posizioni.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(1.8);
    expect(Math.min(...ys)).toBeLessThan(0.05);
    // un vertice sotto la casa (centro 4, 3 m) è a quota zero
    const sotto = [];
    for (let i = 0; i < t.posizioni.length; i += 3) if (Math.abs(t.posizioni[i] - 4) < 1 && Math.abs(t.posizioni[i + 2] - 3) < 1) sotto.push(t.posizioni[i + 1]);
    expect(sotto.length).toBeGreaterThan(0);
    expect(Math.max(...sotto)).toBeCloseTo(-0.01, 3);
  });
});
