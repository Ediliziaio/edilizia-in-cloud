// src/test/ui/financialSummaryEventi.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Installment } from "@/lib/orderUtils";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/components/orders/RegistraIncassoPrimaNota", () => ({
  RegistraIncassoPrimaNota: (): null => null,
  useIncassiRegistrati: () => ({ data: {} }),
}));
vi.mock("@/components/orders/RiconciliaRateBancaDialog", () => ({ RiconciliaRateBancaDialog: (): null => null }));

import { FinancialSummaryReadOnly } from "@/components/orders/FinancialSummary";

const rata = (patch: Partial<Installment>): Installment => ({
  id: "r", position: 0, label: "Rata", type: "deposit", amount: 1000, is_paid: false, ...patch,
});

function mostra(installments: Installment[]) {
  return render(
    <MemoryRouter>
      <FinancialSummaryReadOnly
        totalAmount={4000} vatRate={22} paymentType="standard" installments={installments}
        onInstallmentPaidToggle={vi.fn()} onInstallmentDateChange={vi.fn()} orderId="o1"
      />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("le rate a evento nel riepilogo della commessa", () => {
  it("una rata a data fissa ha il suo selettore della data prevista, come prima", () => {
    mostra([rata({ id: "a", position: 0, label: "Acconto", expected_date: "2030-03-01" }), rata({ id: "s", position: 1, label: "Saldo", type: "balance" })]);
    expect(screen.getAllByText("Data prevista").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Si incassa/)).not.toBeInTheDocument();
  });

  it("una rata a evento dice quando si incassa e la data dell'evento, e la data non si scrive a mano", () => {
    mostra([
      rata({ id: "a", position: 0, label: "Acconto", trigger_evento: "firma_contratto", expected_date: "2030-03-01" }),
      rata({ id: "s", position: 1, label: "Saldo", type: "balance", trigger_evento: "fine_lavori", expected_date: "2030-07-15" }),
    ]);
    expect(screen.getByText("Si incassa alla firma del contratto · il 01/03/2030")).toBeInTheDocument();
    expect(screen.getByText("Si incassa a fine lavori · il 15/07/2030")).toBeInTheDocument();
    expect(screen.queryByText("Data prevista")).not.toBeInTheDocument();
  });

  it("una rata «al SAL» ancora senza verbale dice che la data non c'è ancora", () => {
    mostra([
      rata({ id: "a", position: 0, label: "SAL 1", trigger_evento: "sal_numero", trigger_numero: 1, expected_date: null }),
      rata({ id: "s", position: 1, label: "Saldo", type: "balance" }),
    ]);
    expect(screen.getByText("Si incassa al SAL n. 1 · data ancora da conoscere")).toBeInTheDocument();
  });

  it("una rata a evento già incassata mostra la data dell'incasso, come le altre", () => {
    mostra([
      rata({ id: "a", position: 0, label: "Acconto", trigger_evento: "firma_contratto", is_paid: true, paid_date: "2030-03-02", expected_date: null }),
      rata({ id: "s", position: 1, label: "Saldo", type: "balance" }),
    ]);
    expect(screen.queryByText(/Si incassa/)).not.toBeInTheDocument();
    // La data dell'incasso resta un selettore (il fuso del computer può spostarla di un giorno).
    expect(screen.getByRole("button", { name: /0[12]\/03\/2030/ })).toBeInTheDocument();
  });
});
