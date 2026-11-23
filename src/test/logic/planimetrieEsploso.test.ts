import { describe, expect, it } from "vitest";
import esempio from "../../../shared/planimetrie/esempi/trilocale.json";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { esplodiInStrati, stratoDi } from "@/lib/planimetrie/tred/esploso";
import type { Mesh3D } from "@/lib/planimetrie/tred/tipi";

const minY = (m: Mesh3D) => { let y = Infinity; for (let i = 1; i < m.posizioni.length; i += 3) y = Math.min(y, m.posizioni[i]); return y; };
const maxY = (m: Mesh3D) => { let y = -Infinity; for (let i = 1; i < m.posizioni.length; i += 3) y = Math.max(y, m.posizioni[i]); return y; };
const piante = pianteDaPlanimetria(esempio as never, {});
const scena = costruisciScena(piante.progetto, { vista: "progetto", soffitto: true, elementi: true });

describe("vista esplosa a strati", () => {
  it("distanza zero: non cambia nulla", () => {
    expect(esplodiInStrati(scena, 0)).toBe(scena);
  });

  it("stacca gli arredi dalle pareti e lascia il distacco richiesto fra gli ingombri dei gruppi", () => {
    const d = 1.5;
    const es = esplodiInStrati(scena, d);
    const gruppi = ["pavimenti", "pareti", "arredi", "soffitti"].map(id => es.mesh.filter(m => stratoDi(m) === id));
    for (const [i, gruppo] of gruppi.entries()) {
      expect(gruppo.length).toBeGreaterThan(0);
      if (i > 0) expect(Math.min(...gruppo.map(minY))).toBeGreaterThanOrEqual(Math.max(...gruppi[i - 1].map(maxY)) + d - 1e-6);
    }
  });

  it("esplode le mesh del modello senza aggiungere una platea", () => {
    const es = esplodiInStrati(scena, 1.5);
    expect(es.mesh.map(m => m.id)).toEqual(scena.mesh.map(m => m.id));
    expect(es.mesh.some(m => stratoDi(m) === "fondazioni")).toBe(false);
    const conFondazioni = costruisciScena(piante.progetto, { fondazioni: true });
    const esplosoConFondazioni = esplodiInStrati(conFondazioni, 1.5);
    expect(esplosoConFondazioni.mesh.map(m => m.id)).toEqual(conFondazioni.mesh.map(m => m.id));
  });

  it("i soffitti si vedono anche da sopra: ogni faccia ha la sua opposta", () => {
    const es = esplodiInStrati(scena, 1.5);
    const prima = scena.mesh.find((m) => m.id.startsWith("soffitto:"))!;
    const dopo = es.mesh.find((m) => m.id === prima.id)!;
    expect(dopo.indici.length).toBe(prima.indici.length * 2);
    expect(dopo.posizioni.length).toBe(prima.posizioni.length * 2);
  });

  it("i limiti della scena seguono gli strati spostati", () => {
    const es = esplodiInStrati(scena, 2);
    expect(es.limiti.max[1]).toBeGreaterThan(scena.limiti.max[1] + 3);
    expect(es.limiti.min[1]).toBeCloseTo(scena.limiti.min[1]);
  });

  it("le aree esterne non si muovono; il tetto va in cima", () => {
    expect(stratoDi({ id: "area:a1", riferimento: "a1", genere: "pavimento" })).toBeNull();
    expect(stratoDi({ id: "terreno", riferimento: "terreno", genere: "pavimento" })).toBeNull();
    expect(stratoDi({ id: "pavimento:veranda", riferimento: "veranda", genere: "pavimento", stratoEsploso: null })).toBeNull();
    expect(stratoDi({ id: "tetto", riferimento: "tetto", genere: "soffitto" })).toBe("copertura");
    expect(stratoDi({ id: "p1/soffitto:l1", riferimento: "l1", genere: "soffitto" })).toBe("soffitti");
    expect(stratoDi({ id: "muro:m1", riferimento: "m1", genere: "muro" })).toBe("pareti");
  });
});
