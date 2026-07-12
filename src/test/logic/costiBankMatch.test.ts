import { describe, expect, it } from "vitest";
import { matchCostsToBankTransactions, type BankTxLite } from "@/lib/costiBankMatch";
import type { UnifiedCost } from "@/lib/costsUtils";

/** Ponte costi ↔ banca (12/7/2026): match euristico su importo/data/fornitore. */
function cost(p: Partial<UnifiedCost> & { id: string; amount: number; due_date: string }): UnifiedCost {
  return {
    name: `Costo ${p.id}`,
    cost_type: "variable",
    category: "Fornitori",
    recurrence: "una_tantum",
    is_paid: false,
    paid_date: null,
    notes: null,
    order_id: null,
    order: null,
    isFromOrder: false,
    ...p,
  } as UnifiedCost;
}

const tx = (id: string, booking_date: string, amount: number, description = ""): BankTxLite =>
  ({ id, booking_date, amount, description, creditor_name: null });

describe("costiBankMatch", () => {
  it("match forte su importo lordo esatto + data vicina + fornitore citato", () => {
    const costs = [cost({ id: "c1", amount: 1000, vat_rate: 22, due_date: "2026-06-10", supplierName: "Isolanti Termici Emilia S.r.l." })];
    const txs = [tx("t1", "2026-06-12", -1220, "BONIFICO ISOLANTI TERMICI EMILIA")];
    const m = matchCostsToBankTransactions(costs, txs);
    expect(m).toHaveLength(1);
    expect(m[0].strength).toBe("forte");
    expect(m[0].amountKind).toBe("lordo");
    expect(m[0].tx.id).toBe("t1");
  });

  it("match sul netto senza fornitore: la distanza data decide la forza", () => {
    const costs = [cost({ id: "c1", amount: 500, due_date: "2026-06-10" })];
    // 40 (netto) + 30 (stesso giorno) = 70 → forte
    expect(matchCostsToBankTransactions(costs, [tx("t1", "2026-06-10", -500)])[0].strength).toBe("forte");
    // 40 (netto) + 30-20 (80gg/4) = 50 → possibile
    expect(matchCostsToBankTransactions(costs, [tx("t2", "2026-08-29", -500)])[0].strength).toBe("possibile");
  });

  it("fuori finestra temporale o importo lontano → nessuna proposta", () => {
    const costs = [cost({ id: "c1", amount: 500, due_date: "2026-06-10" })];
    expect(matchCostsToBankTransactions(costs, [tx("t1", "2025-12-01", -500)])).toHaveLength(0); // troppo presto
    expect(matchCostsToBankTransactions(costs, [tx("t2", "2026-06-10", -750)])).toHaveLength(0); // importo diverso
    expect(matchCostsToBankTransactions(costs, [tx("t3", "2026-06-10", 500)])).toHaveLength(0);  // è un accredito
  });

  it("greedy: un movimento chiude un solo costo (vince il punteggio più alto)", () => {
    const costs = [
      cost({ id: "vicino",  amount: 500, due_date: "2026-06-10" }),
      cost({ id: "lontano", amount: 500, due_date: "2026-04-20" }),
    ];
    const m = matchCostsToBankTransactions(costs, [tx("t1", "2026-06-11", -500)]);
    expect(m).toHaveLength(1);
    expect(m[0].cost.id).toBe("vicino");
  });

  it("ignora costi già pagati e scadenze sentinella", () => {
    const costs = [
      cost({ id: "pagato", amount: 500, due_date: "2026-06-10", is_paid: true }),
      cost({ id: "sentinella", amount: 500, due_date: "9999-12-31" }),
    ];
    expect(matchCostsToBankTransactions(costs, [tx("t1", "2026-06-10", -500)])).toHaveLength(0);
  });
});
