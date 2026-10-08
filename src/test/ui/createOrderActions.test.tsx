import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateOrderActions } from "@/components/orders/CreateOrderActions";

afterEach(cleanup);

function setup(pending = false, created = false) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const open = vi.fn();
  render(<form onSubmit={(e) => { e.preventDefault(); submit(); }}>
    <CreateOrderActions pending={pending} created={created} onCancel={cancel} onOpenCreated={open} />
  </form>);
  return { submit, cancel, open };
}

describe("azioni della nuova commessa, compatte sul telefono", () => {
  it("ha una sola azione primaria e Annulla non invia il modulo", () => {
    const { submit, cancel } = setup();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Crea commessa" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("non usa sticky o fixed a nessun breakpoint: niente sovrapposizioni con campi e navigazione", () => {
    setup();
    const footer = screen.getByTestId("create-order-actions");
    expect(footer).toHaveClass("static", "w-full", "min-w-0");
    expect(footer).not.toHaveClass("fixed", "sticky", "bottom-0", "-mx-4");
    expect(footer).not.toHaveClass("md:sticky", "md:fixed", "md:bottom-0");
    expect(screen.getByRole("button", { name: "Crea commessa" })).toHaveClass("flex-1", "min-w-0", "justify-center", "h-11");
    expect(screen.getByRole("button", { name: "Annulla" })).toHaveClass("shrink-0", "h-11");
  });

  it("blocca anche Annulla durante la creazione, con stato leggibile", () => {
    const { submit, cancel } = setup(true);
    expect(screen.getByTestId("create-order-actions")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Creazione…");
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(submit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("apre una commessa già creata senza un secondo invio", () => {
    const { submit, open } = setup(false, true);
    expect(screen.queryByRole("button", { name: "Annulla" })).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Vai alla commessa" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(open).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it("non consente di aprire la commessa finché i dettagli sono in salvataggio", () => {
    const { open, submit } = setup(true, true);
    const button = screen.getByRole("button", { name: "Completo la commessa…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(open).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
