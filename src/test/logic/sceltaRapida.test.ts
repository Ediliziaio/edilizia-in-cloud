import { describe, expect, it } from "vitest";
import { corrisponde, fasiInVista } from "@/lib/campo/sceltaRapida";

const fasi = Array.from({ length: 200 }, (_, i) => ({
  id: `f${i}`, name: i === 150 ? "Impianto elettrico piano terra" : `Fase ${i}`,
  status: i === 120 || i === 121 ? "in_corso" : "da_iniziare",
}));

describe("Fasi del rapportino con un cantiere grande", () => {
  it("con 200 fasi ne mostra 8: in corso prima, poi le prossime, nell'ordine del cantiere", () => {
    const { inVista, altre } = fasiInVista(fasi, new Set());
    expect(inVista).toHaveLength(8);
    expect(inVista.map(f => f.id)).toEqual(["f0", "f1", "f2", "f3", "f4", "f5", "f120", "f121"]);
    expect(altre).toBe(192);
  });

  it("quella già scelta resta sempre in vista", () => {
    expect(fasiInVista(fasi, new Set(["f199"])).inVista.map(f => f.id)).toContain("f199");
  });

  it("cercando si trova qualunque fase, senza accenti né maiuscole e con parole in ordine sparso", () => {
    expect(fasiInVista(fasi, new Set(), "elettrico TERRA").inVista.map(f => f.id)).toEqual(["f150"]);
    expect(corrisponde("Finiture e pulizie", "pulizìe")).toBe(true);
  });

  it("un cantiere piccolo resta com'è: tutte le fasi in vista", () => {
    expect(fasiInVista(fasi.slice(0, 5), new Set()).altre).toBe(0);
  });
});
