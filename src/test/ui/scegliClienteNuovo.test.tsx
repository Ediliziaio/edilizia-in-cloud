import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactElement } from "react";

/** 15/11/2026: il committente di un appalto si crea anche dal popup della generale. */
const m = vi.hoisted(() => ({ clienti: [] as { id: string; first_name: string | null; last_name: string | null; email: string | null }[], aperto: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" } }) }));
vi.mock("@/hooks/useCompanyCustomers", () => ({ useCompanyCustomers: () => ({ data: m.clienti, isLoading: false }) }));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({
  CreateCustomerDialog: ({ initialValues, onCustomerCreated, defaultCreatePortalAccount }: { initialValues?: { fullName?: string; isBusiness?: boolean }; onCustomerCreated: (id: string, nome: string) => void; defaultCreatePortalAccount?: boolean }): ReactElement => {
    m.aperto({ initialValues, defaultCreatePortalAccount });
    return <button type="button" onClick={() => onCustomerCreated("nuovo-id", initialValues?.fullName ?? "Comune di Roma")}>Salva il cliente</button>;
  },
}));
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = () => {};

function Prova({ consentiNuovo }: { consentiNuovo?: boolean }) {
  const [valore, setValore] = useState<string | null>(null);
  return <><ScegliCliente id="c" valore={valore} onCambia={setValore} consentiNuovo={consentiNuovo} /><output>{valore ?? "nessuno"}</output></>;
}

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); m.clienti = [{ id: "c1", first_name: "Edil Rossi", last_name: null, email: null }]; });

describe("scegliere il cliente, o crearlo", () => {
  it("senza permesso di creare non c'è «Nuovo»", () => {
    render(<Prova />);
    expect(screen.queryByRole("button", { name: /Nuovo/ })).not.toBeInTheDocument();
  });

  it("«Nuovo» apre l'anagrafica come azienda, senza portale; il cliente creato è già scelto", () => {
    render(<Prova consentiNuovo />);
    fireEvent.click(screen.getByRole("button", { name: /Nuovo/ }));
    expect(m.aperto).toHaveBeenCalledWith({ initialValues: { fullName: undefined, isBusiness: true, firstName: "", lastName: "" }, defaultCreatePortalAccount: false });
    fireEvent.click(screen.getByRole("button", { name: "Salva il cliente" }));
    expect(screen.getByRole("status")).toHaveTextContent("nuovo-id");
    // Il nome si vede subito, anche se l'elenco dei clienti non l'ha ancora.
    expect(screen.getByRole("combobox")).toHaveTextContent("Comune di Roma");
    expect(screen.queryByRole("button", { name: /Nuovo/ })).not.toBeInTheDocument();
  });

  it("cercando un nome che non c'è, si crea con quel nome", () => {
    render(<Prova consentiNuovo />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText("Cerca per nome, telefono, indirizzo, email o P.IVA…"), { target: { value: "Comune di Torino" } });
    fireEvent.click(screen.getByRole("button", { name: "Nuovo cliente «Comune di Torino»" }));
    expect(m.aperto).toHaveBeenCalledWith(expect.objectContaining({ initialValues: { fullName: "Comune di Torino", isBusiness: true, firstName: "", lastName: "" } }));
  });
});
