import { describe, expect, it } from "vitest";
import {
  buildForecastLedger,
  emptyForecastSources,
  forecastExportRows,
  forecastWeeks,
  moveDay,
  projectForecast,
  resolveOpeningBalance,
  validDay,
  type ForecastMovement,
  type ForecastScenario,
} from "@/lib/finance/forecastLedger";
const today = "2026-10-14";
const scenario: ForecastScenario = {
  delayDays: 0,
  includeOverdueIncome: false,
  includeEstimates: true,
};
const movement = (
  changes: Partial<ForecastMovement> = {},
): ForecastMovement => ({
  id: "m",
  description: "Esempio",
  counterparty: "Cliente",
  category: "clienti",
  direction: "in",
  cents: 100000,
  date: today,
  source: "Rata",
  href: "/azienda/ordini/o",
  estimated: false,
  ...changes,
});

describe("a single cash forecast", () => {
  it("finds a mid-week deficit even when Friday closes positive", () => {
    const p = projectForecast(
      [
        movement({ id: "pay", direction: "out", cents: 1200000 }),
        movement({ id: "receive", date: "2026-10-16", cents: 1500000 }),
      ],
      1000000,
      today,
      90,
      0,
      scenario,
    );
    expect(p.minimum).toBe(-200000);
    expect(p.firstBelow).toBe(today);
    expect(p.finalBalance).toBe(1300000);
    expect(forecastWeeks(p.days)[0].minimum).toBe(-200000);
  });
  it("uses exactly 30 dates including today, consistently at the boundary", () => {
    const p = projectForecast(
      [
        movement({ date: moveDay(today, 29) }),
        movement({ id: "outside", date: moveDay(today, 30) }),
      ],
      0,
      today,
      30,
      0,
      scenario,
    );
    expect(p.days).toHaveLength(30);
    expect(p.income).toBe(100000);
    expect(p.days.at(-1)?.balance).toBe(p.finalBalance);
  });
  it("does not assume overdue income will arrive today", () => {
    const rows = [
      movement({ date: "2025-01-01" }),
      movement({
        id: "old-cost",
        direction: "out",
        date: "2025-01-01",
        cents: 250000,
      }),
    ];
    const p = projectForecast(rows, 300000, today, 30, 0, scenario);
    expect(p.overdueIncome).toHaveLength(1);
    expect(p.income).toBe(0);
    expect(p.expense).toBe(0);
    expect(p.finalBalance).toBe(300000);
    expect(
      projectForecast(rows, 300000, today, 30, 0, {
        ...scenario,
        includeOverdueIncome: true,
        includeOverdueExpense: true,
      }).finalBalance,
    ).toBe(150000);
  });
  it("keeps overdue unpaid expenses out of today unless asked, symmetric with income", () => {
    const rows = [
      movement({
        id: "old-cost",
        description: "Fornitore scaduto",
        direction: "out",
        date: "2026-09-01",
        cents: 930000,
      }),
      movement({ id: "future-cost", direction: "out", date: moveDay(today, 3), cents: 1000 }),
    ];
    const p = projectForecast(rows, -48415, today, 30, 0, scenario);
    expect(p.overdueExpense.map((m) => m.id)).toEqual(["old-cost"]);
    expect(p.days[0].balance).toBe(-48415);
    expect(forecastExportRows(p, -48415, 0, scenario).find((r) => r.descrizione === "Fornitore scaduto")?.inclusione).toBe(
      "Escluso: uscita scaduta non segnata pagata",
    );
    const withOverdue = projectForecast(rows, -48415, today, 30, 0, {
      ...scenario,
      includeOverdueExpense: true,
    });
    expect(withOverdue.overdueExpense).toHaveLength(0);
    expect(withOverdue.days[0].balance).toBe(-48415 - 930000);
  });
  it("moves a single receipt only in simulation, overriding the delay for that row", () => {
    const rows = [movement({ id: "sal", date: moveDay(today, 5) })];
    const p = projectForecast(rows, 0, today, 30, 0, {
      ...scenario,
      delayDays: 15,
      dateOverrides: { sal: moveDay(today, 25) },
    });
    expect(p.included[0].date).toBe(moveDay(today, 25));
    expect(p.included[0].note).toMatch(/solo simulazione/);
    expect(rows[0].date).toBe(moveDay(today, 5));
  });
  it("delays only income and declares an income pushed outside the period", () => {
    const rows = [
      movement({ date: moveDay(today, 20) }),
      movement({ id: "out", direction: "out", date: moveDay(today, 20) }),
    ];
    const p = projectForecast(rows, 0, today, 30, 0, {
      ...scenario,
      delayDays: 15,
    });
    expect(p.income).toBe(0);
    expect(p.expense).toBe(100000);
    expect(p.included[0].date).toBe(moveDay(today, 20));
  });
  it("separates undated amounts from the graph and exports the exclusion", () => {
    const p = projectForecast(
      [movement({ date: null, cents: 51000 })],
      0,
      today,
      30,
      0,
      scenario,
    );
    expect(p.net).toBe(0);
    expect(p.undated).toHaveLength(1);
    expect(forecastExportRows(p, 0, 0, scenario)[0]).toMatchObject({
      data: "",
      importo: "510.00",
      inclusione: "Escluso: senza data",
    });
  });
  it("keeps unknown balances unknown, including the funding need", () => {
    const p = projectForecast([movement()], null, today, 30, 500000, scenario);
    expect(p.income).toBe(100000);
    expect(p.finalBalance).toBeNull();
    expect(p.minimum).toBeNull();
    expect(p.need).toBeNull();
  });
  it("shows the shortfall against an adjustable threshold, not only zero", () => {
    const p = projectForecast(
      [movement({ direction: "out", cents: 80000 })],
      200000,
      today,
      30,
      150000,
      scenario,
    );
    expect(p.minimum).toBe(120000);
    expect(p.need).toBe(30000);
    expect(p.firstBelow).toBe(today);
  });
  it("all weekly totals reconcile with daily totals and exported movements", () => {
    const rows = Array.from({ length: 85 }, (_, i) =>
      movement({
        id: String(i),
        date: moveDay(today, i),
        direction: i % 2 ? "in" : "out",
        cents: 101 + i,
      }),
    );
    const p = projectForecast(rows, 100000, today, 90, 0, scenario);
    const weeks = forecastWeeks(p.days);
    expect(weeks.reduce((s, w) => s + w.income, 0)).toBe(p.income);
    expect(weeks.reduce((s, w) => s + w.expense, 0)).toBe(p.expense);
    expect(weeks.at(-1)?.balance).toBe(p.finalBalance);
    const exported = forecastExportRows(p, 100000, 0, scenario);
    const exportNet = exported.reduce(
      (s, r) =>
        s +
        Math.round(Number(r.importo) * 100) *
          (r.direzione === "Entrata" ? 1 : -1),
      0,
    );
    expect(exportNet).toBe(p.net);
  });
  it("uses calendar days through both daylight-saving changes", () => {
    expect(moveDay("2026-10-25", 1)).toBe("2026-10-26");
    expect(moveDay("2026-03-29", 1)).toBe("2026-03-30");
    const weeks = forecastWeeks(
      projectForecast([], 0, "2026-10-19", 90, 0, scenario).days,
    );
    expect(weeks[1].start).toBe("2026-10-26");
    expect(weeks[2].start).toBe("2026-11-02");
    expect(validDay("2026-02-31")).toBeNull();
    expect(validDay("9999-12-31")).toBeNull();
  });
  it("distinguishes an actual zero from no bank data and missing account balances", () => {
    expect(resolveOpeningBalance([], []).cents).toBeNull();
    expect(
      resolveOpeningBalance(
        [
          {
            id: "b",
            current_balance: 0,
            available_balance: null,
            balance_updated_at: null,
          },
        ],
        [],
      ).cents,
    ).toBe(0);
    expect(
      resolveOpeningBalance(
        [
          {
            id: "b",
            current_balance: null,
            available_balance: null,
            balance_updated_at: null,
          },
        ],
        [],
      ).cents,
    ).toBeNull();
  });
  it("prefers available balances, using the oldest account refresh", () => {
    const opening = resolveOpeningBalance(
      [
        {
          id: "a",
          current_balance: 1000,
          available_balance: 900,
          balance_updated_at: "2026-10-14T12:00:00Z",
        },
        {
          id: "b",
          current_balance: 500,
          available_balance: null,
          balance_updated_at: "2026-10-12T12:00:00Z",
        },
      ],
      [{ id: "n", direction: "entrata", amount: 2000, entry_date: today }],
    );
    expect(opening.cents).toBe(140000);
    expect(opening.source).toBe("banca");
    expect(opening.updatedAt).toBe("2026-10-12T12:00:00Z");
  });
  it("does not add different currencies together", () => {
    expect(
      resolveOpeningBalance(
        [
          {
            id: "a",
            current_balance: 100,
            available_balance: 100,
            currency: "USD",
            balance_updated_at: null,
          },
        ],
        [],
      ).cents,
    ).toBeNull();
  });
});

describe("source amounts and exact duplicate links", () => {
  it("a linked partial supplier deposit does not suppress the other future installment", () => {
    const s = emptyForecastSources();
    s.items = [
      {
        id: "i",
        name: "Materiale",
        purchase_price: 10000,
        quantity: 1,
        payment_method: "50_50",
        deposit_amount: 5000,
        balance_amount: 5000,
        deposit_paid: false,
        balance_paid: false,
        deposit_expected_date: today,
        balance_expected_date: "2026-11-20",
        is_paid: false,
        order_id: "o",
        supplier: { name: "Fornitore", vat_rate: 0 },
      },
    ];
    s.deadlines = [
      {
        id: "d",
        description: "Acconto materiale",
        order_item_id: "i",
        amount: 5000,
        paid_amount: 2000,
        due_date: today,
        direction: "uscita",
        status: "parziale",
      },
    ];
    const rows = buildForecastLedger(s, today).movements;
    expect(rows.map((m) => m.cents)).toEqual([300000, 500000]);
  });
  it("a closed deadline does not mask an invoice with a remaining recorded balance", () => {
    const s = emptyForecastSources();
    s.invoices = [
      {
        id: "f",
        total: 1000,
        paid_amount: 400,
        due_date: today,
        status: "partial",
      },
    ];
    s.deadlines = [
      {
        id: "d",
        description: "Scadenza precedente",
        amount: 400,
        paid_amount: 400,
        due_date: today,
        direction: "entrata",
        status: "pagata",
        invoice_id: "f",
      },
    ];
    expect(buildForecastLedger(s, today).movements[0].cents).toBe(60000);
  });
  it("subtracts only registered payroll, retaining the other wages", () => {
    const s = emptyForecastSources();
    s.employees = [
      {
        id: "a",
        first_name: "A",
        last_name: "A",
        net_salary: 1500,
        gross_salary: 2000,
      },
      {
        id: "b",
        first_name: "B",
        last_name: "B",
        net_salary: 1500,
        gross_salary: 2000,
      },
    ];
    s.costs = [
      {
        id: "c",
        name: "Stipendi ottobre",
        category: "Personale",
        amount: 1000,
        vat_rate: 0,
        due_date: "2026-10-28",
        is_paid: false,
      },
    ];
    const month = buildForecastLedger(s, today).movements.filter(
      (m) => m.date?.slice(0, 7) === "2026-10",
    );
    expect(month.reduce((sum, m) => sum + m.cents, 0)).toBe(300000);
  });
  it("does not reduce an outgoing credit note by income withholding", () => {
    const s = emptyForecastSources();
    s.orders = [{ id: "o", has_building_bonus: true }];
    s.invoices = [
      {
        id: "f",
        document_type: "credit_note",
        total: 1000,
        paid_amount: 200,
        due_date: today,
        status: "partial",
        order_id: "o",
      },
    ];
    expect(buildForecastLedger(s, today, 0.91).movements[0]).toMatchObject({
      direction: "out",
      cents: 80000,
    });
  });
  it("does not add a purchase order to its split item payments", () => {
    const s = emptyForecastSources();
    s.items = [
      {
        id: "i",
        name: "Materiale",
        purchase_price: 10000,
        quantity: 1,
        payment_method: "50_50",
        deposit_amount: 5000,
        balance_amount: 5000,
        deposit_paid: false,
        balance_paid: false,
        deposit_expected_date: today,
        balance_expected_date: "2026-11-20",
        is_paid: false,
        order_id: "o",
        supplier: { name: "Fornitore", vat_rate: 22 },
      },
    ];
    s.purchases = [
      {
        id: "p",
        total: 12200,
        status: "confermato",
        issue_date: today,
        expected_delivery_date: today,
      },
    ];
    s.purchaseItems = [{ purchase_order_id: "p", order_item_id: "i" }];
    expect(
      buildForecastLedger(s, today).movements.reduce(
        (sum, m) => sum + m.cents,
        0,
      ),
    ).toBe(1220000);
  });
  it("compares a registered receipt date with its linked scheduled installment", () => {
    const s = emptyForecastSources();
    s.notes = [
      {
        id: "n",
        direction: "entrata",
        amount: 500,
        entry_date: "2026-10-14",
        installment_id: "r",
      },
    ];
    s.installments = [
      {
        id: "r",
        order_id: "o",
        amount: 500,
        expected_date: "2026-10-10",
        is_paid: true,
        paid_date: today,
      },
    ];
    expect(buildForecastLedger(s, today).collected[0]).toMatchObject({
      cents: 50000,
      date: "2026-10-14",
      expectedDate: "2026-10-10",
    });
  });
  it("includes both unpaid supplier installments with VAT", () => {
    const s = emptyForecastSources();
    s.items = [
      {
        id: "i",
        name: "Materiale",
        purchase_price: 10000,
        quantity: 1,
        payment_method: "50_50",
        deposit_amount: 5000,
        balance_amount: 5000,
        deposit_paid: false,
        balance_paid: false,
        deposit_expected_date: "2026-10-20",
        balance_expected_date: "2026-11-20",
        is_paid: false,
        order_id: "o",
        supplier: { name: "Fornitore", vat_rate: 22 },
      },
    ];
    const ledger = buildForecastLedger(s, today);
    expect(ledger.movements).toHaveLength(2);
    expect(ledger.movements.reduce((sum, m) => sum + m.cents, 0)).toBe(1220000);
    s.items[0].deposit_paid = true;
    expect(buildForecastLedger(s, today).movements[0].cents).toBe(610000);
    s.items[0].is_paid = true;
    expect(buildForecastLedger(s, today).movements).toHaveLength(0);
  });
  it("honors explicit zero installment amounts", () => {
    const s = emptyForecastSources();
    s.items = [
      {
        id: "i",
        name: "Materiale",
        purchase_price: 10000,
        quantity: 1,
        payment_method: "50_50",
        deposit_amount: 0,
        balance_amount: 10000,
        deposit_paid: false,
        balance_paid: false,
        deposit_expected_date: today,
        balance_expected_date: today,
        is_paid: false,
        order_id: "o",
      },
    ];
    expect(buildForecastLedger(s, today).movements.map((m) => m.cents)).toEqual(
      [1000000],
    );
  });
  it("uses gross company costs and keeps old and undated unpaid expenses", () => {
    const s = emptyForecastSources();
    s.costs = [
      {
        id: "c",
        name: "Spesa",
        amount: 10000,
        vat_rate: 22,
        due_date: "2024-01-01",
        is_paid: false,
      },
      {
        id: "u",
        name: "Senza data",
        amount: 100,
        vat_rate: 0,
        due_date: null,
        is_paid: false,
      },
    ];
    const ledger = buildForecastLedger(s, today);
    expect(ledger.movements[0].cents).toBe(1220000);
    expect(ledger.movements[1].date).toBeNull();
  });
  it("uses partial deadline residual once, without dropping another rate on that job", () => {
    const s = emptyForecastSources();
    s.deadlines = [
      {
        id: "d",
        description: "Fattura",
        amount: 1000,
        paid_amount: 400,
        due_date: today,
        direction: "entrata",
        status: "parziale",
        invoice_id: "f",
        order_id: "o",
      },
    ];
    s.invoices = [
      {
        id: "f",
        total: 1000,
        paid_amount: 400,
        due_date: today,
        status: "partial",
        order_id: "o",
      },
    ];
    s.installments = [
      {
        id: "r1",
        order_id: "o",
        amount: 1000,
        expected_date: today,
        is_paid: false,
        invoice_id: "f",
      },
      {
        id: "r2",
        order_id: "o",
        amount: 250,
        expected_date: today,
        is_paid: false,
      },
    ];
    s.rateDaIncassare = [
      { id: "r1", order_id: "o", amount: 1000, expected_date: today },
      { id: "r2", order_id: "o", amount: 250, expected_date: today },
    ];
    const ledger = buildForecastLedger(s, today);
    expect(ledger.movements.map((m) => m.cents).sort()).toEqual([25000, 60000]);
  });
  it("recognizes the native fiscal document link in a deadline", () => {
    const s = emptyForecastSources();
    const id = "12345678-1234-1234-1234-123456789abc";
    s.deadlines = [
      {
        id: "d",
        description: "Fattura nativa",
        amount: 1000,
        paid_amount: 200,
        due_date: today,
        direction: "entrata",
        status: "parziale",
        notes: `[DOC:${id}]`,
      },
    ];
    s.installments = [
      {
        id: "r",
        order_id: "o",
        amount: 1000,
        expected_date: today,
        is_paid: false,
        documento_fiscale_id: id,
      },
    ];
    s.rateDaIncassare = [{ id: "r", order_id: "o", amount: 1000, expected_date: today }];
    expect(buildForecastLedger(s, today).movements.map((m) => m.cents)).toEqual(
      [80000],
    );
  });
  it("ignores a stale open deadline on a paid invoice", () => {
    const s = emptyForecastSources();
    s.deadlines = [
      {
        id: "d",
        description: "Fattura",
        amount: 1000,
        paid_amount: 0,
        due_date: today,
        direction: "entrata",
        status: "da_pagare",
        invoice_id: "f",
      },
    ];
    s.invoices = [
      {
        id: "f",
        total: 1000,
        paid_amount: 1000,
        due_date: today,
        status: "paid",
      },
    ];
    expect(buildForecastLedger(s, today).movements).toHaveLength(0);
  });
  it("replaces a cost by its partial linked deadline", () => {
    const s = emptyForecastSources();
    s.costs = [
      {
        id: "c",
        name: "Costo",
        amount: 1000,
        vat_rate: 22,
        due_date: today,
        is_paid: false,
      },
    ];
    s.deadlines = [
      {
        id: "d",
        description: "Residuo",
        amount: 1220,
        paid_amount: 220,
        due_date: today,
        direction: "uscita",
        status: "parziale",
        cost_id: "c",
      },
    ];
    expect(buildForecastLedger(s, today).movements.map((m) => m.cents)).toEqual(
      [100000],
    );
  });
  it("keeps an unbilled purchase undated unless payment terms are explicit", () => {
    const s = emptyForecastSources();
    s.purchases = [
      {
        id: "p",
        total: 1220,
        status: "confermato",
        issue_date: "2026-10-01",
        expected_delivery_date: "2026-10-20",
      },
    ];
    expect(buildForecastLedger(s, today).movements[0].date).toBeNull();
    s.purchases[0].payment_terms_base = "consegna";
    s.purchases[0].payment_terms_giorni = 30;
    expect(buildForecastLedger(s, today).movements[0].date).toBe("2026-11-19");
  });
  it("projects a recurring expense only where a future occurrence is missing", () => {
    const s = emptyForecastSources();
    s.costs = [
      {
        id: "mother",
        name: "Affitto",
        amount: 1000,
        vat_rate: 0,
        due_date: "2026-01-31",
        is_paid: true,
        recurrence: "monthly",
        recurrence_auto: true,
        recurrence_end_date: "2026-12-31",
      },
      {
        id: "oct",
        name: "Affitto",
        amount: 1000,
        vat_rate: 0,
        due_date: "2026-10-31",
        is_paid: false,
      },
    ];
    const rows = buildForecastLedger(s, today).movements;
    expect(rows.map((m) => m.date)).toEqual([
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
    ]);
    expect(rows.filter((m) => m.estimated)).toHaveLength(2);
  });
  it("does not estimate salaries already paid or issued as payroll", () => {
    const s = emptyForecastSources();
    s.employees = [
      {
        id: "e",
        first_name: "A",
        last_name: "B",
        net_salary: 1500,
        gross_salary: 2000,
      },
    ];
    s.payroll = [
      {
        id: "p",
        employee_id: "e",
        anno: 2026,
        mese: 10,
        netto: 1500,
        stato: "pagato",
        data_pagamento: today,
      },
    ];
    const rows = buildForecastLedger(s, today).movements;
    expect(rows.every((m) => m.date?.slice(0, 7) !== "2026-10")).toBe(true);
    expect(rows[0].cents).toBe(150000);
  });
  it("does not count a manual salary again as an employee estimate", () => {
    const s = emptyForecastSources();
    s.employees = [
      {
        id: "e",
        first_name: "A",
        last_name: "B",
        net_salary: 1500,
        gross_salary: 2000,
      },
    ];
    s.costs = [
      {
        id: "c",
        name: "Stipendi ottobre",
        amount: 1500,
        vat_rate: 0,
        due_date: "2026-10-28",
        is_paid: false,
        category: "Personale",
      },
    ];
    expect(
      buildForecastLedger(s, today).movements.filter(
        (m) => m.date?.slice(0, 7) === "2026-10",
      ),
    ).toHaveLength(1);
  });
  it("does not invent taxes or their dates", () => {
    const s = emptyForecastSources();
    s.taxes = [
      {
        id: "t",
        importo: 900,
        data_scadenza: null,
        tributo_descrizione: "F24",
      },
    ];
    expect(buildForecastLedger(s, today).movements[0]).toMatchObject({
      cents: 90000,
      date: null,
      estimated: false,
    });
  });
  it("applies configured withholding once to a bonus receipt", () => {
    const s = emptyForecastSources();
    s.orders = [{ id: "o", has_building_bonus: true }];
    s.installments = [
      {
        id: "r",
        order_id: "o",
        amount: 1000,
        expected_date: today,
        is_paid: false,
      },
    ];
    s.rateDaIncassare = [{ id: "r", order_id: "o", amount: 1000, expected_date: today }];
    expect(buildForecastLedger(s, today, 0.91).movements[0].cents).toBe(91000);
  });
  it("uses the registered receipt once instead of the paid invoice or installment", () => {
    const s = emptyForecastSources();
    s.notes = [
      {
        id: "n",
        direction: "entrata",
        amount: 500,
        entry_date: today,
        invoice_id: "f",
        installment_id: "r",
      },
    ];
    s.invoices = [
      {
        id: "f",
        total: 1000,
        paid_amount: 500,
        due_date: today,
        status: "partial",
        payment_date: today,
      },
    ];
    s.installments = [
      {
        id: "r",
        order_id: "o",
        amount: 1000,
        expected_date: today,
        is_paid: true,
        paid_date: today,
        invoice_id: "f",
      },
    ];
    expect(buildForecastLedger(s, today).collected.map((m) => m.cents)).toEqual(
      [50000],
    );
  });
  it("takes the shared rule residual for open installments, legacy plans and the unplanned part", () => {
    const s = emptyForecastSources();
    s.orders = [{ id: "o", client_name: "Cliente" }];
    s.installments = [
      { id: "saldo", order_id: "o", amount: 8540, label: "Saldo", type: "balance", expected_date: "2026-12-01", is_paid: false },
    ];
    s.rateDaIncassare = [
      { id: "saldo", order_id: "o", amount: 9760, expected_date: "2026-12-01" },
      { id: "11111111-2222-3333-4444-555555555555", order_id: "o", amount: 300, expected_date: "2026-11-01" },
      { id: "non-pianificato-o", order_id: "o", amount: 120, expected_date: null },
    ];
    const { movements } = buildForecastLedger(s, today);
    expect(movements.map((m) => [m.description, m.cents, m.date])).toEqual([
      ["Rata commessa", 30000, "2026-11-01"],
      ["Saldo", 976000, "2026-12-01"],
      ["Parte non pianificata della commessa", 12000, null],
    ]);
  });
  it("lists rule receipts by date, once, leaving the ones already in Prima Nota", () => {
    const s = emptyForecastSources();
    s.notes = [{ id: "n", direction: "entrata", amount: 100, entry_date: today, installment_id: "b" }];
    s.incassiRate = [
      { order_id: "o", installment_id: "a", data: "2026-09-01", importo: 3660 },
      { order_id: "o", installment_id: "b", data: today, importo: 100 },
    ];
    expect(buildForecastLedger(s, today).collected.map((m) => [m.cents, m.date, m.source])).toEqual([
      [10000, today, "Prima Nota"],
      [366000, "2026-09-01", "Rata commessa"],
    ]);
  });
});

describe("giro 1: numeri giusti", () => {
  it("dates the bank from the accounts that have a refresh, counting the undated ones apart", () => {
    const opening = resolveOpeningBalance(
      [
        { id: "a", current_balance: 100, available_balance: null, balance_updated_at: "2026-10-01T08:00:00Z" },
        { id: "b", current_balance: 50, available_balance: null, balance_updated_at: null },
      ],
      [],
    );
    expect(opening.updatedAt).toBe("2026-10-01T08:00:00Z");
    expect(opening.undatedAccounts).toBe(1);
  });
  it("flags an invoice not linked to an open job installment as a possible duplicate, out of the plan", () => {
    const s = emptyForecastSources();
    s.orders = [{ id: "o", client_name: "Rossi" }];
    s.installments = [
      { id: "r1", order_id: "o", amount: 1000, expected_date: "2026-11-01", is_paid: false },
      { id: "r2", order_id: "o", amount: 500, expected_date: "2026-10-20", is_paid: false, invoice_id: "linked" },
    ];
    s.rateDaIncassare = [
      { id: "r1", order_id: "o", amount: 1000, expected_date: "2026-11-01" },
      { id: "r2", order_id: "o", amount: 500, expected_date: "2026-10-20" },
    ];
    s.invoices = [
      { id: "linked", total: 500, paid_amount: 0, due_date: "2026-10-20", status: "issued", order_id: "o" },
      { id: "loose", total: 1000, paid_amount: 0, due_date: "2026-10-25", status: "issued", order_id: "o" },
      { id: "other-job", total: 300, paid_amount: 0, due_date: "2026-10-25", status: "issued", order_id: "x" },
    ];
    const { movements } = buildForecastLedger(s, today);
    const byId = new Map(movements.map((m) => [m.id, m]));
    // Collegamento certo: conta la fattura, non la rata r2.
    expect(byId.get("fattura:linked")?.possibleDuplicate).toBeUndefined();
    expect(byId.has("rata:r2")).toBe(false);
    // Senza collegamento sulla stessa commessa: possibile doppione, fuori dal saldo.
    expect(byId.get("fattura:loose")?.possibleDuplicate).toBe(true);
    expect(byId.get("fattura:other-job")?.possibleDuplicate).toBeUndefined();
    const p = projectForecast(movements, 0, today, 90, 0, scenario);
    expect(p.possibleDuplicates.map((m) => m.id)).toEqual(["fattura:loose"]);
    expect(p.income).toBe(50000 + 100000 + 30000);
  });
  it("brings a received but unbilled purchase order into the expenses", () => {
    const s = emptyForecastSources();
    s.purchases = [
      { id: "ric", total: 1220, status: "ricevuto", oda_number: "ODA-1", issue_date: today, expected_delivery_date: null, payment_terms_base: "data_ordine", payment_terms_giorni: 30 },
      { id: "fatto", total: 500, status: "ricevuto", issue_date: today, expected_delivery_date: null },
    ];
    s.costs = [{ id: "c", name: "ODA fatto", amount: 410, vat_rate: 22, due_date: "2026-11-01", is_paid: true, purchase_order_id: "fatto" }];
    const rows = buildForecastLedger(s, today).movements.filter((m) => m.id.startsWith("oda:"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "oda:ric", cents: 122000, date: "2026-11-13", source: "ODA ricevuto" });
  });
  it("takes the payday from paid salaries, otherwise the end of the month, and says which", () => {
    const employee = { id: "e", first_name: "A", last_name: "B", net_salary: 1500, gross_salary: 2000 };
    const s = emptyForecastSources();
    s.employees = [employee];
    s.notes = [
      { id: "n1", direction: "uscita", amount: 1500, entry_date: "2026-08-10", category: "Stipendi" },
      { id: "n2", direction: "uscita", amount: 1500, entry_date: "2026-09-12", category: "stipendi" },
    ];
    s.payroll = [{ id: "p", employee_id: "e", anno: 2026, mese: 7, netto: 1500, stato: "pagato", data_pagamento: "2026-07-12" }];
    const learned = buildForecastLedger(s, today);
    expect(learned.movements.find((m) => m.id.startsWith("stipendio:"))?.date).toBe("2026-11-12");
    expect(learned.warnings.join(" ")).toMatch(/giorno 12 del mese, mediana di 3 pagamenti/);
    const fallback = emptyForecastSources();
    fallback.employees = [employee];
    const rows = buildForecastLedger(fallback, today);
    expect(rows.movements.map((m) => m.date)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31"]);
    expect(rows.warnings.join(" ")).toMatch(/l’ultimo giorno del mese/);
  });
  it("estimates VAT to pay on the 16th of next month, only when positive and not already in F24", () => {
    const s = emptyForecastSources();
    s.vatDocuments = [
      { date: "2026-09-05", vat: 2200, kind: "vendita", credit: false, origin: "esterna" },
      { date: "2026-09-08", vat: 2000, kind: "vendita", credit: false, origin: "nativa" },
      { date: "2026-09-20", vat: 700, kind: "acquisto", credit: false, origin: "ricevuta" },
      { date: "2026-09-21", vat: 100, kind: "acquisto", credit: true, origin: "ricevuta" },
      { date: "2026-10-02", vat: 500, kind: "vendita", credit: false, origin: "esterna" },
      { date: "2026-10-03", vat: 900, kind: "acquisto", credit: false, origin: "ricevuta" },
    ];
    const rows = buildForecastLedger(s, "2026-10-14").movements;
    // Settembre: 2200 (l'archivio esterno vale da solo) − 700 + 100 = 1600, al 16/10.
    expect(rows).toEqual([
      expect.objectContaining({ id: "iva:2026-09", cents: 160000, date: "2026-10-16", estimated: true, category: "fisco" }),
    ]);
    s.vatF24 = [{ anno: 2026, mese: 9, tributo_code: "6009" }];
    expect(buildForecastLedger(s, "2026-10-14").movements).toHaveLength(0);
    // Il 16 che cade di domenica slitta al lunedì.
    s.vatF24 = [];
    s.vatDocuments = [{ date: "2026-07-10", vat: 100, kind: "vendita", credit: false, origin: "esterna" }];
    expect(buildForecastLedger(s, "2026-08-01").movements[0].date).toBe("2026-08-17");
    // Stime spente: la stima IVA esce dal piano.
    const p = projectForecast(buildForecastLedger(s, "2026-08-01").movements, 0, "2026-08-01", 30, 0, { ...scenario, includeEstimates: false });
    expect(p.excludedEstimates).toHaveLength(1);
  });
  it("recognizes a recurring occurrence registered a few days off, and repeats weekly costs", () => {
    const s = emptyForecastSources();
    s.costs = [
      { id: "mother", name: "Affitto", amount: 1000, vat_rate: 0, due_date: "2026-01-31", is_paid: true, recurrence: "monthly", recurrence_auto: true, recurrence_end_date: "2026-12-31" },
      { id: "nov", name: "affitto ", amount: 1000, vat_rate: 0, due_date: "2026-11-28", is_paid: false },
      { id: "w", name: "Pulizie", amount: 100, vat_rate: 0, due_date: "2026-10-01", is_paid: true, recurrence: "weekly", recurrence_auto: true, recurrence_end_date: "2026-11-05", supplier_id: "s" },
      { id: "w-reg", name: "Fattura pulizie", amount: 100, vat_rate: 0, due_date: "2026-10-23", is_paid: false, supplier_id: "s" },
    ];
    const rows = buildForecastLedger(s, today).movements.filter((m) => m.estimated);
    expect(rows.map((m) => m.id)).toEqual([
      "ricorrente:w:2026-10-15",
      "ricorrente:w:2026-10-29",
      "ricorrente:mother:2026-10-31",
      "ricorrente:w:2026-11-05",
      "ricorrente:mother:2026-12-31",
    ]);
  });
  it("matches a supplier payment to its deadline within one euro of rounding", () => {
    const s = emptyForecastSources();
    s.items = [
      { id: "i", name: "Piastrelle", purchase_price: 999.99, quantity: 1, payment_method: "unico", deposit_amount: null, balance_amount: null, deposit_paid: false, balance_paid: false, deposit_expected_date: null, balance_expected_date: today, is_paid: false, order_id: "o", supplier: { name: "F", vat_rate: 22 } },
    ];
    s.deadlines = [
      { id: "d", description: "Fornitore F", amount: 1220.5, paid_amount: 0, due_date: today, direction: "uscita", status: "da_pagare", order_item_id: "i" },
    ];
    expect(buildForecastLedger(s, today).movements.map((m) => m.id)).toEqual(["scadenza:d"]);
  });
});
