import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";

vi.mock("@/hooks/useCompanyCustomers", () => ({
  useCompanyCustomers: () => ({ data: [
    ...Array.from({ length: 80 }, (_, i) => ({ id: `demo-${i}`, first_name: "Azienda Demo", last_name: String(i), email: null as string | null })),
    { id: "cliente-beta", first_name: "Collaudo", last_name: "Beta", email: "cliente-beta@no-email.ediliziaincloud.local" },
  ] }),
}));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));

import { SceltaCliente } from "@/components/silvio-commessa/ColonnaCommessa";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("La ricerca del cliente nel popup di Silvio", () => {
  it("trova un cliente oltre i primi 50 senza esporre l'email tecnica e passa i dati dell'anagrafica", () => {
    const onScegli = vi.fn();
    render(<SceltaCliente companyId="azienda-test" piano={pianoVuoto("azienda-test")} onScegli={onScegli} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Cliente" }));
    expect(screen.queryByRole("option", { name: "Collaudo Beta" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Cerca per nome o email…"), { target: { value: "Collaudo Beta" } });
    expect(screen.queryByText(/no-email\.ediliziaincloud\.local/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Collaudo Beta" }));
    expect(onScegli).toHaveBeenCalledWith("cliente-beta", "Collaudo Beta", {
      id: "cliente-beta", first_name: "Collaudo", last_name: "Beta", email: "cliente-beta@no-email.ediliziaincloud.local",
    });
    expect(screen.queryByPlaceholderText("Cerca per nome o email…")).not.toBeInTheDocument();
  });
});
