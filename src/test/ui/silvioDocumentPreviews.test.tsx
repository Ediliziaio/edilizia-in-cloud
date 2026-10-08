import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SilvioActionSummary } from "@/components/silvio/SilvioActionSummary";
afterEach(cleanup);
describe("Document confirmation previews", () => {
  it("shows Italian quote aliases, units, price and VAT without claiming it is sent", () => {
    render(<SilvioActionSummary actionType="crea_preventivo_bozza" payload={{ cliente_nome: "Cliente Demo", titolo: "Bagno", iva: 0,
      righe: [{ descrizione: "Piastrelle", quantita: 12, unita: "mq", prezzo_unitario: 20 }] }} />);
    expect(screen.getByText("Cliente Demo")).toBeVisible();
    expect(screen.getByText(/Non la invia al cliente/)).toBeVisible();
    fireEvent.click(screen.getByText("Controlla le voci e i prezzi"));
    expect(screen.getByText(/Quantità: 12 mq/)).toBeVisible();
    expect(screen.getByText("IVA: 0%")).toBeVisible();
  });
  it("distinguishes ordinary and overtime hours and shows the actual work date", () => {
    render(<SilvioActionSummary actionType="registra_rapportino" payload={{ commessa_codice: "TEST-01", data: "2026-10-07", per_utente_nome: "Operaia Demo", ore: 7.25, straordinario: 1.5, descrizione_lavori: "Posa ceramica" }} />);
    expect(screen.getByText(/Non lo approva/)).toBeVisible();
    expect(screen.getByText("TEST-01")).toBeVisible();
    expect(screen.getByText("7.25 h")).toBeVisible();
    expect(screen.getByText("1.5 h")).toBeVisible();
    expect(screen.getByText("Posa ceramica")).toBeVisible();
  });
});
