import { describe, expect, it } from "vitest";
import { ALL_RECIPES } from "@/lib/dashboardBuilder/widgetRecipes";

const testoDi = (r: (typeof ALL_RECIPES)[number]) => `${r.label} ${r.description ?? ""} ${String(r.defaultConfig?.title ?? "")}`;

describe("ricette dei widget: il nome dice cosa conta la metrica", () => {
  it("gli incassi leggono i pagamenti delle fatture (revenue_real)", () => {
    const incassi = ALL_RECIPES.filter(r => /incass/i.test(testoDi(r)) && !/scadut|forecast|previsione/i.test(testoDi(r)));
    expect(incassi.length).toBeGreaterThan(0);
    for (const r of incassi) expect(r.defaultConfig?.metric).toBe("revenue_real");
  });

  it("payments_real sono i pagamenti ai fornitori, IVA esclusa", () => {
    const pagamenti = ALL_RECIPES.filter(r => r.defaultConfig?.metric === "payments_real");
    expect(pagamenti.length).toBeGreaterThan(0);
    for (const r of pagamenti) {
      expect(r.label).toBe("Pagamenti ai fornitori (IVA esclusa)");
      expect(r.defaultConfig?.title).toBe("Pagamenti ai fornitori (IVA esclusa)");
    }
  });

  it("il fatturato su revenue_real non promette «ordini consegnati/chiusi»", () => {
    for (const r of ALL_RECIPES.filter(x => x.defaultConfig?.metric === "revenue_real")) {
      expect(testoDi(r)).not.toMatch(/consegnat|chius/i);
    }
  });
});
