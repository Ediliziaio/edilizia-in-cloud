// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { EccezioniOperative } from "@/components/operazioni/EccezioniOperative";
import { DistintePagamenti } from "@/components/scadenzario/DistintePagamenti";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn<(nome: string, args: Record<string, unknown>) => Promise<unknown>>() }));
vi.mock("@/lib/operazioni/operazioni", async (originale) => ({
  ...await originale<typeof import("@/lib/operazioni/operazioni")>(),
  operazioniRpc: rpc,
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

const monta = (elemento: ReactNode) => render(
  <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {elemento}
  </QueryClientProvider></MemoryRouter>,
);

beforeEach(() => rpc.mockReset());
afterEach(cleanup);

describe("Operazioni prima del pagamento", () => {
  it("mostra un’unica attività con i due DDT da collegare e la persona assegnata", async () => {
    rpc.mockResolvedValue([{
      id: "attivita", tipo: "ddt", origine_id: "fattura-1", titolo: "Completa i DDT della fattura 881/A",
      scadenza: "2026-11-26", nome_responsabile: "Operatore acquisti", puo_prendere: false,
      dati: { ddt: [{ numero: "609/A", candidati: 0 }, { numero: "610/A", candidati: 0 }] },
    }]);
    monta(<EccezioniOperative companyId="azienda" />);
    expect(await screen.findAllByText("Completa i DDT della fattura 881/A")).toHaveLength(1);
    expect(screen.getByText(/DDT 609\/A/)).toBeVisible();
    expect(screen.getByText(/DDT 610\/A/)).toBeVisible();
    expect(screen.getByText("Operatore acquisti")).toBeVisible();
    expect(screen.getByRole("link", { name: "Apri fattura" })).toHaveAttribute("href", "/azienda/documenti/fatture-ricevute?fattura=fattura-1");
  });

  it("consente la bozza di una RiBa, richiede la verifica e disabilita l’approvazione", async () => {
    const riga = {
      fonte_id: "rata-1", tipo: "rata_fornitore", documento: "Fattura 882/A · rata 1",
      fornitore: "Forniture di prova", metodo: "MP12", scadenza: "2026-11-26",
      riferimenti: "Fattura n. 882/A", verifiche: [{ id: "fattura-1", numero: "882/A" }],
    };
    rpc.mockImplementation(async (nome) => {
      if (nome === "distinta_pagamenti_proposte") return { righe: [{ ...riga, residuo: 50 }], altre: false };
      if (nome === "distinta_pagamenti_crea") return "distinta-1";
      return [{
        id: "distinta-1", stato: "bozza", totale: 50, in_banca: 0, partite: 1,
        righe: [{ ...riga, importo: 50, in_banca: 0 }],
      }];
    });
    monta(<DistintePagamenti companyId="azienda" />);
    fireEvent.click(screen.getByRole("button", { name: "Distinte pagamenti" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Fattura 882\/A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    expect(await screen.findByRole("button", { name: "Approva distinta" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Scarica CSV" })).toBeNull();
    expect(screen.getByRole("link", { name: "Fattura 882/A" })).toBeVisible();
    expect(rpc).toHaveBeenCalledWith("distinta_pagamenti_crea", expect.objectContaining({
      p_scelte: [{ tipo: "rata_fornitore", fonte_id: "rata-1", importo: 50 }],
    }));
  });
});

