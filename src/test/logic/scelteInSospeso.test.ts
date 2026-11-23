import { describe, expect, it } from "vitest";
import { cancellaSospeso, chiaveSospeso, leggiSospeso, scriviSospeso } from "@/lib/distinta/scelteInSospeso";

const deposito = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string): string | null => m.get(k) ?? null, setItem: (k: string, v: string): void => { m.set(k, v); }, removeItem: (k: string): void => { m.delete(k); } };
};
const K = chiaveSospeso("o1", "c1");
const ADESSO = new Date("2026-11-23T10:00:00Z");
const scelte = { scelte: { Pavimenti: "f1" }, accese: { "mat-1": false }, sceltaArticolo: { "mat-2": { tipo: "articolo" as const, id: "a1" } } };

describe("scelte lasciate a metà in «Genera dal computo»", () => {
  it("si ritrovano uguali alla riapertura, per quella commessa e quel computo", () => {
    const d = deposito();
    scriviSospeso(d, K, scelte, ADESSO);
    expect(leggiSospeso(d, K, new Date("2026-11-25T10:00:00Z"))).toMatchObject(scelte);
    expect(leggiSospeso(d, chiaveSospeso("o1", "altro-computo"), ADESSO)).toBeNull();
  });
  it("dopo due settimane non si ripropongono; dopo il salvataggio spariscono", () => {
    const d = deposito();
    scriviSospeso(d, K, scelte, ADESSO);
    expect(leggiSospeso(d, K, new Date("2026-12-10T10:00:00Z"))).toBeNull();
    cancellaSospeso(d, K);
    expect(d.m.size).toBe(0);
  });
  it("niente da ricordare: non lascia una voce vuota", () => {
    const d = deposito();
    scriviSospeso(d, K, scelte, ADESSO);
    scriviSospeso(d, K, { scelte: {}, accese: {}, sceltaArticolo: {} }, ADESSO);
    expect(d.m.size).toBe(0);
  });
  it("dato rovinato o deposito che non funziona: si lavora come prima, senza errori", () => {
    const d = deposito();
    d.m.set(K, "{non è json");
    expect(leggiSospeso(d, K, ADESSO)).toBeNull();
    d.m.set(K, JSON.stringify({ scelte: [], accese: {}, sceltaArticolo: {}, salvato_il: "ieri" }));
    expect(leggiSospeso(d, K, ADESSO)).toBeNull();
    const rotto = { getItem: (): string | null => { throw new Error("no"); }, setItem: (): void => { throw new Error("pieno"); }, removeItem: (): void => { throw new Error("no"); } };
    expect(leggiSospeso(rotto, K, ADESSO)).toBeNull();
    expect(() => scriviSospeso(rotto, K, scelte, ADESSO)).not.toThrow();
    expect(() => cancellaSospeso(rotto, K)).not.toThrow();
    expect(leggiSospeso(null, K, ADESSO)).toBeNull();
  });
});
