/**
 * Test — eco del valore interpretato sui campi importo (2026-07-25).
 *
 * Il bug non era solo nel parser: era che l'utente non poteva accorgersene.
 * Digitando "1.500" il campo continuava a mostrare "1.500" mentre lo stato
 * valeva 1.5 — nessun segnale prima del PDF, della fattura e dello SDI.
 *
 * Qui si verifica il contratto UI: appena si esce dal campo, DENTRO al campo
 * c'è il numero che il gestionale ha capito, scritto in italiano.
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { FinancialSummary } from "@/components/orders/FinancialSummary";
import type { Installment } from "@/lib/orderUtils";

function makeInstallment(over: Partial<Installment>): Installment {
  return {
    position: 1,
    label: "Acconto",
    amount: 0,
    type: "deposit",
    is_paid: false,
    paid_date: null,
    expected_date: null,
    ...over,
  } as Installment;
}

function Harness() {
  const [total, setTotal] = useState("");
  const [insts, setInsts] = useState<Installment[]>([
    makeInstallment({ position: 1, label: "Acconto", type: "deposit" }),
    makeInstallment({ position: 99, label: "Saldo", type: "balance" }),
  ]);
  return (
    <div>
      <div data-testid="state-total">{total}</div>
      <div data-testid="state-acconto">{String(insts[0].amount)}</div>
      <FinancialSummary
        totalAmount={total}
        vatRate="22"
        paymentType="standard"
        installments={insts}
        onInstallmentsChange={setInsts}
        numInstallments={2}
        onNumInstallmentsChange={() => {}}
        onTotalAmountChange={setTotal}
        onVatRateChange={() => {}}
        onPaymentTypeChange={() => {}}
        balance={0}
        hasBuildingBonus={false}
        onHasBuildingBonusChange={() => {}}
      />
    </div>
  );
}

/** I campi importo del componente, in ordine di comparsa. */
function campiImporto(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
}

function scriviEdEsci(input: HTMLInputElement, testo: string) {
  fireEvent.change(input, { target: { value: testo } });
  fireEvent.blur(input);
}

describe("campo importo — '1.500' vale millecinquecento", () => {
  it("il TOTALE interpreta 1.500 come 1500 e lo rimanda a video", () => {
    render(<Harness />);
    const totale = campiImporto()[0];

    scriviEdEsci(totale, "1.500");

    expect(screen.getByTestId("state-total").textContent).toBe("1.500,00");
    // L'eco è la difesa: nel campo c'è il valore capito, non il testo digitato.
    expect(totale.value).toBe("1.500,00");
  });

  it("la RATA interpreta 1.500 come 1500 e lo rimanda a video", () => {
    render(<Harness />);
    const rata = campiImporto()[1];

    scriviEdEsci(rata, "1.500");

    expect(screen.getByTestId("state-acconto").textContent).toBe("1500");
    expect(rata.value).toBe("1.500,00");
  });

  it("la virgola decimale continua a funzionare (regressione 2026-05-27)", () => {
    render(<Harness />);
    const rata = campiImporto()[1];

    scriviEdEsci(rata, "9,50");

    expect(screen.getByTestId("state-acconto").textContent).toBe("9.5");
    expect(rata.value).toBe("9,50");
  });

  it("l'eco è stabile: un secondo blur non cambia il valore", () => {
    render(<Harness />);
    const totale = campiImporto()[0];

    scriviEdEsci(totale, "85.000");
    const dopoPrimo = totale.value;
    fireEvent.blur(totale);

    expect(dopoPrimo).toBe("85.000,00");
    expect(totale.value).toBe("85.000,00");
    expect(screen.getByTestId("state-total").textContent).toBe("85.000,00");
  });

  it("campo svuotato → resta vuoto, non '0,00'", () => {
    render(<Harness />);
    const rata = campiImporto()[1];

    scriviEdEsci(rata, "1.500");
    scriviEdEsci(rata, "");

    expect(rata.value).toBe("");
    expect(screen.getByTestId("state-acconto").textContent).toBe("0");
  });
});
