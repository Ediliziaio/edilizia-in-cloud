import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuotePaymentTermsCard } from "@/components/marketing/preventivi/QuotePaymentTermsCard";
import { defaultQuotePaymentPhases } from "@/lib/preventivi/paymentTerms";

afterEach(cleanup);

function Harness() {
  const [phases, setPhases] = useState(defaultQuotePaymentPhases());
  return <QuotePaymentTermsCard total={1000} method="Bonifico" phases={phases} onMethodChange={() => {}} onPhasesChange={setPhases} />;
}

describe("pagamenti senza compensazioni nascoste", () => {
  it("mostra il piano incompleto e consente di aggiungere esplicitamente il saldo", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Percentuale fase 2" }), { target: { value: "30" } });
    expect(screen.getByRole("alert")).toHaveTextContent("100%");
    expect(screen.getAllByText(/300,00/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Completa con saldo 40%" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Percentuale fase 3" })).toHaveValue(40);
    expect(screen.getByText(/400,00/)).toBeInTheDocument();
  });

  it("limita l'inserimento a 100% e segnala la descrizione vuota", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Percentuale fase 1" }), { target: { value: "120" } });
    expect(screen.getByRole("spinbutton", { name: "Percentuale fase 1" })).toHaveValue(100);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Percentuale fase 1" }), { target: { value: "30" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Descrizione fase 1" }), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("descrizione");
  });
});
