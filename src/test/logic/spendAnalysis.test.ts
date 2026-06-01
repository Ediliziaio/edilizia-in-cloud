import { describe, expect, it } from "vitest";
import {
  computePriceBenchmarks,
  formatShare,
  summarizeInvoiceSpend,
  summarizeSupplierSpend,
  totalPotentialSaving,
  type InvoiceSpendRow,
  type PurchaseLine,
  type SupplierSpendRow,
} from "@/lib/procurement/spendAnalysis";

function supplier(partial: Partial<SupplierSpendRow> & { supplier_id: string }): SupplierSpendRow {
  return {
    name: null,
    product_category: null,
    is_active: true,
    is_foreign: false,
    purchase_order_count: 0,
    purchase_order_total: 0,
    open_due_count: 0,
    open_due_amount: 0,
    last_purchase_order_date: null,
    ...partial,
  };
}

describe("summarizeSupplierSpend", () => {
  it("gestisce input vuoto senza eccezioni", () => {
    const s = summarizeSupplierSpend([]);
    expect(s.totalSpend).toBe(0);
    expect(s.supplierCount).toBe(0);
    expect(s.topSupplier).toBeNull();
    expect(s.concentrationTop3).toBe(0);
    expect(s.avgOrderValue).toBe(0);
  });

  it("aggrega totali, classifica e calcola le quote", () => {
    const rows = [
      supplier({ supplier_id: "a", name: "Alfa", purchase_order_total: 6000, purchase_order_count: 3 }),
      supplier({ supplier_id: "b", name: "Beta", purchase_order_total: 3000, purchase_order_count: 1 }),
      supplier({ supplier_id: "c", name: "Gamma", purchase_order_total: 1000, purchase_order_count: 1 }),
      supplier({ supplier_id: "d", name: "Delta", purchase_order_total: 0, purchase_order_count: 0 }),
    ];
    const s = summarizeSupplierSpend(rows);
    expect(s.totalSpend).toBe(10000);
    expect(s.totalOrders).toBe(5);
    expect(s.supplierCount).toBe(3); // Delta (0) escluso
    expect(s.avgOrderValue).toBe(2000);
    expect(s.topSupplier?.name).toBe("Alfa");
    expect(s.topSupplier?.share).toBeCloseTo(0.6, 5);
    expect(s.ranked.map((r) => r.name)).toEqual(["Alfa", "Beta", "Gamma"]);
    expect(s.concentrationTop3).toBeCloseTo(1, 5);
  });

  it("coerce stringhe numeriche (numeric Postgres) e somma scaduto aperto", () => {
    const rows = [
      supplier({ supplier_id: "a", name: "Alfa", purchase_order_total: "1500.50" as unknown as number, open_due_amount: "500" as unknown as number }),
    ];
    const s = summarizeSupplierSpend(rows);
    expect(s.totalSpend).toBeCloseTo(1500.5, 2);
    expect(s.totalOpenDue).toBe(500);
  });
});

describe("computePriceBenchmarks", () => {
  function line(partial: Partial<PurchaseLine>): PurchaseLine {
    return {
      description: null,
      sku: null,
      article_template_id: null,
      unit_of_measure: null,
      quantity: 1,
      unit_price: 0,
      supplier_id: null,
      supplier_name: null,
      issue_date: null,
      ...partial,
    };
  }

  it("trova varianza di prezzo e calcola risparmio potenziale", () => {
    const lines = [
      line({ description: "Cemento 32.5", quantity: 100, unit_price: 10, supplier_name: "Caro", issue_date: "2026-01-10", supplier_id: "s1" }),
      line({ description: "Cemento 32.5", quantity: 100, unit_price: 8, supplier_name: "Economico", issue_date: "2026-02-10", supplier_id: "s2" }),
    ];
    const [b] = computePriceBenchmarks(lines);
    expect(b.label).toBe("Cemento 32.5");
    expect(b.minPrice).toBe(8);
    expect(b.maxPrice).toBe(10);
    expect(b.supplierCount).toBe(2);
    expect(b.purchaseCount).toBe(2);
    // (10-8)*100 + (8-8)*100 = 200
    expect(b.potentialSaving).toBe(200);
    expect(b.bestSupplierName).toBe("Economico");
    expect(b.lastSupplierName).toBe("Economico"); // 2026-02 è più recente
    expect(b.spread).toBeCloseTo(0.2, 5);
    expect(b.avgPrice).toBeCloseTo(9, 5); // (1000+800)/200
  });

  it("raggruppa per article_template_id anche con descrizioni diverse", () => {
    const lines = [
      line({ article_template_id: "tpl-1", description: "Tubo PVC ø100", quantity: 10, unit_price: 5 }),
      line({ article_template_id: "tpl-1", description: "TUBO pvc 100mm", quantity: 10, unit_price: 4 }),
    ];
    const res = computePriceBenchmarks(lines);
    expect(res).toHaveLength(1);
    expect(res[0].purchaseCount).toBe(2);
    expect(res[0].potentialSaving).toBe(10); // (5-4)*10
  });

  it("ignora prezzi non positivi e azzera quantità negative", () => {
    const lines = [
      line({ sku: "ABC", quantity: 5, unit_price: 0 }), // ignorata (prezzo 0)
      line({ sku: "ABC", quantity: 5, unit_price: 12 }),
      line({ sku: "ABC", quantity: -3, unit_price: 10 }), // qty → 0
    ];
    const res = computePriceBenchmarks(lines, { minPurchases: 2 });
    expect(res).toHaveLength(1);
    expect(res[0].purchaseCount).toBe(2); // la riga a prezzo 0 è esclusa
    // min=10, righe valide: (12,5)->(12-10)*5=10 ; (10,0)->0  => 10
    expect(res[0].potentialSaving).toBe(10);
  });

  it("esclude gruppi senza varianza o con meno di minPurchases", () => {
    const lines = [
      line({ sku: "ONE", quantity: 1, unit_price: 5 }), // singolo → escluso
      line({ sku: "FLAT", quantity: 1, unit_price: 7 }),
      line({ sku: "FLAT", quantity: 1, unit_price: 7 }), // nessuna varianza → escluso
    ];
    expect(computePriceBenchmarks(lines)).toHaveLength(0);
  });

  it("totalPotentialSaving somma su tutti i gruppi", () => {
    const lines = [
      line({ sku: "A", quantity: 10, unit_price: 10 }),
      line({ sku: "A", quantity: 10, unit_price: 9 }),
      line({ sku: "B", quantity: 1, unit_price: 100 }),
      line({ sku: "B", quantity: 1, unit_price: 80 }),
    ];
    const res = computePriceBenchmarks(lines);
    // A: (10-9)*10=10 ; B: (100-80)*1=20 → 30
    expect(totalPotentialSaving(res)).toBe(30);
  });
});

describe("summarizeInvoiceSpend", () => {
  function inv(partial: Partial<InvoiceSpendRow>): InvoiceSpendRow {
    return {
      cedente_ragione_sociale: null,
      cedente_piva: null,
      data_fattura: null,
      imponibile_totale: 0,
      totale_documento: 0,
      tipo_documento: "TD01",
      ...partial,
    };
  }

  it("gestisce input vuoto", () => {
    const s = summarizeInvoiceSpend([]);
    expect(s.invoiceCount).toBe(0);
    expect(s.supplierCount).toBe(0);
    expect(s.totalImponibile).toBe(0);
  });

  it("aggrega per P.IVA e tiene la fattura più recente", () => {
    const rows = [
      inv({ cedente_piva: "IT01", cedente_ragione_sociale: "Alfa", imponibile_totale: 1000, totale_documento: 1220, data_fattura: "2026-01-01" }),
      inv({ cedente_piva: "IT01", cedente_ragione_sociale: "Alfa Srl", imponibile_totale: 500, totale_documento: 610, data_fattura: "2026-03-01" }),
      inv({ cedente_piva: "IT02", cedente_ragione_sociale: "Beta", imponibile_totale: 800, totale_documento: 976, data_fattura: "2026-02-01" }),
    ];
    const s = summarizeInvoiceSpend(rows);
    expect(s.invoiceCount).toBe(3);
    expect(s.supplierCount).toBe(2);
    expect(s.totalImponibile).toBe(2300);
    expect(s.ranked[0].piva).toBe("IT01");
    expect(s.ranked[0].totalImponibile).toBe(1500);
    expect(s.ranked[0].invoiceCount).toBe(2);
    expect(s.ranked[0].lastInvoiceDate).toBe("2026-03-01");
    expect(s.ranked[0].share).toBeCloseTo(1500 / 2300, 5);
  });

  it("le note di credito (TD04) sottraggono spesa", () => {
    const rows = [
      inv({ cedente_piva: "IT01", imponibile_totale: 1000, totale_documento: 1220 }),
      inv({ cedente_piva: "IT01", imponibile_totale: 200, totale_documento: 244, tipo_documento: "TD04" }),
    ];
    const s = summarizeInvoiceSpend(rows);
    expect(s.totalImponibile).toBe(800);
    expect(s.ranked[0].totalImponibile).toBe(800);
  });
});

describe("formatShare", () => {
  it("formatta quote come percentuale italiana", () => {
    expect(formatShare(0.185)).toBe("18,5%");
    expect(formatShare(1)).toBe("100%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(Number.NaN)).toBe("0%");
  });
});
