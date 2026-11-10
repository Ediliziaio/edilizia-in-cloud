import { beforeEach, describe, expect, it, vi } from "vitest";
import { caricaPianteAssociate } from "@/lib/planimetrie/pianteAssociate";

const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from } }));
beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: db.select, eq: db.eq, is: db.is, order: db.order, range: db.range };
  for (const fn of [db.from, db.select, db.eq, db.is, db.order]) fn.mockReturnValue(query);
  db.range.mockResolvedValue({ data: [{ id: "p1", titolo: "Villa", stato: "archiviata", versione_corrente: 3, updated_at: "2026-11-10" }], count: 1, error: null });
});

describe("Planimetrie visibili dalle schede associate", () => {
  it.each([
    ["cliente", "customer_id"], ["preventivo", "quote_id"], ["commessa", "order_id"], ["computo", "computo_upload_id"],
  ] as const)("legge solo il riferimento esplicito %s nella stessa azienda", async (tipo, colonna) => {
    const result = await caricaPianteAssociate("azienda-A", tipo, "scheda-1");
    expect(db.from).toHaveBeenCalledWith("planimetrie");
    expect(db.eq.mock.calls).toEqual([["company_id", "azienda-A"], [colonna, "scheda-1"]]);
    expect(db.is).toHaveBeenCalledWith("deleted_at", null);
    expect(db.range).toHaveBeenCalledWith(0, 5);
    expect(result.piante[0].stato).toBe("archiviata");
    expect(result.totale).toBe(1);
  });

  it("pagina i risultati senza caricare tutto l'archivio", async () => {
    await caricaPianteAssociate("azienda-A", "cliente", "c1", 2);
    expect(db.range).toHaveBeenCalledWith(12, 17);
  });

  it("senza una scheda non esegue una ricerca generica nell'azienda", async () => {
    await expect(caricaPianteAssociate("azienda-A", "cliente", "")).rejects.toThrow(/Scheda/);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("un errore di lettura non viene presentato come assenza di collegamenti", async () => {
    db.range.mockResolvedValue({ data: null, count: null, error: { code: "42501" } });
    await expect(caricaPianteAssociate("azienda-A", "cliente", "c1")).rejects.toThrow(/non sono disponibili/);
  });
});
