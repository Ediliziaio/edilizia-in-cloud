import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
const righe = [
  { id: "f1", email: "mario@example.it", nome: "Mario", cognome: "Rossi", documento_tipo: "carta_identita", documento_scadenza: "2099-01-01", modalita: "azienda", dichiarazione_accettata_at: null, created_at: "2026-10-22" },
  { id: "f2", email: "anna@example.it", nome: "Anna", cognome: "Bianchi", documento_tipo: "passaporto", documento_scadenza: "2099-01-01", modalita: "autonoma", dichiarazione_accettata_at: "2026-10-22T10:00:00Z", created_at: "2026-10-22" },
];
vi.mock("@/integrations/supabase/client", () => {
  const catena = { select: () => catena, eq: () => catena, is: () => catena, order: async () => ({ data: righe, error: null }) };
  return { supabase: { from: () => catena, functions: { invoke: mock.invoke } } };
});
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { FirmatariIdentificati } from "@/components/fea/FirmatariIdentificati";

const disegna = () => render(<QueryClientProvider client={new QueryClient()}><FirmatariIdentificati /></QueryClientProvider>);
afterEach(cleanup);

describe("Firmatari identificati", () => {
  it("dice chi ha caricato il documento e se le condizioni sono già accettate", async () => {
    disegna();
    expect(await screen.findByText("Rossi Mario")).toBeInTheDocument();
    expect(screen.getByText("Caricato dall'azienda")).toBeInTheDocument();
    expect(screen.getByText("Accetterà le condizioni al primo documento")).toBeInTheDocument();
    expect(screen.getByText("Caricato dal firmatario")).toBeInTheDocument();
  });
  it("l'azienda registra il documento solo dopo aver confermato di averlo visto", async () => {
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: /Carica documento d'identità/ }));
    expect(screen.getByRole("button", { name: "Registra" })).toBeDisabled();
    expect(screen.getByText(/Ho visto il documento originale/)).toBeInTheDocument();
  });
});
