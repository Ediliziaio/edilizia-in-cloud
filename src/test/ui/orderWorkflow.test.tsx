import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OrderStatusWorkflow } from "@/components/orders/OrderStatusWorkflow";

afterEach(cleanup);
const stati = [
  { id: "a", name: "Contratto firmato con nome lungo", color: "#123456", position: 0 },
  { id: "b", name: "Lavori completati", color: "#123456", position: 1 },
];
const finite = { total: 2, done: 2, inCorso: 0, avgPct: 100 };
const draw = (props = {}) => {
  const change = vi.fn();
  render(<MemoryRouter><OrderStatusWorkflow orderId="o1" statuses={stati} currentStatusId="a" canEdit onStatusChange={change} formatoData={(d) => d.slice(0, 10)} {...props} /></MemoryRouter>);
  return change;
};

describe("Stato della commessa", () => {
  it("sta su una riga: barra degli stati, menu per cambiarlo, niente percorso", () => {
    draw();
    expect(screen.getByRole("button", { name: "Cambia stato" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Stato attuale: Contratto firmato con nome lungo" })).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText(/Percorso operativo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cambia percorso/)).not.toBeInTheDocument();
  });

  it("le lavorazioni finite propongono lo stato, ma lo cambia solo il clic", () => {
    const change = draw({ workProgress: finite });
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Passa a «Lavori completati»" }));
    expect(change).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("in sola lettura non si cambia niente, anche se arriva una callback", () => {
    const change = draw({ canEdit: false, workProgress: finite });
    expect(screen.queryByRole("button", { name: /Passa a/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: 'Imposta stato "Lavori completati"' }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Cambia stato" })).not.toBeInTheDocument();
  });

  it("l'ultimo cambio dice quando e chi; porta al Registro; senza storico lo dice", () => {
    draw({ ultimoAutore: "Mario Rossi", statusHistory: [
      { id: "2", status_id: "b", changed_at: "2026-10-12T10:00:00Z", status: { name: "Lavori completati" } },
      { id: "1", status_id: "a", changed_at: "2026-10-01T10:00:00Z", status: { name: "Contratto" } },
    ] });
    expect(screen.getByText("Ultimo cambio: 2026-10-12, Mario Rossi")).toBeVisible();
    expect(screen.getByText("Tutti i cambi (2)")).toBeVisible();
    expect(screen.getByRole("link", { name: "Registro attività" })).toHaveAttribute("href", "/azienda/ordini/o1/diario");
    cleanup();
    draw();
    expect(screen.getByText("Nessun cambio registrato")).toBeVisible();
  });
});
