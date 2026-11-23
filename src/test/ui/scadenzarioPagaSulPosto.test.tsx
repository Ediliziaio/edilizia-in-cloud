import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import type { Scadenza } from "@/hooks/useScadenzario";

/**
 * La rata di un fornitore si paga dallo scadenzario (23/11/2026). Prima il pulsante diceva
 * «Apri fonte» e portava alla pagina Costi; adesso apre il pagamento del costo sul posto, e il
 * pulsante lo dice. Niente pagamento «virtuale» sulla riga: si paga il costo vero.
 */
const rata = { id: "fonte:c1:r1", description: "Fattura 4721 · KLASSE SRL · RiBa", direction: "uscita", tipo: "pagamento_fornitore",
  amount: 651.58, paid_amount: 0, due_date: "2027-02-28", status: "da_pagare", auto_source: "fonte_costo",
  is_auto_generated: true, cost_id: "c1" } as Scadenza;
afterEach(cleanup);

it("con il pagamento sul posto la rata del fornitore dice «Paga» e lo apre", () => {
  const paga = vi.fn();
  render(<ScadenzarioTable scadenze={[rata]} onMarkPaid={paga} onCancel={vi.fn()} pagaSulPosto={(s: Scadenza) => s.auto_source === "fonte_costo"} />);
  expect(screen.queryByText("Apri fonte")).toBeNull();
  const pulsanti = screen.getAllByRole("button", { name: /Paga/ });
  expect(pulsanti.length).toBeGreaterThan(0);
  fireEvent.click(pulsanti[0]);
  expect(paga).toHaveBeenCalledWith(rata);
});

it("senza (per esempio senza il permesso sui costi) resta «Apri fonte»", () => {
  render(<ScadenzarioTable scadenze={[rata]} onMarkPaid={vi.fn()} onCancel={vi.fn()} pagaSulPosto={(): boolean => false} />);
  expect(screen.getAllByText("Apri fonte").length).toBeGreaterThan(0);
});
