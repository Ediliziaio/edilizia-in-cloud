import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { idABlocchi, margineCommesseNelPeriodo } from "@/lib/cruscottoMargine";

describe("cruscotto: margine commesse nel periodo", () => {
  it("è la somma dei margini sulla somma dei preventivi totali della vista", () => {
    expect(margineCommesseNelPeriodo([
      { margine: 300, preventivo_totale: 1000 },
      { margine: "-100", preventivo_totale: "1000" },
    ])).toBeCloseTo(10, 6);
  });

  it("senza preventivi è zero, e resta fra −100 e 100", () => {
    expect(margineCommesseNelPeriodo([])).toBe(0);
    expect(margineCommesseNelPeriodo([{ margine: 50, preventivo_totale: 0 }])).toBe(0);
    expect(margineCommesseNelPeriodo([{ margine: -5000, preventivo_totale: 1000 }])).toBe(-100);
  });

  it("divide gli id in blocchi", () => {
    expect(idABlocchi(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
    expect(idABlocchi([])).toEqual([]);
  });

  it("il cruscotto legge la vista per le commesse del periodo e lascia fuori il cestino dai crediti", () => {
    const src = readFileSync(resolve(process.cwd(), "src/hooks/useCruscottoData.ts"), "utf8");
    expect(src).toContain('.from("v_ordine_marginalita")');
    expect(src).toContain('.select("id, margine, preventivo_totale, variazioni_approvate")');
    expect(src).toContain("margineCommesseNelPeriodo(margini)");
    // Le rate da incassare le calcola il database (cruscotto_rate_da_incassare →
    // rate_da_incassare → rate_importi, che lascia fuori le commesse nel cestino):
    // la vecchia lettura con orders!inner(deleted_at) non c'è più.
    expect(src).toContain('rpc("cruscotto_rate_da_incassare", { p_company_id: companyId })');
    expect(src).not.toContain('.from("order_installments").select("id, order_id, amount');
  });
});
