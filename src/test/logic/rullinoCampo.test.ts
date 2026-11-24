import { describe, expect, it } from "vitest";
import { giornoDellaFoto, raggruppaFoto } from "@/components/campo/RullinoCampo";
import type { FotoCantiere } from "@/hooks/useFotoCantiere";

const foto = (id: string, taken_at: string): FotoCantiere => ({
  id, company_id: "c", order_id: "o", uploaded_by: "u", storage_path: `p/${id}.jpg`, thumbnail_path: null,
  latitudine: null, longitudine: null, accuracy_meters: null, taken_at, server_timestamp: taken_at,
  descrizione: null, tags: [], created_at: taken_at,
});

describe("Rullino foto dell'area operai", () => {
  const oggi = new Date(2026, 10, 24, 10, 0);

  it("chiama i giorni come il telefono: oggi, ieri, poi la data", () => {
    expect(giornoDellaFoto(new Date(2026, 10, 24, 8, 0).toISOString(), oggi)).toBe("oggi");
    expect(giornoDellaFoto(new Date(2026, 10, 23, 18, 0).toISOString(), oggi)).toBe("ieri");
    expect(giornoDellaFoto(new Date(2026, 10, 20, 9, 0).toISOString(), oggi)).toBe("2026-11-20");
    expect(giornoDellaFoto("non una data", oggi)).toBe("senza-data");
  });

  it("dalla più recente, a gruppi per giorno; l'indice vale per sfogliare tutte le foto", () => {
    const { ordinate, gruppi } = raggruppaFoto([
      foto("a", new Date(2026, 10, 23, 9).toISOString()),
      foto("b", new Date(2026, 10, 24, 9).toISOString()),
      foto("c", new Date(2026, 10, 24, 11).toISOString()),
    ], oggi);
    expect(ordinate.map(f => f.id)).toEqual(["c", "b", "a"]);
    expect(gruppi.map(g => [g.giorno, g.righe.map(r => `${r.foto.id}${r.indice}`)])).toEqual([
      ["oggi", ["c0", "b1"]],
      ["ieri", ["a2"]],
    ]);
  });
});
