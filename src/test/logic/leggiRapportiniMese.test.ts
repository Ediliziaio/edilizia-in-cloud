import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ pagine: [] as unknown[][], select: "", range: [] as number[][], filtri: [] as unknown[][], rpc: [] as string[], costi: [] as unknown[] }));

vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: (c: string) => { stato.select = c; return query; },
    eq: (...a: unknown[]) => { stato.filtri.push(["eq", ...a]); return query; },
    gte: (...a: unknown[]) => { stato.filtri.push(["gte", ...a]); return query; },
    lte: (...a: unknown[]) => { stato.filtri.push(["lte", ...a]); return query; },
    is: () => query,
    order: () => query,
    range: async (da: number, a: number) => { stato.range.push([da, a]); return { data: stato.pagine.shift() ?? [], error: null as unknown }; },
  };
  const costi = { order: () => costi, range: async () => ({ data: stato.costi, error: null as unknown }) };
  return { supabase: { from: () => query, rpc: (nome: string) => { stato.rpc.push(nome); return costi; } } };
});

import { leggiRapportiniMese } from "@/hooks/useRapportiniMese";

const riga = (id: string, order: unknown = { client_name: "Rossi" }) => ({ id, order });

beforeEach(() => { stato.pagine = []; stato.range = []; stato.filtri = []; stato.select = ""; stato.rpc = []; stato.costi = []; });

describe("la lettura dei rapportini del mese", () => {
  it("può leggere tutti i periodi senza perdere il vincolo aziendale", async () => {
    stato.pagine = [[riga("a")]];
    await leggiRapportiniMese("azienda-2", {}, false);
    expect(stato.filtri).toContainEqual(["eq", "company_id", "azienda-2"]);
    expect(stato.filtri.some((f) => f[0] === "gte" || f[0] === "lte")).toBe(false);
  });
  it("legge un intervallo libero che attraversa più mesi", async () => {
    await leggiRapportiniMese("c1", { da: "2026-08-10", a: "2026-11-11" }, false);
    expect(stato.filtri).toContainEqual(["gte", "data_lavoro", "2026-08-10"]);
    expect(stato.filtri).toContainEqual(["lte", "data_lavoro", "2026-11-11"]);
  });
  it("legge oltre le mille righe e resta nel mese e nell'azienda", async () => {
    stato.pagine = [Array.from({ length: 1000 }, (_, i) => riga(`a${i}`)), [riga("b")]];
    const righe = await leggiRapportiniMese("c1", "2026-02", true);
    expect(righe).toHaveLength(1001);
    expect(stato.range).toEqual([[0, 999], [1000, 1999]]);
    expect(stato.filtri).toContainEqual(["eq", "company_id", "c1"]);
    expect(stato.filtri).toContainEqual(["gte", "data_lavoro", "2026-02-01"]);
    expect(stato.filtri).toContainEqual(["lte", "data_lavoro", "2026-02-28"]);
  });
  it("il costo non passa dalla lettura diretta: lo dà la funzione protetta, solo a chi può vederlo", async () => {
    stato.pagine = [[riga("a")]];
    await leggiRapportiniMese("c1", "2026-09", false);
    expect(stato.select).not.toContain("costo_manodopera");
    expect(stato.rpc).toEqual([]);
    stato.pagine = [[riga("a")]];
    stato.costi = [{ id: "a", costo_manodopera: 120 }];
    const [r] = await leggiRapportiniMese("c1", "2026-09", true);
    expect(stato.select).not.toContain("costo_manodopera");
    expect(stato.rpc).toEqual(["rapportini_costi"]);
    expect(r.costo_manodopera).toBe(120);
  });
  it("lascia fuori le commesse nel cestino e quelle che l'utente non vede", async () => {
    stato.pagine = [[riga("ok"), riga("cestino", { deleted_at: "2026-09-01" }), riga("invisibile", null)]];
    expect((await leggiRapportiniMese("c1", "2026-09", false)).map((r) => r.id)).toEqual(["ok"]);
  });
});
