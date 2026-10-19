import { agreedContractValue, variantiApprovateDatate } from "@/lib/orders/contractValue";
import { salMaturato, type SalMatura } from "@/lib/orders/salMaturazione";
import { calculateInstallmentCollections } from "@/lib/commissions";

export interface CalendarInstallment {
  id: string;
  position: number;
  label: string;
  type: string;
  amount: number;
  is_paid: boolean;
  paid_date: string | null;
  data_attesa: string | null;
  stato_incasso: string | null;
  trigger_evento: string | null;
  trigger_numero: number | null;
  fattura?: { id: string; importo_pagato: number | null } | null;
}
export interface CalendarSal {
  id: string;
  numero_sal: number;
  stato: string;
  data_emissione: string;
  importo_totale: number;
  installment_id: string | null;
}
export function calendarFinanceModel(input: {
  order: {
    total_amount: number;
    vat_rate: number | null;
    financing_cost: number | null;
    payment_type: string | null;
  };
  variations: Parameters<typeof variantiApprovateDatate>[0];
  rates: CalendarInstallment[];
  sals: CalendarSal[];
  maturity: SalMatura;
}) {
  const cent = (n: number) => Math.round(n * 100) / 100;
  const agreed = agreedContractValue(
    input.order.total_amount,
    input.variations,
  );
  const gross = cent(agreed * (1 + (input.order.vat_rate ?? 22) / 100));
  const financingCost =
    input.order.payment_type === "financing"
      ? Number(input.order.financing_cost ?? 0)
      : 0;
  const target = Math.max(0, cent(gross - financingCost));
  const lastBalance = Math.max(
    -1,
    ...input.rates.filter((r) => r.type === "balance").map((r) => r.position),
  );
  const other = input.rates
    .filter((r) => r.type !== "balance" || r.position !== lastBalance)
    .reduce((n, r) => n + Number(r.amount), 0);
  const sorted = [...input.rates].sort((a, b) => a.position - b.position);
  const collections = calculateInstallmentCollections({
    installments: sorted,
    totalAmount: agreed,
    vatRate: input.order.vat_rate ?? 22,
    financingCost,
    includeFinancing: true,
    varianti: variantiApprovateDatate(input.variations),
  });
  const rates = sorted.map((rate, index) => {
    const saldoFinale = rate.type === "balance" && rate.position === lastBalance;
    // Il saldo già pagato vale quanto incassato quel giorno: una variante approvata dopo resta da incassare.
    const amount = cent(
      saldoFinale && rate.is_paid
        ? collections[index]
        : saldoFinale
          ? Math.max(0, target - other)
          : Number(rate.amount),
    );
    const collected = collections[index];
    const sal = input.sals.find((s) => s.installment_id === rate.id);
    const waitingSal =
      rate.trigger_evento === "sal_numero" &&
      (!sal || !salMaturato(input.maturity, sal.stato));
    const mismatch =
      collected > amount + 0.01 || (rate.is_paid && collected < amount - 0.01);
    const status = mismatch
      ? "Incasso da verificare"
      : collected >= amount && amount > 0
        ? "Incassato"
        : collected > 0
          ? "Incasso parziale"
          : waitingSal
            ? "In attesa del SAL"
            : (
                {
                  scaduta: "Scaduta",
                  preavviso: "In scadenza",
                  prevista: "Da incassare",
                  futura: "Prevista",
                  da_definire: "Data da definire",
                  da_incassare: "Da incassare",
                } as Record<string, string>
              )[rate.stato_incasso ?? ""] || "Da incassare";
    return {
      ...rate,
      amount,
      collected,
      remaining: cent(Math.max(0, amount - collected)),
      status,
      sal,
    };
  });
  const collected = cent(rates.reduce((n, r) => n + r.collected, 0));
  return {
    rates,
    sals: input.sals,
    target,
    collected,
    remaining: cent(Math.max(0, target - collected)),
  };
}
