import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useEmailCliente } from "@/hooks/useComunicazioniCliente";
import { OrderCommunicationsCard } from "@/components/orders/OrderCommunicationsCard";

const state = vi.hoisted(() => ({from: vi.fn(), rpc: vi.fn(), failed: false, emailRows: [] as object[]}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {from: state.from, rpc: state.rpc}}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: "company"}})}));
function wrapper({children}: {children: ReactNode}) {
  return <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}})}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}
beforeEach(() => {
  state.failed = false; state.emailRows = []; state.from.mockReset(); state.rpc.mockReset();
  state.rpc.mockResolvedValue({data: [], error: null});
  state.from.mockImplementation(() => {
    const q = {select: () => q, eq: () => q, order: () => q, limit: () => q, ilike: async (field: string) => ({data: field === "from_email" ? state.emailRows : [], error: state.failed && field === "to_email" ? {message: "Rete"} : null})};
    return q;
  });
});
afterEach(cleanup);
describe("Comunicazioni cliente: errori non mascherati", () => {
  it("rifiuta il risultato se uno dei due canali email fallisce", async () => {
    state.failed = true;
    const {result} = renderHook(() => useEmailCliente("customer", "company", "cliente@example.invalid"), {wrapper});
    await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined();
  });
  it("mantiene una sola email per conversazione", async () => {
    state.emailRows = [{id: "old", thread_id: "thread", received_at: "2026-10-01"}, {id: "new", thread_id: "thread", received_at: "2026-10-13"}];
    const {result} = renderHook(() => useEmailCliente("customer", "company", "cliente@example.invalid"), {wrapper});
    await waitFor(() => expect(result.current.isSuccess).toBe(true)); expect(result.current.data?.map(r => r.id)).toEqual(["new"]);
  });
  it("mostra l'errore senza dichiarare che non esistono messaggi", async () => {
    state.failed = true; render(<OrderCommunicationsCard compact customerId="customer" customerEmail="cliente@example.invalid" />, {wrapper});
    expect(await screen.findByRole("alert")).toHaveTextContent("Comunicazioni non disponibili");
    expect(screen.queryByText("Nessuna comunicazione recente con questo cliente.")).not.toBeInTheDocument();
    state.failed = false; fireEvent.click(screen.getByRole("button", {name: "Riprova"}));
    await screen.findByText("Nessuna comunicazione recente con questo cliente.");
  });
  it("non duplica il titolo nel contenitore compatto", async () => {
    render(<OrderCommunicationsCard compact customerId="customer" customerEmail="cliente@example.invalid" />, {wrapper});
    await screen.findByText("Nessuna comunicazione recente con questo cliente.");
    expect(screen.queryByText("Comunicazioni col cliente")).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Apri conversazioni cliente"})).toHaveAttribute("href", "/azienda/clienti/customer?tab=email");
  });
});
