import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { copertura, idABlocchi, margineCommesseNelPeriodo } from "@/lib/cruscottoMargine";

describe("cruscotto: margine commesse nel periodo", () => {
  it("è la somma dei margini sulla somma dei preventivi totali della vista", () => {
    expect(margineCommesseNelPeriodo([
      { margine: 300, preventivo_totale: 1000, consuntivo: 700 },
      { margine: "-100", preventivo_totale: "1000", consuntivo: "1100" },
    ])).toBeCloseTo(10, 6);
  });

  it("una commessa senza costi resta fuori: non è un margine del 100%", () => {
    // Ke Bei, 29/10/2026: 345 commesse col ricavo e nessun costo facevano «100%».
    const righe = [
      { margine: 300, preventivo_totale: 1000, consuntivo: 700 },
      { margine: 18000, preventivo_totale: 18000, consuntivo: 0 },
      { margine: 5000, preventivo_totale: 5000, consuntivo: null },
    ];
    expect(margineCommesseNelPeriodo(righe)).toBeCloseTo(30, 6);
    expect(copertura(righe)).toEqual({ conCosti: 1, senzaCosti: 2 });
    expect(margineCommesseNelPeriodo(righe.slice(1))).toBe(0);
  });

  it("senza preventivi è zero, e resta fra −100 e 100", () => {
    expect(margineCommesseNelPeriodo([])).toBe(0);
    expect(margineCommesseNelPeriodo([{ margine: 50, preventivo_totale: 0, consuntivo: 10 }])).toBe(0);
    expect(margineCommesseNelPeriodo([{ margine: -5000, preventivo_totale: 1000, consuntivo: 6000 }])).toBe(-100);
  });

  it("divide gli id in blocchi", () => {
    expect(idABlocchi(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
    expect(idABlocchi([])).toEqual([]);
  });

  it("il cruscotto legge la vista per le commesse del periodo e lascia fuori il cestino dai crediti", () => {
    const src = readFileSync(resolve(process.cwd(), "src/hooks/useCruscottoData.ts"), "utf8");
    expect(src).toContain('.from("v_ordine_marginalita")');
    expect(src).toContain('.select("id, margine, preventivo_totale, consuntivo, variazioni_approvate")');
    expect(src).toContain("margineCommesseNelPeriodo(margini)");
    // Le rate da incassare le calcola il database (cruscotto_rate_da_incassare →
    // rate_da_incassare → rate_importi, che lascia fuori le commesse nel cestino):
    // la vecchia lettura con orders!inner(deleted_at) non c'è più.
    expect(src).toContain('rpc("cruscotto_rate_da_incassare", { p_company_id: companyId })');
    expect(src).not.toContain('.from("order_installments").select("id, order_id, amount');
  });
});
