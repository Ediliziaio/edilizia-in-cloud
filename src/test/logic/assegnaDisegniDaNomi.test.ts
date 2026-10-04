import { describe, expect, it } from "vitest";
import { proponiDisegniDaNomi } from "@/lib/serramenti/assegnaDisegniDaNomi";

describe("proponiDisegniDaNomi", () => {
  const righe = proponiDisegniDaNomi([
    { id: "1", nome: "Finestra 2 Ante" },
    { id: "2", nome: "Finestra 1 Anta", disegno_tipologia: "finestra_1_anta" },
    { id: "3", nome: "Cassonetto monoblocco" },
    { id: "4", nome: "Persiana 2 ante" },
    { id: "5", nome: "Finestra 3 Ante", deleted_at: "2026-10-01" },
  ]);
  it("propone il tipo solo agli articoli senza tipo e riconosciuti", () => {
    expect(righe.map((r) => [r.id, r.esito])).toEqual([["1", "proposto"], ["2", "gia_assegnato"], ["3", "non_riconosciuto"], ["4", "proposto"]]);
    expect(righe[0].tipo).toBe("finestra_2_ante");
    expect(righe[3].tipo).toBe("persiana:2_ante");
  });
  it("salta gli articoli nel cestino e non tocca quelli già assegnati", () => {
    expect(righe.find((r) => r.id === "5")).toBeUndefined();
    expect(righe.find((r) => r.id === "2")?.tipo).toBeNull();
  });
});
