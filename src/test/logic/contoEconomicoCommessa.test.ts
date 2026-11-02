import { describe, expect, it } from "vitest";
import { contoEconomicoCommessa, voceDaTipoFornitore, type ConsuntivoCommessa } from "@/lib/orders/contoEconomicoCommessa";
import { quotaCostoDiretto } from "@/hooks/useCostiDirettiPerTipo";

const consuntivo = (p: Partial<ConsuntivoCommessa> = {}): ConsuntivoCommessa => ({
  acquisti: 20000, magazzino: 1000, manodopera: 15000, persone: 9000, provvigioni: 2000, rimborsi: 100, errori: 400,
  diretti: 6000, direttiPerTipo: { professionisti: 2500, noli_servizi: 1200, nessuno: 350 }, ...p,
});
const somma = (c: ConsuntivoCommessa) => c.acquisti + c.magazzino + c.manodopera + c.provvigioni + c.rimborsi + c.errori + c.diretti;

describe("conto economico della commessa per macro-voci", () => {
  it("la somma delle voci è il consuntivo della vista del margine, anche coi costi non attribuiti", () => {
    const k = consuntivo();
    const conto = contoEconomicoCommessa({ ricavi: 100000, avanzamentoPct: 50, consuntivo: k, previsto: null, struttura: { mensile: null, mesiPrevisti: null, mesiMaturati: null } });
    expect(conto.costiConsuntivo).toBe(somma(k));
    const per = Object.fromEntries(conto.righe.map((r) => [r.key, r.consuntivo]));
    expect(per).toMatchObject({
      materiali: 21000, manodopera: 9000, subappalti: 6000, professionisti: 2500, noleggi: 1200,
      // 350 senza fornitore + 1.950 di costi diretti non attribuiti a un tipo.
      cantiere: 2300, provvigioni: 2000, rimborsi: 100, errori: 400,
    });
  });

  it("confronta col previsto a questo punto dei lavori e misura le incidenze", () => {
    const conto = contoEconomicoCommessa({
      ricavi: 100000, avanzamentoPct: 50,
      consuntivo: consuntivo(),
      previsto: { materiali: 40000, manodopera: 20000, ditte: 10000 },
      struttura: { mensile: 1000, mesiPrevisti: 6, mesiMaturati: 3 },
    });
    const mat = conto.righe.find((r) => r.key === "materiali")!;
    expect(mat).toMatchObject({ preventivo: 40000, incidenzaPreventivo: 40, previstoAOggi: 20000, consuntivo: 21000, incidenzaConsuntivo: 42, scostamento: 1000 });
    const ditte = conto.righe.find((r) => r.key === "subappalti")!;
    expect(ditte.scostamento).toBe(1000);
    const prof = conto.righe.find((r) => r.key === "professionisti")!;
    expect(prof.preventivo).toBeNull();
    expect(conto.ricavoMaturato).toBe(50000);
    expect(conto.costiPreventivo).toBe(70000);
    expect(conto.marginePreventivo).toBe(30000);
    expect(conto.margineMaturato).toBe(50000 - 44500);
    expect(conto.struttura).toEqual({ preventivo: 6000, consuntivo: 3000 });
    expect(conto.margineNettoPreventivo).toBe(24000);
    expect(conto.margineNettoMaturato).toBe(5500 - 3000);
  });

  it("senza avanzamento il consuntivo si legge sul ricavo intero; senza preventivo niente confronto", () => {
    const conto = contoEconomicoCommessa({ ricavi: 10000, avanzamentoPct: null, consuntivo: consuntivo({ acquisti: 1000, magazzino: 0, manodopera: 0, persone: 0, provvigioni: 0, rimborsi: 0, errori: 0, diretti: 0, direttiPerTipo: {} }),
      previsto: { materiali: 0, manodopera: 0, ditte: 0 }, struttura: { mensile: null, mesiPrevisti: null, mesiMaturati: null } });
    expect(conto.haPreventivo).toBe(false);
    expect(conto.ricavoMaturato).toBe(10000);
    expect(conto.righe.find((r) => r.key === "materiali")).toMatchObject({ preventivo: null, scostamento: null, incidenzaConsuntivo: 10 });
    // Voci vuote e senza preventivo spariscono, tranne materiali e manodopera.
    expect(conto.righe.map((r) => r.key)).toEqual(["materiali", "manodopera"]);
    expect(conto.margineNettoMaturato).toBeNull();
  });

  it("il tipo del fornitore decide la voce", () => {
    expect(voceDaTipoFornitore("materiali")).toBe("materiali");
    expect(voceDaTipoFornitore("subappalto")).toBe("subappalti");
    expect(voceDaTipoFornitore("mezzi")).toBe("noleggi");
    expect(voceDaTipoFornitore("generali")).toBe("cantiere");
    expect(voceDaTipoFornitore(null)).toBe("cantiere");
  });

  it("quota del costo diretto con la regola della vista del margine", () => {
    const base: Parameters<typeof quotaCostoDiretto>[0] = { order_id: "o1", amount: 1000, allocations: [], purchase_order_id: null, order_external_team_id: null };
    expect(quotaCostoDiretto(base, "o1")).toBe(1000);
    expect(quotaCostoDiretto({ ...base, allocations: [{ order_id: "o1", pct: 40 }, { order_id: "o2", pct: 60 }] }, "o1")).toBe(400);
    // Ripartito: conta la ripartizione anche se il costo è intestato alla commessa.
    expect(quotaCostoDiretto({ ...base, allocations: [{ order_id: "o2", pct: 100 }] }, "o1")).toBe(0);
    expect(quotaCostoDiretto({ ...base, purchase_order_id: "po" }, "o1")).toBe(0);
    expect(quotaCostoDiretto({ ...base, order_external_team_id: "t" }, "o1")).toBe(0);
    expect(quotaCostoDiretto({ ...base, order_id: "o2" }, "o1")).toBe(0);
  });
});
