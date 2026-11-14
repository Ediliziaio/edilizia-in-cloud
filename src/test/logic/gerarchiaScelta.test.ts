import { describe, expect, it, vi } from "vitest";
import { appartenenza, conGenerali, raggruppaPerGenerale, type RigaGerarchia } from "@/lib/orders/generali/gerarchiaScelta";

/** Generale e figlie nei selettori di commessa (14/11/2026). */
const g: RigaGerarchia = { id: "g", order_code: "O-0003", workflow_kind: "generale" };
const f2: RigaGerarchia = { id: "f2", order_code: "O-0010", commessa_generale_id: "g", generale: { order_code: "O-0003", description: "Via Lotti" } };
const f1: RigaGerarchia = { id: "f1", order_code: "O-0009", commessa_generale_id: "g", generale: { order_code: "O-0003", description: "Via Lotti" } };
const altra: RigaGerarchia = { id: "a", order_code: "O-0050", workflow_kind: "commessa" };
const orfana: RigaGerarchia = { id: "o", order_code: "O-0060", commessa_generale_id: "x", generale: { order_code: "O-0001", description: null } };

describe("generale e figlie nei selettori", () => {
  it("mette le figlie sotto la loro generale, in ordine di codice, e lascia il resto dov'è", () => {
    const fila = raggruppaPerGenerale([f2, altra, g, orfana, f1]);
    expect(fila.map((r) => [r.riga.id, r.annidata])).toEqual([
      ["a", false], ["g", false], ["f1", true], ["f2", true], ["o", false],
    ]);
  });

  it("dice a quale generale appartiene una figlia", () => {
    expect(appartenenza(f1)).toBe("in O-0003 · Via Lotti");
    expect(appartenenza(orfana)).toBe("in O-0001");
    expect(appartenenza({ id: "z", commessa_generale_id: "g", generale: null })).toBe("in una commessa generale");
    expect(appartenenza(altra)).toBeNull();
    expect(appartenenza(g)).toBeNull();
  });

  it("prende il nome della generale dall'elenco, e legge a parte solo quelle che mancano", async () => {
    const leggi = vi.fn(async (ids: string[]) => ids.map((id) => ({ id, order_code: "O-0001", description: "Cherubini" })));
    const sole = [{ ...g, description: "Via Lotti" }, { id: "f", commessa_generale_id: "g" }, { id: "o", commessa_generale_id: "x" }];
    const fuori = await conGenerali(sole, leggi);
    expect(leggi).toHaveBeenCalledWith(["x"]);
    expect(fuori.map(appartenenza)).toEqual([null, "in O-0003 · Via Lotti", "in O-0001 · Cherubini"]);
    leggi.mockClear();
    await conGenerali([altra], leggi);
    expect(leggi).not.toHaveBeenCalled();
  });
});
