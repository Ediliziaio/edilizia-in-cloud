import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EsportaRapportiniExcel, TotaliCampiCommessa } from "@/components/orders/TotaliCampiCommessa";

const stato = vi.hoisted(() => ({ risposta: { data: [] as unknown[], error: null as unknown }, mobile: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async () => stato.risposta } }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const mostra = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <TotaliCampiCommessa orderId="o1" />
</QueryClientProvider>);
const mostraExcel = (rapportini: unknown[]) => render(<EsportaRapportiniExcel orderId="o1" rapportini={rapportini as never[]} />);
beforeEach(() => { stato.risposta = { data: [], error: null }; stato.mobile = false; });
afterEach(cleanup);

describe("TotaliCampiCommessa", () => {
  it("senza dati né rapportini non mostra nulla", () => {
    const { container } = mostra();
    expect(container).toBeEmptyDOMElement();
  });
  it("mostra i totali con l'unità e i sì, separando da approvare", async () => {
    stato.risposta = { data: [
      { chiave: "p", etichetta: "Pezzi posati", tipo: "number", unita: "pz", phase_id: null, fase_nome: null, approvati: 12, da_approvare: 3 },
      { chiave: "s", etichetta: "Sicurezza", tipo: "boolean", unita: null, phase_id: null, fase_nome: null, approvati: 3, da_approvare: 0 },
    ], error: null };
    mostra();
    expect(await screen.findByText("12 pz")).toBeInTheDocument();
    expect(screen.getByText("3 pz da approvare")).toBeInTheDocument();
    expect(screen.getByText("3 sì")).toBeInTheDocument();
  });
  it("nomina la fase", async () => {
    stato.risposta = { data: [{ chiave: "p", etichetta: "Pezzi", tipo: "number", unita: null, phase_id: "f", fase_nome: "Posa", approvati: 1, da_approvare: 0 }], error: null };
    mostra();
    expect(await screen.findByText("Pezzi · Posa")).toBeInTheDocument();
  });
  it("con il database senza la funzione non dà errori", async () => {
    stato.risposta = { data: null as never, error: { code: "PGRST202" } };
    const { container } = mostra();
    await new Promise(r => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
  it("l'Excel sta fuori dai totali: non compare in questa riga", async () => {
    stato.risposta = { data: [{ chiave: "p", etichetta: "Pezzi", tipo: "number", unita: null, phase_id: null, fase_nome: null, approvati: 1, da_approvare: 0 }], error: null };
    mostra();
    expect(await screen.findByText("Pezzi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Esporta Excel" })).toBeNull();
  });
});

describe("EsportaRapportiniExcel", () => {
  it("c'è con dei rapportini, non da telefono e non senza rapportini", () => {
    const { unmount } = mostraExcel([{ data_lavoro: "2026-11-02", campi_extra: [] }]);
    expect(screen.getByRole("button", { name: "Esporta Excel" })).toBeInTheDocument();
    unmount();
    const vuoto = mostraExcel([]);
    expect(vuoto.container).toBeEmptyDOMElement();
    vuoto.unmount();
    stato.mobile = true;
    mostraExcel([{ data_lavoro: "2026-11-02", campi_extra: [] }]);
    expect(screen.queryByRole("button", { name: "Esporta Excel" })).toBeNull();
  });
});
