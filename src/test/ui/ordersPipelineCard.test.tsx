import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { OrdersPipelineCard } from "@/components/orders/OrdersPipelineCard";
import type { OrderWithDetails } from "@/lib/orderUtils";

const ordine: OrderWithDetails = {
  id: "commessa",
  order_code: "O-0027",
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
  customer: { first_name: "FORTUNATO", last_name: "FILIPPETTO", email: "" },
  status: null,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function verificaIntestazione(contenitore: HTMLElement, nome: string) {
  const t = within(contenitore);
  const riga = t.getByText(nome).parentElement!;
  expect(riga).toContainElement(t.getByText("O-0027"));
  expect(riga.nextElementSibling).toHaveTextContent(ordine.description);
}

it("mostra cliente e codice insieme sopra la descrizione nella card e nel riepilogo", () => {
  vi.useFakeTimers();
  render(<MemoryRouter><OrdersPipelineCard order={ordine} isDraggable={false} /></MemoryRouter>);
  const scheda = screen.getByRole("button", { name: "Apri dettagli commessa O-0027" });
  verificaIntestazione(scheda, "Fortunato Filippetto");

  fireEvent.focus(scheda);
  act(() => { vi.advanceTimersByTime(1000); });
  const riepilogo = screen.getByRole("button", { name: "Chiudi riepilogo commessa" }).parentElement!;
  verificaIntestazione(riepilogo, "Fortunato Filippetto");
});

it("usa il nominativo importato se l’anagrafica non è caricata e conserva la sigla societaria", () => {
  render(<MemoryRouter><OrdersPipelineCard order={{
    ...ordine, customer: null, client_name: "DOMINA ITALIA S.R.L.",
  }} isDraggable={false} /></MemoryRouter>);
  verificaIntestazione(screen.getByRole("button", { name: "Apri dettagli commessa O-0027" }), "Domina Italia S.R.L.");
});
