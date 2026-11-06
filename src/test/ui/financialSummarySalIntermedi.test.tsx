// src/test/ui/financialSummarySalIntermedi.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancialSummary } from "@/components/orders/FinancialSummary";
import type { Installment } from "@/lib/orderUtils";
import { importoSaldoFinale } from "@/lib/orders/saldoFinale";

const rate: Installment[] = [
  { position: 0, label: "Acconto 30%", type: "deposit", amount: 300, is_paid: false },
  { position: 1, label: "SAL 40%", type: "balance", amount: 400, is_paid: false },
  { position: 2, label: "Saldo 30%", type: "balance", amount: 300, is_paid: false },
];

function mostra(props: Partial<Parameters<typeof FinancialSummary>[0]> = {}) {
  const installments = props.installments ?? rate;
  return render(
    <FinancialSummary
      totalAmount="1.000,00" vatRate="0" paymentType="standard"
      installments={installments} onInstallmentsChange={() => {}}
      numInstallments={installments.length} onNumInstallmentsChange={() => {}}
      onTotalAmountChange={() => {}} onVatRateChange={() => {}} onPaymentTypeChange={() => {}}
      balance={importoSaldoFinale(installments, 1000)}
      {...props}
    />,
  );
}

const campiImporto = (): HTMLInputElement[] => Array.from(document.querySelectorAll('input[inputmode="decimal"]')) as HTMLInputElement[];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("il modulo della commessa con un SAL intermedio", () => {
  it("mostra tutte le rate: l'acconto e il SAL hanno il loro campo, il saldo è il residuo", () => {
    mostra();
    // Dal 04/11/2026 il nome della rata si scrive: non è più testo, è il valore di un campo.
    expect(screen.getByDisplayValue("Acconto 30%")).toBeInTheDocument();
    expect(screen.getByDisplayValue("SAL 40%")).toBeInTheDocument();
    // campi: totale, acconto, SAL
    expect(campiImporto().slice(1).map((c) => c.value)).toEqual(["300,00", "400,00"]);
    // Saldo da pagare = 1000 − 300 − 400
    const saldo = screen.getByText("Saldo da Pagare").parentElement!;
    expect(saldo.textContent).toMatch(/300,00/);
  });

  it("l'imponibile bancario della ritenuta dice il divisore usato davvero (1,22), anche con IVA al 10%", () => {
    mostra({ vatRate: "10", hasBuildingBonus: true });
    expect(screen.getByText(/Imponibile bancario \(÷ 1,22\)/)).toBeInTheDocument();
    expect(screen.queryByText(/÷ 1\.10|÷ 1,10/)).not.toBeInTheDocument();
  });
});

describe("Riepilogo della finanziaria", () => {
  it.each(["trattenuto", "separato"] as const)("distingue incasso e costo senza scontare il cliente: %s", financingCostMode => {
    const installments: Installment[] = [
      { position: 0, label: "Acconto", type: "deposit", amount: 2000, is_paid: false },
      { position: 1, label: "Finanziamento", type: "financing", amount: 6000, is_paid: false },
      { position: 2, label: "Saldo", type: "balance", amount: 0, is_paid: false },
    ];
    mostra({ totalAmount: "10.000,00", installments, paymentType: "financing", financingCost: "300", financingCostMode, onFinancingCostModeChange: () => {}, balance: importoSaldoFinale(installments, 10000, 300, financingCostMode) });
    expect(screen.getByLabelText("Come viene pagato il costo della finanziaria?")).toHaveValue(financingCostMode);
    expect(screen.getByText("Saldo Cliente").parentElement).toHaveTextContent("2.000,00");
    const preview = screen.getByText(/Incasso previsto dalla finanziaria:/);
    expect(preview).toHaveTextContent(financingCostMode === "trattenuto" ? "5.700,00" : "6.000,00");
    if (financingCostMode === "separato") expect(preview).toHaveTextContent("uscita separata: 300,00");
  });
});

it("ripristinare una bozza non emette cambi del tipo, dell'IVA o del numero rate", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const payment = vi.fn(), vat = vi.fn(), count = vi.fn();
  const common = { totalAmount: "10000", installments: rate, onInstallmentsChange: vi.fn(), onTotalAmountChange: vi.fn(), onNumInstallmentsChange: count, onVatRateChange: vat, onPaymentTypeChange: payment, balance: 2000 };
  const view = render(<form><FinancialSummary {...common} vatRate="22" paymentType="standard" numInstallments={2} /></form>);
  view.rerender(<form><FinancialSummary {...common} vatRate="0" paymentType="financing" numInstallments={3} financingCost="300" financingCostMode="trattenuto" /></form>);
  expect(payment).not.toHaveBeenCalled();
  expect(vat).not.toHaveBeenCalled();
  expect(count).not.toHaveBeenCalled();
});
