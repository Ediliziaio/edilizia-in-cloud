import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImpiantiTable } from "@/components/manutenzione/ImpiantiTable";

it("apre la scheda dalla riga e permette di selezionare un impianto separatamente", () => {
  const apri = vi.fn();
  const seleziona = vi.fn();
  render(<ImpiantiTable onOpen={apri} onToggle={seleziona} impianti={[{
    id: "i1", tipo_impianto: "caldaia", marca: "Demo", modello: "X1",
    garanzia_scadenza: null, data_installazione: null, customer: { first_name: "Anna", last_name: "Rossi" },
    stato: "senza_piano", prossimaScadenza: null, prossimoPianoId: null, contrattoNome: "Annuale",
    tecnicoId: null, tecnicoNome: null, priorita: null,
  }]} />);
  const tabella = within(screen.getByRole("table"));
  fireEvent.click(tabella.getByRole("checkbox", { name: "Seleziona caldaia" }));
  expect(seleziona).toHaveBeenCalledWith("i1");
  expect(apri).not.toHaveBeenCalled();
  fireEvent.click(tabella.getByRole("cell", { name: "Annuale" }));
  expect(apri).toHaveBeenCalledWith("i1");
  fireEvent.click(tabella.getByRole("button", { name: "Apri impianto" }));
  expect(apri).toHaveBeenCalledTimes(2);
});
