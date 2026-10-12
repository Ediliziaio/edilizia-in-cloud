// src/test/logic/commesseIncassatoDaRate.test.ts
//
// Incassato e Da Ricevere della pagina Commesse, in IVATO (IVA inclusa),
// coerenti con "Venduto / Tot. Ivato". La fonte di verità sono le rate vere
// (order_installments): il saldo finale è il residuo del totale ivato, così i
// due numeri tornano sempre al venduto. Le commesse più vecchie, senza rate,
// usano le colonne-riassunto (sempre in lordo).
import { describe, expect, it } from "vitest";
import { getAmountCollected, getAmountDue, getGrossOrderAmount, type OrderWithDetails } from "@/lib/orderUtils";

const base: OrderWithDetails = {
  id: "o1",
  order_code: "C-1",
  description: "Commessa",
  total_amount: 0,
  deposit_amount: 0,
  deposit_paid: false,
  deposit_2_amount: 0,
  deposit_2_paid: false,
  balance_amount: 0,
  balance_paid: false,
  expected_date: null,
  warehouse_arrival_date: null,
  created_at: "2026-01-01",
  current_status_id: null,
  customer: null,
  status: null,
};

const commessa = (patch: Partial<OrderWithDetails>): OrderWithDetails => ({ ...base, ...patch });

describe("Commesse — Incassato e Da Ricevere dalle rate vere, in IVATO", () => {
  it("un piano con due rate di saldo somma al 100% dell'ivato, senza perderne nessuna", () => {
    // 100.000 imponibile + 10% = 110.000 ivato. Un SAL intermedio (44.000) e il
    // saldo finale (33.000) sono ENTRAMBI di tipo 'balance': il mirror a quattro
    // slot ne perdeva uno, le rate vere no.
    const ordine = commessa({
      total_amount: 100000,
      vat_rate: 10,
      installments: [
        { position: 0, type: "deposit", amount: 33000, is_paid: true },
        { position: 1, type: "balance", amount: 44000, is_paid: true },
        { position: 2, type: "balance", amount: 33000, is_paid: true },
      ],
    });
    expect(getAmountCollected(ordine)).toBe(110000);
    expect(getAmountDue(ordine)).toBe(0);
  });

  it("usa la position, non l'ordine di arrivo delle rate: il saldo finale resta l'ultimo", () => {
    // Le rate arrivano in ordine sparso (il nested select non le ordina). Il saldo
    // finale (position 2, non pagato) ha un importo salvato (5.000) DIVERSO dal
    // residuo: con la position si incassano solo acconto + SAL intermedio = 50.000.
    // Se si guardasse l'ordine dell'array, il SAL intermedio verrebbe scambiato
    // per saldo finale e l'incassato salirebbe a 105.000 — il test lo esclude.
    const ordine = commessa({
      total_amount: 100000,
      vat_rate: 10,
      installments: [
        { position: 2, type: "balance", amount: 5000, is_paid: false }, // saldo finale (residuo), non pagato
        { position: 0, type: "deposit", amount: 20000, is_paid: true },
        { position: 1, type: "balance", amount: 30000, is_paid: true }, // SAL intermedio, pagato
      ],
    });
    expect(getAmountCollected(ordine)).toBe(50000);
    expect(getAmountDue(ordine)).toBe(60000);
  });

  it("il saldo finale è il residuo del totale ivato, non l'importo salvato", () => {
    // Il saldo finale ha un importo salvato sbagliato (1), ma vale il residuo
    // 110.000 − 33.000 − 44.000 = 33.000: incassato + da ricevere torna comunque.
    const ordine = commessa({
      total_amount: 100000,
      vat_rate: 10,
      installments: [
        { position: 0, type: "deposit", amount: 33000, is_paid: true },
        { position: 1, type: "balance", amount: 44000, is_paid: false },
        { position: 2, type: "balance", amount: 1, is_paid: false },
      ],
    });
    expect(getAmountCollected(ordine)).toBe(33000);
    expect(getAmountDue(ordine)).toBe(77000);
    expect(getAmountCollected(ordine) + getAmountDue(ordine)).toBeCloseTo(getGrossOrderAmount(ordine), 2);
  });

  it("Incassato + Da Ricevere torna al Venduto, sia a piano completo sia a metà", () => {
    const completo = commessa({
      total_amount: 10000,
      vat_rate: 22,
      installments: [
        { position: 0, type: "deposit", amount: 4000, is_paid: true },
        { position: 1, type: "balance", amount: 8200, is_paid: true },
      ],
    });
    const venduto = getGrossOrderAmount(completo); // 12.200
    expect(venduto).toBe(12200);
    expect(getAmountCollected(completo)).toBe(12200);
    expect(getAmountDue(completo)).toBe(0);
    expect(getAmountCollected(completo) + getAmountDue(completo)).toBeCloseTo(venduto, 2);

    const aMeta = commessa({
      total_amount: 10000,
      vat_rate: 22,
      installments: [
        { position: 0, type: "deposit", amount: 4000, is_paid: true },
        { position: 1, type: "balance", amount: 8200, is_paid: false },
      ],
    });
    expect(getAmountCollected(aMeta)).toBe(4000);
    expect(getAmountDue(aMeta)).toBe(8200);
    expect(getAmountCollected(aMeta) + getAmountDue(aMeta)).toBeCloseTo(getGrossOrderAmount(aMeta), 2);
  });

  it("le commesse senza rate usano le colonne-riassunto, in lordo e senza cap al netto", () => {
    // Prima l'incassato veniva troncato all'imponibile (10.000). Le colonne
    // sono già lorde: l'incassato corretto è 12.200 (= totale ivato).
    const saldata = commessa({
      total_amount: 10000,
      vat_rate: 22,
      deposit_amount: 4000,
      deposit_paid: true,
      balance_amount: 8200,
      balance_paid: true,
    });
    expect(getAmountCollected(saldata)).toBe(12200);
    expect(getAmountDue(saldata)).toBe(0);

    const soloAcconto = commessa({
      total_amount: 10000,
      vat_rate: 22,
      deposit_amount: 4000,
      deposit_paid: true,
      balance_amount: 8200,
      balance_paid: false,
    });
    expect(getAmountCollected(soloAcconto)).toBe(4000);
    expect(getAmountDue(soloAcconto)).toBe(8200);
  });

  it("nel finanziamento il costo della finanziaria esce dalla base da incassare", () => {
    // 10.000 + 22% = 12.200 ivato; costo finanziaria 200 → incassabile 12.000.
    // La quota finanziata conta come incassata (l'ha versata la finanziaria).
    const ordine = commessa({
      total_amount: 10000,
      vat_rate: 22,
      payment_type: "financing",
      financing_cost: 200,
      installments: [
        { position: 0, type: "financing", amount: 12000, is_paid: true },
        { position: 1, type: "balance", amount: 0, is_paid: false },
      ],
    });
    expect(getAmountCollected(ordine)).toBe(12000);
    expect(getAmountDue(ordine)).toBe(0);
  });
});
