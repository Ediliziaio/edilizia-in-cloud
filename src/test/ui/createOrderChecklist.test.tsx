import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateOrderChecklist } from "@/components/orders/CreateOrderChecklist";

afterEach(cleanup);
const checks = [
  { label: "Cliente selezionato", done: false },
  { label: "Descrizione lavoro", done: false },
  { label: "Importo valido", done: false },
  { label: "Stato iniziale", done: true },
  { label: "Righe ordine coerenti", done: true },
];

describe("controlli commessa compatti sul telefono", () => {
  it("parte chiusa con il numero di controlli mancanti, mantenendo i dettagli visibili da desktop", () => {
    render(<CreateOrderChecklist checks={checks} />);
    const trigger = screen.getByRole("button", { name: "Controlli commessa: 3 da completare" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const details = document.getElementById(trigger.getAttribute("aria-controls")!);
    expect(details).toHaveClass("hidden", "md:flex");
    expect(details?.querySelectorAll("li")).toHaveLength(5);
    expect(trigger).toHaveClass("min-h-11", "md:hidden");
  });

  it("espande i dettagli senza inviare il modulo e può richiuderli", () => {
    const submit = vi.fn();
    render(<form onSubmit={(e) => { e.preventDefault(); submit(); }}><CreateOrderChecklist checks={checks} /></form>);
    const trigger = screen.getByRole("button", { name: /Controlli commessa:/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const details = document.getElementById(trigger.getAttribute("aria-controls")!);
    expect(details).not.toHaveClass("hidden");
    expect(screen.getAllByText("Da fare")).toHaveLength(3);
    expect(screen.getAllByText("OK", { exact: true })).toHaveLength(2);
    fireEvent.click(trigger);
    expect(details).toHaveClass("hidden");
    expect(submit).not.toHaveBeenCalled();
  });

  it("il conteggio segue i dati del modulo senza perdere lo stato aperto", () => {
    const { rerender } = render(<CreateOrderChecklist checks={checks} />);
    fireEvent.click(screen.getByRole("button", { name: /Controlli commessa:/ }));
    rerender(<CreateOrderChecklist checks={checks.map((check) => ({ ...check, done: true }))} />);
    expect(screen.getByRole("button", { name: "Controlli commessa: Tutto pronto" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("Da fare")).not.toBeInTheDocument();
    expect(screen.getAllByText("OK", { exact: true })).toHaveLength(5);
  });
});
