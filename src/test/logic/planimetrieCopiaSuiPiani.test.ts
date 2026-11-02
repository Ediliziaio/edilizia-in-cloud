import { describe, expect, it } from "vitest";
import { copiaSuTuttiIPiani } from "@/lib/planimetrie/copiaSuiPiani";
import type { Planimetria } from "../../../shared/planimetrie/modello";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";

const vuoto = { muri: [], aperture: [], locali: [], elementi: [], quote: [], testi: [] };
const lift = { id: "e1", tipo: "ascensore", posizione: { x: 500, y: 500 }, rotazione: 0, larghezza: 150, profondita: 150, stato: "esistente", origine: "rilevata" };
const doc = (): Planimetria => ({
  schemaVersione: 1, titolo: "t",
  livelli: [
    { id: "l0", nome: "Terra", quota: 0, fatto: { ...vuoto, elementi: [lift] }, proposte: [] },
    { id: "l1", nome: "Primo", quota: 300, fatto: { ...vuoto }, proposte: [] },
    { id: "l2", nome: "Secondo", quota: 600, fatto: { ...vuoto }, proposte: [] },
  ],
} as unknown as Planimetria);

describe("copia su tutti i piani", () => {
  let n = 0;
  const id = () => `arredo-t${++n}`;
  it("ripete l'elemento sugli altri piani con id nuovi e stessa posizione", () => {
    const r = copiaSuTuttiIPiani(doc(), "l0", "e1", id)!;
    expect(r.aggiunti).toBe(2);
    const ids = r.documento.livelli.flatMap((l) => l.fatto.elementi.map((e) => e.id));
    expect(new Set(ids).size).toBe(3);
    expect(r.documento.livelli[2].fatto.elementi[0].posizione).toEqual({ x: 500, y: 500 });
  });
  it("non raddoppia se lo rilanci", () => {
    const una = copiaSuTuttiIPiani(doc(), "l0", "e1", id)!;
    const due = copiaSuTuttiIPiani(una.documento, "l0", "e1", id)!;
    expect(due.aggiunti).toBe(0);
    expect(due.giaPresenti).toBe(2);
  });
  it("il computo conta un solo ascensore con tre fermate", () => {
    const r = copiaSuTuttiIPiani(doc(), "l0", "e1", id)!;
    const q = calcolaQuantita(r.documento);
    const num = Object.entries(q).filter(([k]) => k.includes("elementi:esistente:ascensore.")).map(([, v]) => v.valore);
    const fer = Object.entries(q).filter(([k]) => k.includes("ascensore_fermate")).map(([, v]) => v.valore);
    expect(num).toEqual([1]);
    expect(fer).toEqual([3]);
  });
});
