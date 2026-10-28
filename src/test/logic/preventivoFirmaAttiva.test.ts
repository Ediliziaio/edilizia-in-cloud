import { describe, expect, it, vi } from "vitest";
import { preventivoFirmaAttiva } from "../../../supabase/functions/_shared/preventivoFirmaAttiva";

function database(quote: unknown, richieste: unknown, errore?: string) {
  const eq = vi.fn().mockReturnThis();
  const from = vi.fn((table: string) => ({
    select: vi.fn().mockReturnThis(), eq,
    in: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(),
    maybeSingle: async () => ({ data: quote, error: errore }),
    limit: async () => ({ data: richieste, error: errore }),
  }));
  return { from, eq };
}

describe("Il documento da firmare non si sostituisce", () => {
  it("FV con richiesta attiva: rigenerazione bloccata e controllo sulla stessa azienda", async () => {
    const db = database(null, [{ id: "firma" }]);
    expect(await preventivoFirmaAttiva(db, "azienda", "fv", "progetto")).toBe(true);
    expect(db.eq).toHaveBeenCalledWith("company_id", "azienda");
    expect(db.eq).toHaveBeenCalledWith("fv_progetto_id", "progetto");
  });
  it("SR usa il preventivo collegato, non un documento di un'altra azienda", async () => {
    const db = database({ id: "quote-sr" }, [{ id: "firma" }]);
    expect(await preventivoFirmaAttiva(db, "azienda", "sr", "progetto")).toBe(true);
    expect(db.eq).toHaveBeenCalledWith("source", "modulo:sr:progetto");
    expect(db.eq).toHaveBeenCalledWith("quote_id", "quote-sr");
  });
  it("senza richiesta attiva il documento puo essere rigenerato", async () => {
    expect(await preventivoFirmaAttiva(database(null, []), "azienda", "fv", "progetto")).toBe(false);
  });
  it("SR non ancora condiviso non richiede un preventivo collegato", async () => {
    expect(await preventivoFirmaAttiva(database(null, []), "azienda", "sr", "progetto")).toBe(false);
  });
  it("un errore di lettura non autorizza la sostituzione", async () => {
    await expect(preventivoFirmaAttiva(database(null, null, "offline"), "azienda", "fv", "progetto")).rejects.toThrow("verificare");
  });
});
