import { describe, expect, it } from "vitest";
import { dateAlleFasiCreate, type DbDateFasi } from "@/lib/orders/dateFasiCreate";
import { calendarioCantiere } from "@/lib/orders/sottofasi";

const feriali = calendarioCantiere({ sabato: false, chiusure: new Set() });

function dbFinto(fasi: Array<{ id: string; position: number; start_date?: string | null }>, sottofasi: Array<{ phase_id: string; position: number; giorni: number | null; in_parallelo?: boolean }> = [], erroreScrittura = false) {
  const scritte: Array<[string, { start_date: string; end_date: string }]> = [];
  const db: DbDateFasi = {
    leggiFasi: async () => ({ data: fasi.map((f) => ({ start_date: null as string | null, end_date: null as string | null, ...f })), error: null }),
    leggiSottofasi: async () => ({ data: sottofasi.map((s) => ({ in_parallelo: false, ...s })), error: null }),
    scriviDate: async (id, date) => { scritte.push([id, date]); return { error: erroreScrittura ? { message: "negato" } : null }; },
  };
  return { db, scritte };
}

describe("date alle fasi create dal preventivo", () => {
  it("in fila dall'inizio lavori, nell'ordine delle fasi, il tempo diviso fra quelle senza durata", async () => {
    const { db, scritte } = dbFinto([{ id: "b", position: 1 }, { id: "a", position: 0 }], [{ phase_id: "a", position: 0, giorni: 2 }]);
    expect(await dateAlleFasiCreate("o", { inizio: "2026-11-09", fine: "2026-11-13", lavorativo: feriali }, db)).toBeNull();
    expect(scritte).toEqual([
      ["a", { start_date: "2026-11-09", end_date: "2026-11-10" }],
      ["b", { start_date: "2026-11-11", end_date: "2026-11-13" }],
    ]);
  });

  it("senza inizio lavori non tocca niente", async () => {
    const { db, scritte } = dbFinto([{ id: "a", position: 0 }]);
    expect(await dateAlleFasiCreate("o", { inizio: null, fine: null, lavorativo: feriali }, db)).toBeNull();
    expect(scritte).toEqual([]);
  });

  it("se una fase ha già una data non tocca nessuna fase", async () => {
    const { db, scritte } = dbFinto([{ id: "a", position: 0, start_date: "2026-11-01" }, { id: "b", position: 1 }]);
    expect(await dateAlleFasiCreate("o", { inizio: "2026-11-09", fine: "2026-11-13", lavorativo: feriali }, db)).toBeNull();
    expect(scritte).toEqual([]);
  });

  it("un errore di scrittura torna come motivo, senza eccezioni", async () => {
    const { db } = dbFinto([{ id: "a", position: 0 }], [], true);
    expect(await dateAlleFasiCreate("o", { inizio: "2026-11-09", fine: "2026-11-13", lavorativo: feriali }, db)).toBe("negato");
  });
});
