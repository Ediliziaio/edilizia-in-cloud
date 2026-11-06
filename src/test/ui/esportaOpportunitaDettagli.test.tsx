import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EsportaOpportunitaDialog } from "@/components/opportunities/EsportaOpportunitaDialog";

const onEsporta = vi.fn();
const pieno = { note: true, appuntamenti: true, parzialeNote: false, parzialeAppuntamenti: false };
const apri = (accesso?: typeof pieno) => render(
  <EsportaOpportunitaDialog
    aperto onChiudi={vi.fn()} fasi={[]} piuPipeline={false} filtriAttivi={0} inCorso={false}
    chiaveMemoria="prova" onEsporta={onEsporta} accesso={accesso}
  />,
);

beforeEach(() => { onEsporta.mockReset(); localStorage.clear(); });
afterEach(cleanup);

describe("Esporta opportunità: note e appuntamenti", () => {
  it("si scelgono e arrivano all'esportazione", () => {
    apri();
    fireEvent.click(screen.getByRole("checkbox", { name: /^Note/ }));
    fireEvent.click(screen.getByRole("button", { name: "Esporta" }));
    expect(onEsporta.mock.calls[0][0]).toMatchObject({ note: true, appuntamenti: false });
  });

  it("senza permesso la casella è spenta e lo dice, anche se era ricordata", () => {
    localStorage.setItem("eic.esportaOpportunita.dettagli.prova", JSON.stringify({ note: true, appuntamenti: true }));
    apri({ ...pieno, appuntamenti: false });
    expect(screen.getByRole("checkbox", { name: /Appuntamenti/ })).toBeDisabled();
    expect(screen.getByText(/non hai il permesso di vederli/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Esporta" }));
    expect(onEsporta.mock.calls[0][0]).toMatchObject({ note: true, appuntamenti: false });
  });

  it("chi vede solo una parte viene avvisato", () => {
    localStorage.setItem("eic.esportaOpportunita.dettagli.prova", JSON.stringify({ note: true }));
    apri({ ...pieno, parzialeNote: true });
    expect(screen.getByText(/solo le note che puoi vedere/)).toBeInTheDocument();
  });

  it("una casella spenta non fa comparire avvisi su colonne che non ci saranno", () => {
    localStorage.setItem("eic.esportaOpportunita.dettagli.prova", JSON.stringify({ appuntamenti: true }));
    apri({ ...pieno, appuntamenti: false, parzialeAppuntamenti: true });
    expect(screen.queryByText(/Colonne con il riepilogo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/che puoi vedere/)).not.toBeInTheDocument();
  });

  it("si può filtrare anche lo stato Abbandonate", () => {
    apri();
    fireEvent.click(screen.getByRole("checkbox", { name: "Abbandonate" }));
    fireEvent.click(screen.getByRole("button", { name: "Esporta" }));
    expect([...onEsporta.mock.calls[0][0].stati]).toEqual(["abandoned"]);
  });
});
