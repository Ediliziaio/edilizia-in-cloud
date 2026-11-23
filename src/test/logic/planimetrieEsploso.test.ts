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

  it("separa pavimenti, pareti e soffitti di almeno la distanza richiesta", () => {
    const d = 1.5;
    const es = esplodiInStrati(scena, d);
    const pavimenti = es.mesh.filter(m => stratoDi(m) === "pavimenti");
    const pareti = es.mesh.filter(m => stratoDi(m) === "pareti");
    const soffitti = es.mesh.filter(m => stratoDi(m) === "soffitti");
    expect(Math.min(...pareti.map(minY)) - Math.max(...pavimenti.map(maxY))).toBeGreaterThanOrEqual(d - 1e-6);
    expect(Math.min(...soffitti.map(minY)) - Math.max(...pareti.map(maxY))).toBeGreaterThanOrEqual(d - 1e-6);
    expect(es.mesh.some(m => stratoDi(m) === "fondazioni")).toBe(false);
  });

  it("separa le fondazioni già presenti sotto il pavimento senza duplicarle", () => {
    const casa = costruisciScena(piante.progetto, { vista: "progetto", soffitto: true, fondazioni: true });
    const es = esplodiInStrati(casa, 1.5);
    const fondazioni = es.mesh.find(m => m.id === "fondazioni")!;
    expect(fondazioni).toBeTruthy();
    const pavimenti = es.mesh.filter(m => stratoDi(m) === "pavimenti");
    expect(Math.min(...pavimenti.map(minY)) - maxY(fondazioni)).toBeGreaterThanOrEqual(1.5 - 1e-6);
    expect(esplodiInStrati(es, 1.5).mesh.filter(m => m.id === fondazioni.id)).toHaveLength(1);
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
    expect(es.limiti.min[1]).toBeCloseTo(Math.min(...es.mesh.map(minY)), 6);
  });

  it("le aree esterne non si muovono; il tetto va in cima", () => {
    expect(stratoDi({ id: "area:a1", riferimento: "a1", genere: "pavimento" })).toBeNull();
    expect(stratoDi({ id: "terreno", riferimento: "terreno", genere: "pavimento" })).toBeNull();
    expect(stratoDi({ id: "tetto", riferimento: "tetto", genere: "soffitto" })).toBe("copertura");
    expect(stratoDi({ id: "p1/soffitto:l1", riferimento: "l1", genere: "soffitto" })).toBe("soffitti");
    expect(stratoDi({ id: "muro:m1", riferimento: "m1", genere: "muro" })).toBe("pareti");
  });
});
