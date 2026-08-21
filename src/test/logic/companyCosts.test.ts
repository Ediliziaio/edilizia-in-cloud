import { describe, expect, it } from "vitest";

import { validateCostFormData } from "@/hooks/useCompanyCostsMutations";
import { buildEmployeeCosts, buildOrderItemCosts } from "@/lib/costsUtils";
import { addMonths, format, startOfMonth } from "date-fns";

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

describe("stipendi sintetici dai dipendenti attivi", () => {
  const emp = {
    id: "emp-1",
    first_name: "Mario",
    last_name: "Rossi",
    gross_salary: 2000,
    inps_rate: 28,
    // due mesi fa: lo storico parte da qui
    created_at: format(addMonths(new Date(), -2), "yyyy-MM-dd"),
  };

  it("senza orizzonte si ferma al mese corrente (viste operative)", () => {
    const rows = buildEmployeeCosts([emp]);
    const meseCorrente = format(startOfMonth(new Date()), "yyyy-MM");
    const mesi = new Set(rows.map((r) => r.due_date.slice(0, 7)));
    expect(mesi.has(meseCorrente)).toBe(true);
    const prossimo = format(addMonths(startOfMonth(new Date()), 1), "yyyy-MM");
    expect(mesi.has(prossimo)).toBe(false);
  });

  it("con orizzonte proietta i mesi FUTURI, non pagati (viste di pianificazione)", () => {
    const rows = buildEmployeeCosts([emp], 3);
    const prossimo = format(addMonths(startOfMonth(new Date()), 1), "yyyy-MM");
    const futuri = rows.filter((r) => r.due_date.slice(0, 7) === prossimo);
    // stipendio + oneri INPS per il mese prossimo
    expect(futuri).toHaveLength(2);
    expect(futuri.every((r) => r.is_paid === false)).toBe(true);
    // 2000 lordo + 560 oneri
    expect(futuri.reduce((s, r) => s + r.amount, 0)).toBe(2560);
  });

  it("i mesi chiusi restano presunti pagati, il corrente no", () => {
    const rows = buildEmployeeCosts([emp], 0);
    const meseCorrente = format(startOfMonth(new Date()), "yyyy-MM");
    for (const r of rows) {
      const chiuso = r.due_date.slice(0, 7) < meseCorrente;
      expect(r.is_paid).toBe(chiuso);
    }
  });
});
