import { describe, expect, it } from "vitest";
import { cartellaArchiviabile, cartellaEliminabile, cartelleInOrdineAlbero, nomeConPercorso, percorsoCartella, sottocartelle } from "@/lib/driveCartelle";

const cartelle = [
  { id: "cantieri", name: "Cantieri", parent_id: null },
  { id: "rossi", name: "Rossi", parent_id: "cantieri" },
  { id: "foto", name: "Foto", parent_id: "rossi" },
  { id: "verbali", name: "Verbali", parent_id: null },
  { id: "orfana", name: "Orfana", parent_id: "sparita" },
];

describe("albero delle cartelle di EiC Drive", () => {
  it("costruisce il percorso dalla radice", () => {
    expect(percorsoCartella(cartelle, "foto").map(c => c.id)).toEqual(["cantieri", "rossi", "foto"]);
    expect(percorsoCartella(cartelle, null)).toEqual([]);
    expect(nomeConPercorso(cartelle, "foto")).toBe("Cantieri / Rossi / Foto");
  });

  it("non gira all'infinito su un ciclo", () => {
    const ciclo = [{ id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" }];
    expect(percorsoCartella(ciclo, "a").map(c => c.id)).toEqual(["b", "a"]);
  });

  it("separa radice e figlie; l'orfana sale in radice", () => {
    expect(sottocartelle(cartelle, null).map(c => c.id)).toEqual(["cantieri", "verbali", "orfana"]);
    expect(sottocartelle(cartelle, "cantieri").map(c => c.id)).toEqual(["rossi"]);
  });

  it("mette le cartelle in ordine d'albero col percorso", () => {
    expect(cartelleInOrdineAlbero(cartelle).map(c => [c.percorso, c.livello])).toEqual([
      ["Cantieri", 0], ["Cantieri / Rossi", 1], ["Cantieri / Rossi / Foto", 2], ["Verbali", 0], ["Orfana", 0],
    ]);
  });

  it("elimina solo una cartella senza figlie e senza file, archivia solo senza figlie attive", () => {
    expect(cartellaEliminabile(cartelle, "foto", 0)).toBe(true);
    expect(cartellaEliminabile(cartelle, "foto", 1)).toBe(false);
    expect(cartellaEliminabile(cartelle, "rossi", 0)).toBe(false);
    expect(cartellaArchiviabile(cartelle, "rossi")).toBe(false);
    expect(cartellaArchiviabile([...cartelle.filter(c => c.id !== "foto"), { id: "foto", name: "Foto", parent_id: "rossi", archived_at: "2026-11-24" }], "rossi")).toBe(true);
  });
});
