import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OrderStatusWorkflow } from "@/components/orders/OrderStatusWorkflow";

afterEach(cleanup);
const stati = [
  { id: "a", name: "Aperta", color: "#123456", position: 0 },
  { id: "b", name: "In corso", color: "#123456", position: 1 },
  { id: "c", name: "Lavori completati", color: "#123456", position: 2 },
  { id: "h", name: "Assistenza", color: "#123456", position: 3, is_support_phase: true },
];
const finite = { total: 2, done: 2, inCorso: 0, avgPct: 100 };
const storico = [
  { id: "2", status_id: "b", changed_at: "2026-10-12T10:00:00Z", status: { name: "In corso" } },
  { id: "1", status_id: "a", changed_at: "2026-10-01T10:00:00Z", status: { name: "Aperta" } },
];
const draw = (props = {}) => {
  const change = vi.fn();
  render(<MemoryRouter><OrderStatusWorkflow orderId="o1" statuses={stati} currentStatusId="b" canEdit onStatusChange={change} formatoData={(d) => d.slice(0, 10)} {...props} /></MemoryRouter>);
  return change;
};
const apriMenu = () => fireEvent.keyDown(screen.getByRole("button", { name: /Cambia stato/ }), { key: "Enter" });

describe("Stato della commessa", () => {
  it("il nome dello stato è il controllo; dice a che fase è, senza contare l'assistenza", () => {
    draw();
    expect(screen.getByRole("button", { name: "Stato commessa: In corso. Cambia stato" })).toBeVisible();
    expect(screen.getByText("Fase 2 di 3")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Fase della commessa" })).toHaveAttribute("aria-valuenow", "2");
    expect(screen.queryByText(/Ultimo cambio/)).not.toBeInTheDocument();
  });

  it("nel menu: tutti gli stati, l'attuale non si sceglie, un clic chiede il cambio", () => {
    const change = draw({ statusHistory: storico, ultimoAutore: "Mario Rossi" });
    apriMenu();
    expect(screen.getByRole("menuitem", { name: /In corso \(attuale\)/ })).toHaveAttribute("data-disabled");
    expect(screen.getByText("2026-10-12 · In corso · Mario Rossi")).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /Registro attività/ })).toHaveAttribute("href", "/azienda/ordini/o1/diario");
    fireEvent.click(screen.getByRole("menuitem", { name: /Lavori completati/ }));
    expect(change).toHaveBeenCalledExactlyOnceWith("c");
  });

  it("la spunta viene dallo storico, non dall'ordine degli stati", () => {
    draw({ currentStatusId: "c", statusHistory: [storico[1]] });
    apriMenu();
    expect(screen.getByRole("menuitem", { name: /Aperta/ })).toHaveTextContent("/2026");
    expect(screen.getByRole("menuitem", { name: /In corso/ })).not.toHaveTextContent("/2026");
  });

  it("le lavorazioni finite propongono lo stato, ma lo cambia solo il clic", () => {
    const change = draw({ workProgress: finite });
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lavorazioni finite: passa a «Lavori completati»" }));
    expect(change).toHaveBeenCalledExactlyOnceWith("c");
  });

  it("in sola lettura si legge e basta, anche se arriva una callback", () => {
    draw({ canEdit: false, workProgress: finite });
    expect(screen.getByText("In corso")).toBeVisible();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("uno stato di assistenza o nessuno stato non hanno la fase", () => {
    draw({ currentStatusId: "h" });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    cleanup();
    draw({ currentStatusId: null });
    expect(screen.getByRole("button", { name: /Stato non impostato/ })).toBeVisible();
  });
});
