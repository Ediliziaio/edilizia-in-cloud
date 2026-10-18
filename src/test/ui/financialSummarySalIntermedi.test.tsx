// src/test/ui/financialSummarySalIntermedi.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

afterEach(cleanup);

describe("il modulo della commessa con un SAL intermedio", () => {
  it("mostra tutte le rate: l'acconto e il SAL hanno il loro campo, il saldo è il residuo", () => {
    mostra();
    expect(screen.getByText("Acconto 30%")).toBeInTheDocument();
    expect(screen.getByText("SAL 40%")).toBeInTheDocument();
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
