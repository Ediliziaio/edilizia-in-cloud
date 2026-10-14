import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderAssistenzaAlert, OrderAssistenzaTab } from "@/components/orders/OrderAssistenzaTab";

const state = vi.hoisted(() => ({company: "company", permissions: {canViewTickets: true, canEditTickets: true, canViewOrderAmounts: true, solaLettura: false, isLoading: false}, from: vi.fn(), rows: [] as object[], error: null as object | null, eq: vi.fn()}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => state.permissions}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({useEffectiveCompanyId: () => state.company}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {from: state.from}}));
const ticket = {id: "t", subject: "Intervento demo", status: "aperto", priority: "normale", tipo: "intervento", created_at: "2026-10-13", data_intervento_prevista: null as string | null, a_pagamento: true, pagato: false, importo_finale: 120, importo_preventivato: 100, merce_richiesta: false};
function draw(alert = false, client = new QueryClient({defaultOptions: {queries: {retry: false}}})) {
  const open = vi.fn();
  render(<QueryClientProvider client={client}><MemoryRouter>{alert ? <OrderAssistenzaAlert orderId="order" onOpen={open} /> : <OrderAssistenzaTab orderId="order" />}</MemoryRouter></QueryClientProvider>);
  return {client, open};
}
beforeEach(() => {
  state.company = "company"; state.permissions = {canViewTickets: true, canEditTickets: true, canViewOrderAmounts: true, solaLettura: false, isLoading: false};
  state.rows = []; state.error = null; state.from.mockReset(); state.eq.mockReset();
  state.from.mockImplementation(() => {
    const q = {select: vi.fn(() => q), eq: state.eq, order: vi.fn(async () => ({data: state.rows, error: state.error}))};
    state.eq.mockReturnValue(q); return q;
  });
});
afterEach(cleanup);

describe("Assistenza collegata: letture e avvisi affidabili", () => {
  it("isola la lettura per azienda e commessa", async () => {
    draw(); await screen.findByText("Nessuna assistenza aperta su questa commessa");
    expect(state.eq).toHaveBeenCalledWith("company_id", "company");
    expect(state.eq).toHaveBeenCalledWith("order_id", "order");
  });
  it("non scambia l'errore per nessun intervento", async () => {
    state.error = {message: "Rete"}; draw();
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile caricare");
    expect(screen.queryByText("Nessuna assistenza aperta su questa commessa")).not.toBeInTheDocument();
  });
  it("non interroga ticket senza permesso", () => {
    state.permissions.canViewTickets = false; draw(); expect(state.from).not.toHaveBeenCalled();
  });
  it("blocca la creazione in sola lettura e nasconde gli importi", async () => {
    state.rows = [ticket]; state.permissions.solaLettura = true; state.permissions.canViewOrderAmounts = false; draw();
    await screen.findByText("Intervento demo");
    expect(screen.queryByRole("link", {name: "Nuova assistenza"})).not.toBeInTheDocument();
    expect(screen.queryByText(/120/)).not.toBeInTheDocument();
  });
  it("mostra nella panoramica soltanto un avviso con accesso al pannello", async () => {
    state.rows = [ticket]; const {open} = draw(true);
    await screen.findByText("1 assistenza aperta"); fireEvent.click(screen.getByRole("button", {name: "Apri assistenza"}));
    expect(open).toHaveBeenCalledOnce(); expect(screen.queryByText("Intervento demo")).not.toBeInTheDocument();
  });
  it("condivide la cache tra avviso e pannello, senza una nuova lettura", async () => {
    state.rows = [ticket]; const {client} = draw(true); await screen.findByText("1 assistenza aperta");
    cleanup(); draw(false, client); await screen.findByText("Intervento demo");
    expect(state.from).toHaveBeenCalledOnce();
  });
  it("un risultato tagliato non viene presentato come completo", async () => {
    state.rows = Array.from({length: 1000}, (_, i) => ({...ticket, id: `t${i}`})); draw(true);
    expect(await screen.findByRole("alert")).toHaveTextContent("impossibile verificare");
  });
  it("l'avviso segnala l'errore e permette una nuova lettura", async () => {
    state.error = {message: "Rete"}; draw(true); await screen.findByRole("alert");
    state.error = null; state.rows = [ticket]; fireEvent.click(screen.getByRole("button", {name: "Riprova"}));
    await waitFor(() => expect(screen.getByText("1 assistenza aperta")).toBeInTheDocument());
  });
});
