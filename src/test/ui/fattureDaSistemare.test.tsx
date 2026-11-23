import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ righe: [] as unknown[], rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async (n: string, a: unknown) => { stato.rpc(n, a); return { data: stato.righe, error: null as unknown }; } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az" } }) }));
import { FattureDaSistemare } from "@/components/fatturazione/FattureDaSistemare";

afterEach(cleanup);
const mostra = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FattureDaSistemare /></MemoryRouter></QueryClientProvider>);
const f = (id: string, citate: number, caricate: number, rifare = false) => ({ fattura_id: id, numero: `F-${id}`, data_fattura: "2026-09-30", fornitore: "Calcestruzzi Demo", totale: 1000, bolle_citate: citate, bolle_caricate: caricate, divisione_da_rifare: rifare });

describe("fatture da sistemare (23/11/2026)", () => {
  it("dice cosa manca per ogni fattura e filtra per problema", async () => {
    stato.righe = [f("1", 41, 1), f("2", 3, 3, true)];
    mostra();
    expect(await screen.findByText("40 bolle su 41 da caricare")).toBeInTheDocument();
    expect(screen.getByText("Divisa fra le commesse diversamente dalle bolle")).toBeInTheDocument();
    expect(stato.rpc).toHaveBeenCalledWith("fatture_da_sistemare", { p_company: "az", p_limite: 500 });
    fireEvent.click(screen.getByRole("button", { name: /Divisione da rifare/ }));
    expect(screen.queryByText("40 bolle su 41 da caricare")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Apri" })[0]).toHaveAttribute("href", "/azienda/documenti/fatture-ricevute?fattura=2");
  });
  it("niente da sistemare: lo dice", async () => {
    stato.righe = [];
    mostra();
    expect(await screen.findByText(/Nessuna fattura da sistemare/)).toBeInTheDocument();
  });
});
