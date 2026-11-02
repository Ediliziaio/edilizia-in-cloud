import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClienteCombobox } from "@/components/orders/ClienteCombobox";

// cmdk la usa per misurare l'elenco; jsdom non ce l'ha.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
afterEach(cleanup);
const clienti = [
  { id: "1", first_name: "Mario", last_name: "Rossi", email: "mario@esempio.it" },
  { id: "2", first_name: "Anna", last_name: "Bianchi", email: "cliente-x@no-email.ediliziaincloud.local" },
];

describe("Scelta del cliente", () => {
  it("si cerca scrivendo, si sceglie e l'email generata non si vede", async () => {
    const onChange = vi.fn();
    render(<ClienteCombobox clienti={clienti} value="" onChange={onChange} />);
    expect(screen.getByRole("combobox", { name: "Cliente" })).toHaveTextContent("Seleziona un cliente");
    fireEvent.click(screen.getByRole("combobox", { name: "Cliente" }));
    expect(await screen.findByText("Anna Bianchi")).toBeInTheDocument();
    expect(screen.queryByText(/no-email/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Cerca per nome o email…"), { target: { value: "rossi" } });
    expect(screen.queryByText("Anna Bianchi")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Mario Rossi"));
    expect(onChange).toHaveBeenCalledWith("1");
  });
  it("mostra il nome del cliente già scelto", () => {
    render(<ClienteCombobox clienti={clienti} value="2" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Cliente" })).toHaveTextContent("Anna Bianchi");
  });
});
