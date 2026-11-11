import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bagnoDaVerificare, bagnoVerificatoSintetico } from "../fixtures/bagnoDaVerificare";
import VociImpiantiDallaPianta from "@/components/computo/commessa/pianta/VociImpiantiDallaPianta";

const chiamate = vi.hoisted(() => ({ carica: vi.fn(), scrivi: vi.fn(), errore: vi.fn() }));
let documento: ReturnType<typeof bagnoDaVerificare>;
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: chiamate.scrivi } }));
vi.mock("sonner", () => ({ toast: { error: chiamate.errore, success: vi.fn() } }));
vi.mock("@/lib/planimetrie/archivio", () => ({
  caricaVersione: chiamate.carica,
  useElencoPlanimetrie: () => ({ data: [{ id: "p1", titolo: "Bagno di prova", order_id: "o1" }] }),
  usePlanimetria: () => ({ data: { riga: { id: "p1" }, versione: { numero: 1, documento } }, isLoading: false }),
}));
// Una proposta basta per verificare che il blocco dipenda dalla lettura, non dal conteggio zero.
vi.mock("@/lib/planimetrie/listinoImpianti", () => ({ vociDallaPianta: () => [{
  voce: { id: "presa", descrizione: "Punto presa di prova", capitolo: "Impianto elettrico", unita: "n", prezzo: 48 },
  quantita: 1, chiave: "fatto:elementi:esistente:presa.numero", stimata: false,
}] }));

beforeEach(() => { vi.clearAllMocks(); documento = bagnoDaVerificare(); });
function monta() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><MemoryRouter>
    <VociImpiantiDallaPianta uploadId="k1" companyId="c1" orderId="o1" ordineDa={1} aperta onChiudi={vi.fn()} />
  </MemoryRouter></QueryClientProvider>);
}

it("non inserisce voci impianti finché ci sono quote da verificare", () => {
  monta();
  expect(screen.getByRole("alert")).toHaveTextContent("423 oppure 421,5");
  const aggiungi = screen.getByRole("button", { name: "Aggiungi 1 voci" });
  expect(aggiungi).toBeDisabled();
  fireEvent.click(aggiungi);
  expect(chiamate.scrivi).not.toHaveBeenCalled();
});

it("ricontrolla la versione salvata prima di qualsiasi scrittura", async () => {
  documento = bagnoVerificatoSintetico();
  chiamate.carica.mockResolvedValue({ documento: bagnoDaVerificare() });
  monta();
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi 1 voci" }));
  await waitFor(() => expect(chiamate.errore).toHaveBeenCalledWith(expect.stringContaining("423 oppure 421,5")));
  expect(chiamate.carica).toHaveBeenCalledWith("p1", 1);
  expect(chiamate.scrivi).not.toHaveBeenCalled();
});
