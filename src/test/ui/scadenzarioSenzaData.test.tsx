import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import type { Scadenza } from "@/hooks/useScadenzario";
import { statoScadenza } from "@/lib/finance/collegamentiFinanza";
import { tempoScadenza } from "@/lib/finance/dettaglioScadenza";

const row = { id: "fonte", description: "Costo da pianificare", direction: "uscita", tipo: "costo_aziendale", amount: 122,
  paid_amount: 0, due_date: null, status: "da_pagare", auto_source: "fonte_costo", is_auto_generated: true, cost_id: "c1" } as Scadenza;
afterEach(cleanup);
it("mostra Senza data su desktop e mobile e apre la fonte anziché registrare un pagamento virtuale", () => {
  const paga = vi.fn();
  render(<ScadenzarioTable scadenze={[row]} onMarkPaid={paga} onCancel={vi.fn()} onNota={vi.fn()} onModifica={vi.fn()} />);
  expect(screen.getAllByText("Senza data").length).toBeGreaterThan(0);
  expect(screen.queryByText(/NaN|9999|Invalid Date/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Paga" })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Apri fonte" })[0]);
  expect(paga).toHaveBeenCalledWith(row);
  expect(screen.queryByRole("button", { name: /Modifica|Annulla scadenza/ })).toBeNull();
});
it("una data ignota non è in ritardo", () => {
  expect(statoScadenza(row).tono).toBe("attesa");
  expect(tempoScadenza(row).testo).toBe("Data da definire nella fonte");
});
