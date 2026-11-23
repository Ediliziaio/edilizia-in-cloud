import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FornituraOrdineCard } from "@/components/acquisti/FornituraOrdineCard";

afterEach(cleanup);

const base = {
  caricamentoRighe: false,
  caricamentoRichiesta: false,
  erroreRichiesta: false,
  caricamentoDdt: false,
  erroreDdt: false,
  ddt: 1,
};

it("apre il confronto e aggiorna il residuo per unità quando arrivano le quantità confermate", () => {
  const apriDdt = vi.fn();
  const righe = [
    { quantity: 100, quantity_received: 80, unit_of_measure: "pz" },
    { quantity: 5, quantity_received: 5, unit_of_measure: "m²" },
  ];
  const { rerender } = render(<FornituraOrdineCard {...base} righe={righe} apriDdt={apriDdt} />);
  const tabella = screen.getByRole("table", { name: "Quantità della fornitura per unità di misura" });
  const rigaPezzi = within(tabella).getByRole("rowheader", { name: "pz" }).closest("tr")!;
  expect(within(rigaPezzi).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["100", "80", "20"]);
  expect(screen.getByText("1 di 2 righe ricevute per intero")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Confronta DDT" }));
  expect(apriDdt).toHaveBeenCalledOnce();

  rerender(<FornituraOrdineCard {...base} righe={[{ ...righe[0], quantity_received: 100 }, righe[1]]} />);
  const aggiornati = screen.getByRole("rowheader", { name: "pz" }).closest("tr")!;
  expect(within(aggiornati).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["100", "100", "0"]);
  expect(screen.getByText("Tutte le righe ricevute")).toBeVisible();
});

it("distingue un errore di lettura e offre il tentativo senza proporre la registrazione", () => {
  const riprova = vi.fn();
  render(<FornituraOrdineCard {...base} ddt={0} erroreDdt righe={[]} apriDdt={riprova} />);
  expect(screen.queryByText("Nessun DDT collegato")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Registra DDT" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
  expect(riprova).toHaveBeenCalledOnce();
  expect(screen.queryByText("Fatture e pagamenti")).not.toBeInTheDocument();
});
