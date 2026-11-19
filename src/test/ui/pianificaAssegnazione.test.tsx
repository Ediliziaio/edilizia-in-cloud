import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PianificaAssegnazione } from "@/components/orders/PianificaAssegnazione";

vi.mock("@/hooks/useAssignmentHourlyCost", () => ({
  useDipendentiDeiProfili: () => ({}),
  useCostiOrariPrevisione: () => ({ allowed: true, data: new Map([["mario", 25]]), isPending: false }),
}));
afterEach(cleanup);

it("conserva l'esito parziale e riprende dalla prima operazione non confermata", async () => {
  const date = vi.fn().mockResolvedValue(undefined);
  const assegna = vi.fn().mockRejectedValueOnce(new Error("Connessione interrotta")).mockResolvedValue(undefined);
  const occupato = vi.fn();
  const onPassaggi = vi.fn(() => [{ nome: "date della fase", esegui: date }, { nome: "operaio", esegui: assegna }]);
  render(<PianificaAssegnazione
    ambiti={[{ id: "fase", nome: "Serramenti", faseId: "fase", dal: "2026-11-23", al: "2026-11-25" }]}
    persone={[{ id: "mario", label: "Mario Rossi" }]} squadre={[]} calendario={{ lavorativo: () => true, sabato: false }}
    puoPersone puoSquadre puoVoci puoDate onPassaggi={onPassaggi} onOccupato={occupato}
  />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Mario Rossi" }));
  fireEvent.click(screen.getByRole("button", { name: "Salva assegnazione" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("1 di 2 operazioni confermate");
  expect(occupato).toHaveBeenLastCalledWith(true);
  expect(onPassaggi).toHaveBeenCalledWith(expect.objectContaining({ ore: [24], personeConTariffa: new Set(["mario"]) }));
  fireEvent.click(screen.getByRole("button", { name: "Completa il salvataggio" }));
  await waitFor(() => expect(occupato).toHaveBeenLastCalledWith(false));
  expect(date).toHaveBeenCalledTimes(1);
  expect(assegna).toHaveBeenCalledTimes(2);
  expect(onPassaggi).toHaveBeenCalledTimes(1);
});

it("permette di cambiare la quota di ogni voce e salva soltanto un totale completo", async () => {
  const salva = vi.fn().mockResolvedValue(undefined);
  const squadra = { id: "sq", nome: "Squadra demo", colore: null, responsabile: null, componenti: [], commesse: [] };
  render(<PianificaAssegnazione
    ambiti={[
      { id: "v1", nome: "Esecuzione", faseId: "fase", sottofaseId: "v1" },
      { id: "v2", nome: "Verifica", faseId: "fase", sottofaseId: "v2" },
    ]}
    persone={[{ id: "mario", label: "Mario Rossi" }]} squadre={[squadra]}
    calendario={{ lavorativo: () => true, sabato: false }} puoPersone puoSquadre puoVoci puoDate
    previsionale={{ salva }} onOccupato={vi.fn()}
  />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Mario Rossi" }));
  fireEvent.change(screen.getByLabelText("Dal"), { target: { value: "2026-11-23" } });
  fireEvent.change(screen.getByLabelText("Al"), { target: { value: "2026-11-24" } });
  const submit = screen.getByRole("button", { name: "Salva previsionale" });
  expect(screen.getByLabelText("Ore giornaliere per Esecuzione")).toHaveValue("4");
  fireEvent.change(screen.getByLabelText("Ore giornaliere per Esecuzione"), { target: { value: "6" } });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Ore giornaliere per Verifica"), { target: { value: "2" } });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(salva).toHaveBeenCalledWith(expect.objectContaining({
    oreGiorno: 8, microOrePerAmbito: [6_000_000, 2_000_000], dal: "2026-11-23", al: "2026-11-24",
  }), expect.any(String)));
});
