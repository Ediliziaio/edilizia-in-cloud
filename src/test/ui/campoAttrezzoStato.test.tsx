import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoAttrezzo from "@/pages/campo/CampoAttrezzo";
import type { SchedaCampoAttrezzo } from "@/types/mezzi";

const state = vi.hoisted(() => ({ m: null as SchedaCampoAttrezzo | null, mutate: vi.fn() }));
vi.mock("@/hooks/useMezzi", () => ({
  useCodiceMezzo: () => ({ data: { esito: "trovato", vista: "campo", mezzo: state.m, ho_profilo: true, cantieri: [{ id: "site", nome: "Cantiere" }], miei_veicoli: [] as unknown[] }, isLoading: false, isError: false }),
  useAzioneAttrezzo: () => ({ isPending: false, mutateAsync: state.mutate }),
  useCopertineMezzi: () => ({ data: new Map() }),
}));
vi.mock("@/components/mezzi/SegnalaProblemaDialog", () => ({ SegnalaProblemaDialog: () => <div>Segnalazione del problema</div> }));
const mostra = () => render(<MemoryRouter initialEntries={["/campo/mezzi/scansione/ATT-1"]}><Routes><Route path="/campo/mezzi/scansione/:codice" element={<CampoAttrezzo />} /></Routes></MemoryRouter>);

beforeEach(() => {
  state.mutate.mockReset().mockResolvedValue({});
  state.m = {
    id: "tool", company_id: "company", codice: "ATT-1", nome: "Trapano", tipo: "attrezzatura", classe: "attrezzatura", marca: null, modello: null,
    stato: "in_servizio", foto_path: null, categoria: null, gestione: "singola", unita_misura: null, quantita_totale: null, disponibile: null,
    veicolo: false, dove: "cantiere", dove_nome: "Cantiere", order_id: "site", con_me: false, montaggi: [], segnalazioni_aperte: 0,
  };
});
afterEach(cleanup);

describe("Scansione QR dal campo: attrezzi indisponibili", () => {
  it.each(["in_officina", "fuori_servizio"] as const)("non propone di prendere un attrezzo %s, ma permette rientro e segnalazione", async stato => {
    state.m!.stato = stato; mostra();
    expect(screen.getByRole("button", { name: "Lo prendo io" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Riportato in magazzino" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "È rotto o danneggiato" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Riportato in magazzino" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith({ mezzoId: "tool", azione: "magazzino" }));
  });
  it("non consente nuovi montaggi di attrezzatura fuori servizio, ma lascia rientrare quella già montata", () => {
    Object.assign(state.m!, { stato: "fuori_servizio", gestione: "quantita", disponibile: 10, quantita_totale: 15, unita_misura: "pz", montaggi: [{ id: "mount", order_id: "site", cantiere: "Cantiere", luogo: null, quantita: 5, dal: "2026-10-12" }] });
    mostra();
    expect(screen.getByRole("button", { name: "Montati in cantiere" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rientrato" })).toBeEnabled();
  });
  it("un attrezzo disponibile può ancora essere preso con un tocco", async () => {
    mostra(); fireEvent.click(screen.getByRole("button", { name: "Lo prendo io" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith({ mezzoId: "tool", azione: "prendo" }));
  });
});
