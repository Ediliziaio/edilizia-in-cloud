import { describe, expect, it } from "vitest";
import { commissionContractFigures, type CommissionContract } from "@/lib/orders/commissionContractDetails";

export const contract = (patch: Partial<CommissionContract> = {}): CommissionContract => ({
  id: "order1", order_code: "ORD-1", description: "Ristrutturazione", created_at: "2026-01-01", total_amount: 1000, vat_rate: 22,
  financing_cost: 0, payment_type: "standard", workflow_kind: "commessa", parent_contract_id: null,
  customer: { first_name: "Mario", last_name: "Cliente" }, status: { name: "In lavorazione" }, variazioni: [],
  installments: [
    { id: "r1", position: 0, type: "deposit", label: "Acconto", amount: 220, is_paid: true, paid_date: "2026-01-05", expected_date: "2026-01-05" },
    { id: "r2", position: 1, type: "balance", label: "Saldo", amount: 0, is_paid: false, expected_date: "2026-02-01" },
  ], ...patch,
});

describe("Incassi nel popup provvigioni", () => {
  it("distingue valore netto, incassi e residuo con saldo calcolato", () => {
    const f = commissionContractFigures(contract(), "2026-03-01");
    expect(f.agreed).toBe(1000); expect(f.totals.incassatoLordo).toBe(220); expect(f.totals.daIncassareLordo).toBe(1000);
    expect(f.rows[1]).toMatchObject({ total: 1000, due: 1000, received: 0, status: "Scaduta" });
  });
  it("conteggia incassi parziali delle fatture senza dichiarare pagata tutta la rata", () => {
    const o = contract(); o.installments[1].fattura = { id: "f1", numero: "10", stato: "emesso", importo_pagato: 400 }; o.installments[1].documento_fiscale_id = "f1";
    const f = commissionContractFigures(o, "2026-03-01");
    expect(f.totals.incassatoLordo).toBe(620); expect(f.rows[1]).toMatchObject({ received: 400, due: 600, status: "Parziale" });
  });
  it("include solo varianti approvate e rileva quote non pianificate dopo il saldo pagato", () => {
    const o = contract({ variazioni: [ { status: "approvato", impatto_economico: 100, firmato_il: "2026-03-01" }, { status: "in_attesa", impatto_economico: 900 } ] });
    o.installments[1].is_paid = true; o.installments[1].paid_date = "2026-02-01";
    const f = commissionContractFigures(o, "2026-03-01");
    expect(f.agreed).toBe(1100); expect(f.totals.incassatoLordo).toBe(1220); expect(f.totals.daIncassareLordo).toBe(122); expect(f.unplanned).toBe(122);
  });
  it("legge anche le rate delle commesse storiche", () => {
    const f = commissionContractFigures(contract({ installments: [], deposit_amount: 220, deposit_paid: true, balance_paid: false }), "2026-03-01");
    expect(f.totals.incassatoLordo).toBe(220); expect(f.rows).toHaveLength(2); expect(f.rows[1].due).toBe(1000);
  });
  it("considera l'erogazione al netto della trattenuta della finanziaria", () => {
    const o = contract({ payment_type: "financing", financing_cost: 20, financing_cost_mode: "trattenuto", installments: [
      { id: "f", position: 0, label: "Finanziamento", type: "financing", amount: 1220, is_paid: true },
      { id: "s", position: 1, label: "Saldo", type: "balance", amount: 0, is_paid: false },
    ] });
    const f = commissionContractFigures(o, "2026-03-01");
    expect(f.totals.incassatoLordo).toBe(1200); expect(f.totals.daIncassareLordo).toBe(0); expect(f.rows[1].status).toBe("Non dovuta");
  });
});
