import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ pagine: [] as unknown[][], select: "", range: [] as number[][], filtri: [] as unknown[][] }));

vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: (c: string) => { stato.select = c; return query; },
    eq: (...a: unknown[]) => { stato.filtri.push(["eq", ...a]); return query; },
    gte: (...a: unknown[]) => { stato.filtri.push(["gte", ...a]); return query; },
    lte: (...a: unknown[]) => { stato.filtri.push(["lte", ...a]); return query; },
    order: () => query,
    range: async (da: number, a: number) => { stato.range.push([da, a]); return { data: stato.pagine.shift() ?? [], error: null as unknown }; },
  };
  return { supabase: { from: () => query } };
});

import { leggiRapportiniMese } from "@/hooks/useRapportiniMese";

const riga = (id: string, order: unknown = { client_name: "Rossi" }) => ({ id, order });

beforeEach(() => { stato.pagine = []; stato.range = []; stato.filtri = []; stato.select = ""; });

describe("la lettura dei rapportini del mese", () => {
  it("legge oltre le mille righe e resta nel mese e nell'azienda", async () => {
    stato.pagine = [Array.from({ length: 1000 }, (_, i) => riga(`a${i}`)), [riga("b")]];
    const righe = await leggiRapportiniMese("c1", "2026-02", true);
    expect(righe).toHaveLength(1001);
    expect(stato.range).toEqual([[0, 999], [1000, 1999]]);
    expect(stato.filtri).toContainEqual(["eq", "company_id", "c1"]);
    expect(stato.filtri).toContainEqual(["gte", "data_lavoro", "2026-02-01"]);
    expect(stato.filtri).toContainEqual(["lte", "data_lavoro", "2026-02-28"]);
  });
  it("il costo si chiede solo a chi può vederlo", async () => {
    await leggiRapportiniMese("c1", "2026-09", false);
    expect(stato.select).not.toContain("costo_manodopera");
    await leggiRapportiniMese("c1", "2026-09", true);
    expect(stato.select).toContain("costo_manodopera");
  });
  it("lascia fuori le commesse nel cestino e quelle che l'utente non vede", async () => {
    stato.pagine = [[riga("ok"), riga("cestino", { deleted_at: "2026-09-01" }), riga("invisibile", null)]];
    expect((await leggiRapportiniMese("c1", "2026-09", false)).map((r) => r.id)).toEqual(["ok"]);
  });
});
