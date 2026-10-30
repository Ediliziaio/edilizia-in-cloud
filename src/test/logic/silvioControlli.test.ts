import { describe, expect, it } from "vitest";
import { controlliAcquisti, controlliFasi, quadroPerSilvio } from "@/lib/orders/silvioControlli";

const oggi = "2026-10-31";
const fase = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `Fase ${id}`, status: "da_fare", start_date: "2026-11-02", end_date: "2026-11-06", percentuale: 0,
  assignments: [{ source: "employee" }], ...extra,
});

describe("Silvio guarda le fasi", () => {
  it("date, ritardi, fasi senza nessuno, ditte senza costo, fasi senza voci; le chiuse non contano", () => {
    const punti = controlliFasi([
      fase("a", { start_date: null }),
      fase("b", { end_date: "2026-10-20", percentuale: 40 }),
      fase("c", { assignments: [] }),
      fase("d", { assignments: [{ source: "team", cost_preventivo: 0 }] }),
      fase("e", { status: "completata", start_date: null, assignments: [] }),
    ], new Map([["b", 3], ["d", 2]]), oggi);
    expect(punti.map((p) => p.chiave)).toEqual(["senza-date", "ritardo", "senza-nessuno", "ditta-senza-costo", "senza-voci"]);
    expect(punti[1]).toMatchObject({ titolo: "1 fase in ritardo", dettaglio: "Fase b (40%): la fine prevista è passata.", azione: "cronoprogramma" });
    expect(punti[4].dettaglio).toContain("Fase a, Fase c");
  });
  it("tutto a posto: niente da dire", () => {
    expect(controlliFasi([fase("a")], new Map([["a", 1]]), oggi)).toEqual([]);
  });
});

describe("Silvio guarda gli acquisti", () => {
  const m = (id: string, extra: Record<string, unknown> = {}) => ({
    id, name: `Mat ${id}`, quantity: 1, phase_id: "a", supplier_id: "s1", purchase_price: 10, readiness: "da_ordinare" as const, ...extra,
  });
  it("urgenti per le fasi vicine, senza fornitore, da ordinare per fornitore, senza prezzo, senza fase", () => {
    const punti = controlliAcquisti([
      m("1"), m("2", { supplier_id: null }), m("3", { phase_id: "z", purchase_price: null }), m("4", { phase_id: null }),
      m("5", { readiness: "ordinato" }),
    ], [{ id: "a", name: "Massetti", start_date: "2026-11-05" }, { id: "z", name: "Finiture", start_date: "2026-12-20" }], oggi);
    expect(punti.map((p) => p.chiave)).toEqual(["urgenti", "senza-fornitore", "da-ordinare", "senza-prezzo", "senza-fase"]);
    expect(punti[0]).toMatchObject({ titolo: "2 materiali da ordinare subito", azione: "acquisti" });
    expect(punti[2].titolo).toBe("3 da ordinare a 1 fornitore");
  });
  it("il quadro per la chat elenca quello che si è visto", () => {
    expect(quadroPerSilvio("Commessa X.", [])).toBe("Commessa X.\nNon vedo cose che mancano.");
  });
});
