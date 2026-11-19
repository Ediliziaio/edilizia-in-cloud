import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { OrdersPipelineCard } from "@/components/orders/OrdersPipelineCard";
import type { OrderWithDetails } from "@/lib/orderUtils";

const ordine: OrderWithDetails = {
  id: "commessa",
  order_code: "DEMO-27",
  description: "Manutenzione straordinaria di fabbricato rurale",
  total_amount: 35000,
  deposit_amount: 0,
  deposit_paid: null,
  deposit_2_amount: null,
  deposit_2_paid: null,
  balance_amount: 35000,
  balance_paid: false,
  expected_date: null,
  warehouse_arrival_date: null,
  created_at: "2026-11-01",
  current_status_id: null,
  customer: { first_name: "SILVIA", last_name: "ROSSI", email: "" },
  status: null,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function verificaIntestazione(contenitore: HTMLElement, nome: string) {
  const t = within(contenitore);
  const riga = t.getByText(nome).parentElement!;
  expect(riga).toContainElement(t.getByText("DEMO-27"));
  expect(riga.nextElementSibling).toHaveTextContent(ordine.description);
}

it("mostra cliente e codice insieme sopra la descrizione nella card e nel riepilogo", () => {
  vi.useFakeTimers();
  render(<MemoryRouter><OrdersPipelineCard order={ordine} isDraggable={false} /></MemoryRouter>);
  const scheda = screen.getByRole("button", { name: "Apri dettagli commessa DEMO-27" });
  verificaIntestazione(scheda, "Silvia Rossi");

  fireEvent.focus(scheda);
  act(() => { vi.advanceTimersByTime(1000); });
  const riepilogo = screen.getByRole("button", { name: "Chiudi riepilogo commessa" }).parentElement!;
  verificaIntestazione(riepilogo, "Silvia Rossi");
});

it("usa il nominativo importato se l’anagrafica non è caricata e conserva la sigla societaria", () => {
  render(<MemoryRouter><OrdersPipelineCard order={{
    ...ordine, customer: null, client_name: "ESEMPIO COSTRUZIONI S.R.L.",
  }} isDraggable={false} /></MemoryRouter>);
  verificaIntestazione(screen.getByRole("button", { name: "Apri dettagli commessa DEMO-27" }), "Esempio Costruzioni S.R.L.");
});

it("evita di ripetere il nominativo importato all’inizio della descrizione", () => {
  render(<MemoryRouter><OrdersPipelineCard order={{
    ...ordine, description: `ROSSI SILVIA - ${ordine.description}`,
  }} isDraggable={false} /></MemoryRouter>);
  const scheda = screen.getByRole("button", { name: "Apri dettagli commessa DEMO-27" });
  verificaIntestazione(scheda, "Silvia Rossi");
  expect(within(scheda).queryByText(/ROSSI SILVIA -/u)).not.toBeInTheDocument();
});
