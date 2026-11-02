import { describe, expect, it } from "vitest";
import esempio from "../../../shared/planimetrie/esempi/trilocale.json";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { esplodiInStrati, stratoDi } from "@/lib/planimetrie/tred/esploso";
import type { Mesh3D } from "@/lib/planimetrie/tred/tipi";

const minY = (m: Mesh3D) => { let y = Infinity; for (let i = 1; i < m.posizioni.length; i += 3) y = Math.min(y, m.posizioni[i]); return y; };
const piante = pianteDaPlanimetria(esempio as never, {});
const scena = costruisciScena(piante.progetto, { vista: "progetto", soffitto: true, elementi: true });

describe("vista esplosa a strati", () => {
  it("distanza zero: non cambia nulla", () => {
    expect(esplodiInStrati(scena, 0)).toBe(scena);
  });

  it("ogni strato sale di un multiplo della distanza: pavimenti fermi, pareti +d, soffitti +2d", () => {
    const d = 1.5;
    const es = esplodiInStrati(scena, d);
    const per = (s: typeof scena, id: string) => s.mesh.find((m) => m.id.startsWith(id))!;
    expect(minY(per(es, "pavimento:"))).toBeCloseTo(minY(per(scena, "pavimento:")), 6);
    expect(minY(per(es, "muro:"))).toBeCloseTo(minY(per(scena, "muro:")) + d, 6);
    expect(minY(per(es, "soffitto:"))).toBeCloseTo(minY(per(scena, "soffitto:")) + 2 * d, 6);
  });

  it("aggiunge la platea sotto la casa, più in basso del pavimento", () => {
    const es = esplodiInStrati(scena, 1.5);
    const platea = es.mesh.find((m) => m.id === "platea");
    expect(platea).toBeTruthy();
    const pav = es.mesh.filter((m) => m.id.startsWith("pavimento:")).map(minY);
    expect(minY(platea!)).toBeLessThan(Math.min(...pav) - 1.5);
    expect(es.materiali.platea).toBeTruthy();
    // si può rifare senza duplicarla
    expect(esplodiInStrati(es, 1.5).mesh.filter((m) => m.id === "platea")).toHaveLength(1);
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
    expect(es.limiti.min[1]).toBeLessThan(scena.limiti.min[1]);
  });

  it("le aree esterne non si muovono; il tetto va in cima", () => {
    expect(stratoDi({ id: "area:a1", riferimento: "a1", genere: "pavimento" })).toBeNull();
    expect(stratoDi({ id: "terreno", riferimento: "terreno", genere: "pavimento" })).toBeNull();
    expect(stratoDi({ id: "tetto", riferimento: "tetto", genere: "soffitto" })).toBe(3);
    expect(stratoDi({ id: "p1/soffitto:l1", riferimento: "l1", genere: "soffitto" })).toBe(2);
    expect(stratoDi({ id: "muro:m1", riferimento: "m1", genere: "muro" })).toBe(1);
  });
});
