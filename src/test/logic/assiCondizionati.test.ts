import { describe, expect, it } from "vitest";
import { assiVisibili, conAssiVisibili, normalizzaSelezione } from "@/lib/serramenti/assiCondizionati";

const v = (id: string, valore: string, def = false) => ({ id, valore, attivo: true, is_default: def });
const assi = [
  { codice: "colore", values: [v("c1", "bianco", true)] },
  { codice: "monoblocco", values: [v("m0", "senza", true), v("m1", "con")] },
  { codice: "altezza_cassonetto", visibile_se: { asse: "monoblocco", valori: ["con"] }, values: [v("a1", "150"), v("a2", "200", true)] },
  { codice: "zanzariera", visibile_se: { asse: "monoblocco", valori: ["con"] }, values: [v("z0", "senza", true), v("z1", "con")] },
];

describe("assi condizionati", () => {
  it("senza monoblocco i dettagli del monoblocco non si vedono", () => {
    expect(assiVisibili(assi, { colore: "c1", monoblocco: "m0" }).map((a) => a.codice)).toEqual(["colore", "monoblocco"]);
  });
  it("con monoblocco compaiono", () => {
    expect(assiVisibili(assi, { monoblocco: "m1" }).map((a) => a.codice)).toEqual(["colore", "monoblocco", "altezza_cassonetto", "zanzariera"]);
  });
  it("un prodotto senza condizioni resta com'è", () => {
    const f = { axes: [assi[0], assi[1]] };
    expect(conAssiVisibili(f, {})).toBe(f);
  });
  it("scegliendo il monoblocco arrivano i valori di partenza; togliendolo se ne vanno, con le loro voci", () => {
    const con = normalizzaSelezione(assi, { colore: "c1", monoblocco: "m1" });
    expect(con.valori).toEqual({ colore: "c1", monoblocco: "m1", altezza_cassonetto: "a2", zanzariera: "z0" });
    const senza = normalizzaSelezione(assi, { ...con.valori, monoblocco: "m0" }, { altezza_cassonetto: "x", colore: "Bianco" });
    expect(senza.valori).toEqual({ colore: "c1", monoblocco: "m0" });
    expect(senza.voci).toEqual({ colore: "Bianco" });
  });
});
