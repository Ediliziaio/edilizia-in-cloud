import { describe, it, expect } from "vitest";

/**
 * Le regole di scontistica valevano in 2 preventivatori su 10; ora ne governano
 * 10 tramite ScontoGlobaleField. La libreria non aveva test: da qui in poi sì,
 * perché uno sbaglio qui o blocca uno sconto legittimo o ne lascia passare uno
 * fuori regola in tutti i verticali insieme.
 */
import {
  evaluateDiscountRules,
  classifyDiscount,
} from "@/lib/serramenti/discountRules";
import type { DiscountRule } from "@/hooks/useDiscountRules";

function regola(patch: Partial<DiscountRule>): DiscountRule {
  return {
    id: patch.id ?? "r1",
    company_id: "c1",
    name: patch.name ?? "Regola",
    scope: patch.scope ?? "globale",
    salesperson_id: patch.salesperson_id ?? null,
    client_category: patch.client_category ?? null,
    tipo_lavoro: patch.tipo_lavoro ?? null,
    importo_min: patch.importo_min ?? null,
    importo_max: patch.importo_max ?? null,
    margine_min_pct: patch.margine_min_pct ?? 0,
    sconto_max_pct: patch.sconto_max_pct ?? 10,
    approva_oltre_pct: patch.approva_oltre_pct ?? null,
    priority: patch.priority ?? 100,
    is_active: patch.is_active ?? true,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

describe("evaluateDiscountRules", () => {
  it("senza regole ricade sul massimo predefinito e lo dichiara", () => {
    const e = evaluateDiscountRules([], { importo: 10_000 });
    expect(e.isFallback).toBe(true);
    expect(e.scontoMaxPct).toBe(10);
    expect(e.primaryRule).toBeNull();
  });

  it("ignora le regole disattivate", () => {
    const e = evaluateDiscountRules(
      [regola({ sconto_max_pct: 40, is_active: false })],
      { importo: 10_000 },
    );
    expect(e.isFallback).toBe(true);
  });

  it("fra più regole vince sempre la più restrittiva", () => {
    const e = evaluateDiscountRules(
      [
        regola({ id: "a", name: "Larga", sconto_max_pct: 30, margine_min_pct: 5, approva_oltre_pct: 20, priority: 1 }),
        regola({ id: "b", name: "Stretta", sconto_max_pct: 12, margine_min_pct: 18, approva_oltre_pct: 8, priority: 2 }),
      ],
      { importo: 10_000 },
    );
    expect(e.scontoMaxPct).toBe(12);
    expect(e.approvaOltrePct).toBe(8);
    expect(e.margineMinPct).toBe(18);
    // La "principale" è quella con priorità più bassa, non la più restrittiva.
    expect(e.primaryRule?.id).toBe("a");
  });

  it("la fascia importo esclude le regole fuori portata", () => {
    const regole = [regola({ sconto_max_pct: 25, importo_min: 50_000 })];
    expect(evaluateDiscountRules(regole, { importo: 10_000 }).isFallback).toBe(true);
    expect(evaluateDiscountRules(regole, { importo: 60_000 }).scontoMaxPct).toBe(25);
  });

  it("una regola legata a un tipo lavoro vale solo per quel verticale", () => {
    const regole = [regola({ sconto_max_pct: 25, tipo_lavoro: "bagni" })];
    expect(evaluateDiscountRules(regole, { importo: 1_000, tipoLavoro: "bagni" }).scontoMaxPct).toBe(25);
    expect(evaluateDiscountRules(regole, { importo: 1_000, tipoLavoro: "tetti" }).isFallback).toBe(true);
    // Senza tipo lavoro nel contesto, una regola tipizzata non deve scattare.
    expect(evaluateDiscountRules(regole, { importo: 1_000 }).isFallback).toBe(true);
  });

  it("una regola per commerciale vale solo per quel commerciale", () => {
    const regole = [regola({ sconto_max_pct: 30, scope: "per_commerciale", salesperson_id: "s1" })];
    expect(evaluateDiscountRules(regole, { importo: 1_000, salespersonId: "s1" }).scontoMaxPct).toBe(30);
    expect(evaluateDiscountRules(regole, { importo: 1_000, salespersonId: "s2" }).isFallback).toBe(true);
    expect(evaluateDiscountRules(regole, { importo: 1_000 }).isFallback).toBe(true);
  });

  it("una regola per categoria cliente guarda i tag, senza distinzione di maiuscole", () => {
    const regole = [regola({ sconto_max_pct: 20, scope: "per_cliente_cat", client_category: "VIP" })];
    expect(evaluateDiscountRules(regole, { importo: 1_000, clientTags: ["vip"] }).scontoMaxPct).toBe(20);
    expect(evaluateDiscountRules(regole, { importo: 1_000, clientTags: ["base"] }).isFallback).toBe(true);
  });

  it("se nessuna regola matchante impone l'approvazione, la soglia resta assente", () => {
    const e = evaluateDiscountRules(
      [regola({ sconto_max_pct: 15, approva_oltre_pct: null })],
      { importo: 1_000 },
    );
    expect(e.approvaOltrePct).toBeNull();
  });
});

describe("classifyDiscount", () => {
  const limiti = { scontoMaxPct: 15, approvaOltrePct: 8 };

  it("sotto la soglia di approvazione è semplicemente ok", () => {
    expect(classifyDiscount(0, limiti)).toBe("ok");
    expect(classifyDiscount(8, limiti)).toBe("ok"); // il confine è incluso
  });

  it("fra soglia e massimo serve l'approvazione", () => {
    expect(classifyDiscount(8.1, limiti)).toBe("approve");
    expect(classifyDiscount(15, limiti)).toBe("approve");
  });

  it("oltre il massimo è bloccato", () => {
    expect(classifyDiscount(15.1, limiti)).toBe("blocked");
    expect(classifyDiscount(60, limiti)).toBe("blocked");
  });

  it("senza soglia di approvazione si è ok fino al massimo", () => {
    const senzaSoglia = { scontoMaxPct: 15, approvaOltrePct: null };
    expect(classifyDiscount(15, senzaSoglia)).toBe("ok");
    expect(classifyDiscount(15.5, senzaSoglia)).toBe("blocked");
  });
});
