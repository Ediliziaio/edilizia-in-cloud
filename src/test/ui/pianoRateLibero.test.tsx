// @vitest-environment jsdom
/**
 * Il piano di pagamento della commessa, libero (04/11/2026). Prima il nome delle rate lo
 * scriveva il programma («Acconto 1», «Rata 2», «Saldo») e per cambiarne il numero si
 * passava da un menu che rifaceva il piano da capo, buttando via nomi, importi ed eventi.
 * Chi incassa «a merce pronta», «al rogito» o «al SAL 2» non poteva scriverlo.
 */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FinancialSummary } from "@/components/orders/FinancialSummary";
import type { Installment } from "@/lib/orderUtils";

vi.mock("@/hooks/useBonusFiscaliFlags", () => ({ useBonusFiscaliFlags: () => ({ bonusMultipli: false }) }));

const rateIniziali: Installment[] = [
  { position: 0, label: "Acconto 1", type: "deposit", amount: 300, is_paid: false },
  { position: 1, label: "Saldo", type: "balance", amount: 700, is_paid: false },
];

function Prova({ onRate }: { onRate?: (r: Installment[]) => void }) {
  const [rate, setRate] = useState<Installment[]>(rateIniziali);
  const [quante, setQuante] = useState(rate.length);
  return (
    <>
      <div data-testid="nomi">{rate.map((r) => r.label).join("|")}</div>
      <div data-testid="quante">{quante}</div>
      <FinancialSummary
        nuova totalAmount="1000" vatRate="0" paymentType="standard"
        installments={rate}
        onInstallmentsChange={(r) => { setRate(r); onRate?.(r); }}
        numInstallments={quante} onNumInstallmentsChange={setQuante}
        onTotalAmountChange={() => {}} onVatRateChange={() => {}} onPaymentTypeChange={() => {}}
        balance={700}
      />
    </>
  );
}

afterEach(cleanup);

describe("il piano di pagamento si scrive come si incassa davvero", () => {
  it("il nome di una rata si cambia: «merce pronta», «al rogito», «SAL di marzo»", () => {
    render(<Prova />);
    const nome = screen.getByLabelText("Nome della rata 1") as HTMLInputElement;
    expect(nome.value).toBe("Acconto 1");
    fireEvent.change(nome, { target: { value: "Merce pronta" } });
    expect(screen.getByTestId("nomi").textContent).toBe("Merce pronta|Saldo");
  });

  it("una rata si aggiunge senza rifare il piano: i nomi di prima restano", () => {
    render(<Prova />);
    fireEvent.change(screen.getByLabelText("Nome della rata 1"), { target: { value: "Al rogito" } });
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi una rata/ }));
    // la nuova entra prima del saldo, e «Al rogito» non è stato riscritto
    expect(screen.getByTestId("nomi").textContent).toBe("Al rogito|Rata 2|Saldo");
    expect(screen.getByTestId("quante").textContent).toBe("3");
  });

  it("una rata si toglie, il saldo no: è il residuo e deve restare", () => {
    render(<Prova />);
    fireEvent.click(screen.getByRole("button", { name: "Togli la rata Acconto 1" }));
    expect(screen.getByTestId("nomi").textContent).toBe("Saldo");
    expect(screen.getByTestId("quante").textContent).toBe("1");
    expect(screen.queryByRole("button", { name: /^Togli la rata Saldo/ })).toBeNull();
  });

  it("le posizioni restano in fila dopo aver tolto una rata di mezzo", () => {
    const viste: Installment[][] = [];
    render(<Prova onRate={(r) => viste.push(r)} />);
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi una rata/ }));
    fireEvent.click(screen.getByRole("button", { name: "Togli la rata Acconto 1" }));
    expect(viste.at(-1)!.map((r) => r.position)).toEqual([0, 1]);
  });

  it("niente più menu col numero fisso di rate", () => {
    render(<Prova />);
    expect(screen.queryByRole("combobox", { name: /Numero Rate/i })).toBeNull();
  });
});
