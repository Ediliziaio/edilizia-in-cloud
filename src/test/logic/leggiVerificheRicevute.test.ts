import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  pagine: [] as Array<{ data: unknown; error: unknown }>,
  filtri: [] as unknown[],
  intervalli: [] as number[][],
}));
vi.mock("@/lib/ddt/documentiPersistenti", () => ({
  documentiDb: {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "not", "order"]) q[m] = () => q;
      q.eq = (...a: unknown[]) => {
        fake.filtri.push(a);
        return q;
      };
      q.range = async (...a: number[]) => {
        fake.intervalli.push(a);
        return fake.pagine.shift();
      };
      return q;
    },
  },
}));
import { leggiVerificheRicevute } from "@/lib/fatturazione/leggiVerificheRicevute";
beforeEach(() => {
  fake.pagine = [];
  fake.filtri = [];
  fake.intervalli = [];
});
const prima = () =>
  Array.from({ length: 1000 }, (_, i) => ({
    id: `f${i}`,
    verifica_manuale: "verificata",
  }));
describe("lettura completa degli stati di verifica", () => {
  it("legge anche le fatture oltre la millesima e vincola ogni pagina all’azienda", async () => {
    fake.pagine = [
      { data: prima(), error: null },
      {
        data: [{ id: "oltre-mille", verifica_manuale: "da_rettificare" }],
        error: null,
      },
    ];
    const v = await leggiVerificheRicevute("azienda");
    expect(Object.keys(v)).toHaveLength(1001);
    expect(v["oltre-mille"]).toBe("da_rettificare");
    expect(fake.intervalli).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(fake.filtri).toEqual([
      ["company_id", "azienda"],
      ["company_id", "azienda"],
    ]);
  });
  it("non restituisce una lettura parziale se la seconda pagina fallisce", async () => {
    fake.pagine = [
      { data: prima(), error: null },
      { data: null, error: { message: "Rete interrotta" } },
    ];
    await expect(leggiVerificheRicevute("azienda")).rejects.toMatchObject({
      message: "Rete interrotta",
    });
  });
  it("una risposta vuota valida è distinta da un rifiuto di accesso", async () => {
    fake.pagine = [{ data: [], error: null }];
    await expect(leggiVerificheRicevute("azienda")).resolves.toEqual({});
    fake.pagine = [
      { data: null, error: { code: "42501", message: "Accesso negato" } },
    ];
    await expect(leggiVerificheRicevute("azienda")).rejects.toMatchObject({
      code: "42501",
    });
  });
});
