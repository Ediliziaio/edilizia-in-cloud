import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ righe: [] as unknown[], rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (n: string, a: unknown) => {
      stato.rpc(n, a);
      return { data: n === "riapri_pagamenti_segnati" ? 1 : stato.righe, error: null as unknown };
    },
  },
}));
import { PagamentiSegnatiDaSistemare } from "@/components/fatturazione/PagamentiSegnatiDaSistemare";

const riga = (id: string, numero: string, fornitore: string, residuo: number, rata_numero = 1) => ({
  costo_id: `c-${id}`, fattura_id: `f-${id}`, numero_fattura: numero, fornitore,
  scadenza: "2026-10-31", importo: residuo, residuo, rata_id: `r-${id}`, rata_numero, costo_pagato: false,
});

const mostra = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><PagamentiSegnatiDaSistemare companyId="az" /></MemoryRouter>
    </QueryClientProvider>,
  );

const chiamateRiapri = () => stato.rpc.mock.calls.filter(([n]) => n === "riapri_pagamenti_segnati").map(([, a]) => a);

beforeEach(() => {
  stato.rpc.mockClear();
  stato.righe = [riga("1", "FT-1", "FORNITORE A", 1263.42), riga("2", "FT-2", "FORNITORE B", 3500, 2)];
});
afterEach(cleanup);

describe("pagamenti segnati da sistemare: scelta per riga (27/11/2026)", () => {
  it("l'elenco mostra fattura, fornitore, scadenza, residuo e il collegamento alla fattura", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Mostra l'elenco/ }));
    const tabella = screen.getByRole("table");
    expect(within(tabella).getByRole("link", { name: "FT-1" }))
      .toHaveAttribute("href", "/azienda/documenti/fatture-ricevute?fattura=f-1");
    expect(within(tabella).getByText("FORNITORE B")).toBeInTheDocument();
    expect(within(tabella).getByText(/Rata 2/)).toBeInTheDocument();
    expect(within(tabella).getAllByText(/31 ott 2026/)).toHaveLength(2);
    expect(within(tabella).getByText(/1\.263,42/)).toBeInTheDocument();
  });

  it("riapre solo le rate scelte, passandole come p_rate", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Mostra l'elenco/ }));
    const selezionate = screen.getByRole("button", { name: /Riapri \(0 selezionati\)/ });
    expect(selezionate).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona FT-2" }));
    fireEvent.click(screen.getByRole("button", { name: /Riapri \(1 selezionati\)/ }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText(/3\.500,00/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Riapri" }));
    await waitFor(() => expect(chiamateRiapri()).toHaveLength(1));
    expect(chiamateRiapri()[0]).toEqual({ p_company: "az", p_costi: null, p_rate: ["r-2"] });
  });

  it("«Tutte» riapre tutto senza elenco di rate", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Mostra l'elenco/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutto" }));
    expect(screen.getByRole("button", { name: /Riapri \(2 selezionati\)/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Tutte \(2\)/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Riapri" }));
    await waitFor(() => expect(chiamateRiapri()).toHaveLength(1));
    expect(chiamateRiapri()[0]).toEqual({ p_company: "az", p_costi: null });
  });

  it("il titolo conta le fatture, non le rate", async () => {
    stato.righe = [
      riga("1", "FT-1", "FORNITORE A", 100),
      { ...riga("1", "FT-1", "FORNITORE A", 100, 2), rata_id: "r-1b" },
    ];
    mostra();
    expect(await screen.findByText(/Una fattura risulta pagata/)).toBeInTheDocument();
  });

  it("niente da sistemare: non mostra niente", async () => {
    stato.righe = [];
    const { container } = mostra();
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("pagamenti_segnati_da_sistemare", { p_company: "az" }));
    expect(container).toBeEmptyDOMElement();
  });
});
