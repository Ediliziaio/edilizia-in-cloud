import { expect, it } from "vitest";
import {
  buildForecastLedger,
  emptyForecastSources,
  type CostPaymentRow,
} from "@/lib/finance/forecastLedger";

const oggi = "2026-11-11";
const pagamento = (p: Partial<CostPaymentRow> = {}): CostPaymentRow => ({
  id: "p1",
  cost_id: "c1",
  amount: 55000,
  direction: "uscita",
  entry_date: "2026-11-10",
  ...p,
});
const dati = () => ({
  ...emptyForecastSources(),
  costs: [
    {
      id: "c1",
      name: "Fornitura Aurora",
      amount: 100000,
      vat_rate: 10,
      due_date: "2026-11-30",
      is_paid: false,
    },
  ],
});
const uscite = (s: ReturnType<typeof dati>) =>
  buildForecastLedger(s, oggi).movements.filter((m) => m.costId === "c1");

const salConGaranzia = () => ({
  ...dati(),
  costs: [
    {
      id: "c1",
      name: "SAL Aurora",
      amount: 40000,
      vat_rate: 0,
      due_date: "2026-12-10",
      is_paid: false,
    },
  ],
  costPayments: [pagamento({ amount: 20000 })],
  costWithholdings: [
    {
      id: "f1",
      company_cost_id: "c1",
      trattenuta_garanzia: 2000,
      tipo_documento: "TD01",
      stato: "contabilizzata",
    },
  ],
  garanzie: [
    {
      id: "g1",
      direzione: "passiva",
      importo: 2000,
      stato: "trattenuta",
      data_svincolo_prevista: "2028-06-30",
      controparte: "Aurora Strutture",
      order_id: "aurora",
    },
  ],
});
it("SAL 40.000, acconto 20.000 e garanzia 2.000: prevede 18.000 ora e 2.000 allo svincolo", () => {
  const s = salConGaranzia(),
    prima = JSON.stringify(s);
  const out = buildForecastLedger(s, oggi).movements;
  expect(
    out.filter((m) => m.costId === "c1").map((m) => [m.date, m.cents]),
  ).toEqual([["2026-12-10", 1800000]]);
  expect(out.find((m) => m.id === "garanzia:g1")).toMatchObject({
    date: "2028-06-30",
    cents: 200000,
  });
  expect(out.reduce((n, m) => n + m.cents, 0)).toBe(2000000);
  expect(JSON.stringify(s)).toBe(prima);
});
it.each([38000, 40000])(
  "non sottrae due volte la garanzia da una rata già netta (%s)",
  (importo) => {
    const s = salConGaranzia();
    s.supplierInstallments = [
      {
        id: "r1",
        company_cost_id: "c1",
        numero: 1,
        importo,
        stato: "da_pagare",
        scadenza: "2026-12-10",
        metodo: "bonifico",
      },
    ];
    expect(uscite(s).map((m) => m.cents)).toEqual([1800000]);
  },
);
it("limita anche una scadenza del costo, senza riaddebitare il pagamento già registrato", () => {
  const s = salConGaranzia();
  s.deadlines = [
    {
      id: "d1",
      cost_id: "c1",
      description: "SAL",
      amount: 40000,
      paid_amount: 20000,
      due_date: "2026-12-10",
      status: "parziale",
      direction: "uscita",
    },
  ];
  expect(uscite(s).map((m) => m.cents)).toEqual([1800000]);
});
it("garanzia su più rate: la rata chiusa e il pagamento rappresentano la stessa uscita", () => {
  const s = salConGaranzia();
  s.supplierInstallments = [
    {
      id: "r1",
      company_cost_id: "c1",
      numero: 1,
      importo: 20000,
      stato: "pagata",
      scadenza: "2026-11-10",
      metodo: "bonifico",
    },
    {
      id: "r2",
      company_cost_id: "c1",
      numero: 2,
      importo: 20000,
      stato: "da_pagare",
      scadenza: "2026-12-10",
      metodo: "bonifico",
    },
  ];
  expect(uscite(s).map((m) => m.cents)).toEqual([1800000]);
});
it("deduplica le fatture lette e ignora le ritenute delle fatture rifiutate", () => {
  const s = salConGaranzia();
  s.costWithholdings.push(s.costWithholdings[0], {
    ...s.costWithholdings[0],
    id: "rifiutata",
    stato: "rifiutata",
  });
  expect(uscite(s).map((m) => m.cents)).toEqual([1800000]);
});

it("prevede solo 55.000 euro dopo un pagamento di 55.000 su 110.000 IVA compresa", () => {
  const s = dati();
  s.costPayments = [pagamento()];
  expect(uscite(s).map((m) => m.cents)).toEqual([5500000]);
});
it("non sottrae due volte un pagamento duplicato nella lettura", () => {
  const s = dati();
  s.costPayments = [pagamento(), pagamento()];
  expect(uscite(s).map((m) => m.cents)).toEqual([5500000]);
});
it("un saldo già registrato non ritorna fra le uscite, anche con un flag storico ancora aperto", () => {
  const s = dati();
  s.costPayments = [pagamento({ amount: 110000 })];
  expect(uscite(s)).toEqual([]);
});
it("lo storno ripristina il debito senza contare originale e annullamento come due pagamenti", () => {
  const s = dati();
  s.costPayments = [
    pagamento(),
    pagamento({ id: "storno", direction: "entrata", reversal_of: "p1" }),
  ];
  expect(uscite(s).map((m) => m.cents)).toEqual([11000000]);
});
it("non anticipa un pagamento futuro e conserva gli acconti di oltre un anno fa", () => {
  const s = dati();
  s.costPayments = [pagamento({ entry_date: "2027-01-01" })];
  expect(uscite(s).map((m) => m.cents)).toEqual([11000000]);
  s.costPayments = [pagamento({ entry_date: "2025-01-01" })];
  expect(uscite(s).map((m) => m.cents)).toEqual([5500000]);
});
it("compensa la rata già chiusa e soltanto il residuo dell'acconto sulla prima rata aperta", () => {
  const s = dati();
  s.costPayments = [pagamento({ amount: 60000 })];
  s.supplierInstallments = [
    {
      id: "r1",
      company_cost_id: "c1",
      numero: 1,
      importo: 40000,
      stato: "pagata",
      scadenza: "2026-10-01",
      metodo: "bonifico",
    },
    {
      id: "r2",
      company_cost_id: "c1",
      numero: 2,
      importo: 40000,
      stato: "da_pagare",
      scadenza: "2026-11-30",
      metodo: "bonifico",
    },
    {
      id: "r3",
      company_cost_id: "c1",
      numero: 3,
      importo: 30000,
      stato: "da_pagare",
      scadenza: "2026-12-30",
      metodo: "bonifico",
    },
  ];
  expect(uscite(s).map((m) => m.cents)).toEqual([2000000, 3000000]);
});
