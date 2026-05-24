import { describe, expect, it } from "vitest";

import { validateCostFormData } from "@/hooks/useCompanyCostsMutations";
import { buildOrderItemCosts } from "@/lib/costsUtils";

describe("company costs derived from order items", () => {
  it("usa le date attese degli acconti e dei saldi come scadenze", () => {
    const [deposit, balance] = buildOrderItemCosts([
      {
        id: "item-1",
        name: "Infissi PVC",
        quantity: 1,
        purchase_price: 1000,
        payment_method: "50_50",
        supplier_id: "supplier-1",
        deposit_amount: 500,
        deposit_expected_date: "2026-05-10",
        deposit_paid: false,
        deposit_paid_date: null,
        balance_amount: 500,
        balance_expected_date: "2026-06-10",
        balance_paid: false,
        balance_paid_date: null,
        supplier: { name: "Fornitore A", vat_rate: 22 },
        order: { id: "order-1", order_code: "ORD-001" },
      },
    ]);

    expect(deposit.due_date).toBe("2026-05-10");
    expect(balance.due_date).toBe("2026-06-10");
  });

  it("usa la scadenza saldo anche per i pagamenti singoli non pagati", () => {
    const [singlePayment] = buildOrderItemCosts([
      {
        id: "item-2",
        name: "Porta blindata",
        quantity: 2,
        purchase_price: 750,
        payment_method: "bonifico",
        supplier_id: "supplier-2",
        balance_expected_date: "2026-07-15",
        is_paid: false,
        paid_date: null,
        supplier: { name: "Fornitore B", vat_rate: 10 },
        order: { id: "order-2", order_code: "ORD-002" },
      },
    ]);

    expect(singlePayment.amount).toBe(1500);
    expect(singlePayment.due_date).toBe("2026-07-15");
  });
});

describe("company cost form validation", () => {
  it("non blocca un costo ricorrente senza data fine", () => {
    expect(() =>
      validateCostFormData({
        name: "Affitto ufficio",
        cost_type: "fixed",
        amount: "1200",
        category: "Affitto",
        recurrence: "monthly",
        due_date: "2026-05-31",
        notes: "",
        order_id: "",
        supplier_id: "",
        vat_rate: "22",
        is_gross: false,
        end_date: "",
        recurrence_auto: true,
      }),
    ).not.toThrow();
  });

  it("blocca una data fine ricorrenza precedente alla scadenza", () => {
    expect(() =>
      validateCostFormData({
        name: "Canone software",
        cost_type: "fixed",
        amount: "99",
        category: "Software",
        recurrence: "monthly",
        due_date: "2026-05-31",
        notes: "",
        order_id: "",
        supplier_id: "",
        vat_rate: "22",
        is_gross: false,
        end_date: "2026-04-30",
        recurrence_auto: false,
      }),
    ).toThrow("La data fine contratto non può precedere la prima scadenza.");
  });
});
