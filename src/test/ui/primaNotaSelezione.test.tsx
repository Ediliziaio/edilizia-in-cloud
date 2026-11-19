import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PrimaNotaEntry } from "@/hooks/usePrimaNota";

const state = vi.hoisted(() => ({ admin: true, mobile: false, righe: null as PrimaNotaEntry[] | null, singola: vi.fn(), elimina: vi.fn(), conferma: vi.fn(), entry: null as unknown }));
const base = { company_id: "demo", direction: "entrata", amount: 100, entry_date: "2026-11-19", created_at: "2026-11-19", category: "altro", is_auto: false, notes: null, attachment_url: null, attachment_name: null, cost_id: null, documento_fiscale_id: null, bank_transaction_id: null } as PrimaNotaEntry;
const righe = [
  { ...base, id: "manuale", description: "Incasso manuale" },
  { ...base, id: "automatica", description: "Da fattura", is_auto: true },
  { ...base, id: "banca", description: "Bonifico abbinato", bank_transaction_id: "b1" },
];
vi.mock("@/hooks/usePrimaNota", async (importa) => ({
  ...await importa<typeof import("@/hooks/usePrimaNota")>(),
  usePrimaNota: () => ({ entries: state.righe ?? righe, isLoading: false, totalCount: (state.righe ?? righe).length, totalPages: 1, saldo: { entrate: 300, uscite: 0, saldo: 300 }, isSaldoLoading: false, monthlyChart: {},
    create: { isPending: false }, remove: { isPending: false, mutate: state.singola }, removeMany: { isPending: false, mutateAsync: state.elimina }, update: { isPending: false }, updateNotes: vi.fn(), fetchAllForExport: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: state.admin }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: null as null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => state.conferma }));
vi.mock("@/components/contabilita/DaVerificareCard", () => ({ DaVerificareCard: (): null => null }));
vi.mock("@/components/charts/grafici/GraficoEntrateUscite", () => ({ GraficoEntrateUscite: (): null => null }));
vi.mock("@/components/prima-nota/NewEntryDialog", () => ({ default: (p: { entry?: unknown }): null => { state.entry = p.entry; return null; } }));

import PrimaNota from "@/pages/azienda/PrimaNota";
beforeEach(() => {
  state.admin = true; state.mobile = false; state.entry = null; state.righe = null; state.singola.mockReset();
  state.conferma.mockReset().mockResolvedValue(true);
  state.elimina.mockReset().mockImplementation(async (rows: PrimaNotaEntry[]) => ({ completate: rows, errori: [], fic: false }));
});
afterEach(cleanup);
function Percorso() { const p = useLocation(); return <span data-testid="percorso">{p.pathname}{p.search}</span>; }
function apri() { render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><PrimaNota /><Percorso /></QueryClientProvider></MemoryRouter>); }

it("elimina solo le righe consentite di una selezione mista e conferma gli importi", async () => {
  apri();
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona i movimenti di questa pagina" }));
  expect(screen.getByText("3 selezionate · 1 elaborabili")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Elimina selezionate" }));
  await waitFor(() => expect(state.elimina).toHaveBeenCalledWith([expect.objectContaining({ id: "manuale" })]));
  expect(state.conferma.mock.calls[0][0].description).toContain("2 righe collegate");
  expect(state.conferma.mock.calls[0][0].description).toContain("100");
});
it("apre la modifica con la registrazione corretta", () => {
  apri();
  fireEvent.click(screen.getByRole("button", { name: "Modifica Incasso manuale" }));
  expect(state.entry).toMatchObject({ id: "manuale", amount: 100 });
});
it("nasconde la cancellazione a chi non è amministratore", () => {
  state.admin = false; apri();
  expect(screen.queryByRole("button", { name: "Elimina selezionate" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Elimina movimento di prima nota" })).toBeNull();
});
it("apre il movimento bancario di origine anche dal comando mobile", () => {
  apri();
  fireEvent.click(screen.getByRole("button", { name: "Apri origine di Bonifico abbinato" }));
  expect(screen.getByTestId("percorso")).toHaveTextContent("/azienda/tesoreria?tab=transazioni&movimento=b1");
});
const costo = { ...base, id: "pagamento", direction: "uscita", description: "Pagamento costo errato", cost_id: "c1", is_auto: true, auto_source: "company_cost_payment" } as PrimaNotaEntry;
it("permette di eliminare il singolo pagamento automatico del costo", async () => {
  state.righe = [costo]; apri();
  fireEvent.click(screen.getByRole("button", { name: "Elimina movimento di prima nota" }));
  await waitFor(() => expect(state.singola).toHaveBeenCalledWith("pagamento", expect.any(Object)));
  expect(state.conferma.mock.calls[0][0].description).toContain("pagamenti rimasti");
  expect(state.elimina).not.toHaveBeenCalled();
});
it("dal dettaglio mobile elimina uno storno spiegando l'effetto sul pagamento originale", async () => {
  state.mobile = true; state.righe = [{ ...costo, id: "storno", direction: "entrata", description: "Storno costo", auto_source: "storno_pagamento", reversal_of: "pagamento" }]; apri();
  fireEvent.click(screen.getByRole("button", { name: "Storno costo" }));
  fireEvent.click(screen.getByRole("button", { name: "Elimina registrazione" }));
  await waitFor(() => expect(state.singola).toHaveBeenCalledWith("storno", expect.any(Object)));
  expect(state.conferma.mock.calls[0][0].description).toContain("ripristina");
});
it("l'annullamento della conferma non elimina il pagamento del costo", async () => {
  state.conferma.mockResolvedValue(false); state.righe = [costo]; apri();
  fireEvent.click(screen.getByRole("button", { name: "Elimina movimento di prima nota" }));
  await waitFor(() => expect(state.conferma).toHaveBeenCalled());
  expect(state.singola).not.toHaveBeenCalled();
});
it("la selezione include i pagamenti dei costi e conserva l'esclusione dei collegamenti bancari", async () => {
  state.righe = [costo, righe[2]]; apri();
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona i movimenti di questa pagina" }));
  expect(screen.getByText("2 selezionate · 1 elaborabili")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Elimina selezionate" }));
  await waitFor(() => expect(state.elimina).toHaveBeenCalledWith([costo]));
});
