import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PlanimetrieDialog from "@/components/orders/materiali/PlanimetrieDialog";
const state = vi.hoisted(() => ({ estrai: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), immagine: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "utente" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true }) }));
vi.mock("@/components/orders/materiali/DisegnoCadPannello", () => ({ default: () => null }));
vi.mock("@/lib/distinta/tavolePdf", () => ({ estraiTestoTavola: state.estrai, immaginePaginaTavola: state.immagine, disegnaRiquadri: vi.fn(), sommaRiquadri: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc, functions: { invoke: state.invoke }, storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => new TextEncoder().encode("PDF sintetico di test").buffer }, error: null }) }) }, from: (table: string) => {
  const q = { select: () => q, eq: () => q, ilike: () => q, or: () => q, order: () => q,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ error: null, data: table === "order_attachments" ? [{ id: "doc", file_name: "Pianta sintetica.pdf", file_url: "ordine/pianta.pdf" }] : [] })) }; return q;
} } }));
const testo = JSON.parse(readFileSync("src/test/fixtures/tavole/tavola_sintetica_fm_testo.json", "utf8")) as { s: string; x: number; y: number; h: number; p: number }[];
const testi = [1, 2].flatMap(pagina => testo.filter(t => t.s !== "__PAGE__").map(t => ({ ...t, pagina })));
const pdf = { testi, pagine: [{ numero: 1, larghezza: 1000, altezza: 1000 }, { numero: 2, larghezza: 1000, altezza: 1000 }] };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("crypto", webcrypto); state.estrai.mockResolvedValue(pdf); state.rpc.mockResolvedValue({ error: null }); state.immagine.mockResolvedValue("data:image/jpeg;base64,dGVzdA==");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mostra = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlanimetrieDialog orderId="ordine" open onOpenChange={() => {}} /></QueryClientProvider>);
it("legge e salva una pagina alla volta con impronta, senza sommare due tavole identiche", async () => {
  mostra(); await waitFor(() => expect(screen.getByRole("button", { name: "Conta le sigle" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Conta le sigle" })); await screen.findByRole("checkbox", { name: "Salva PA" });
  fireEvent.click(screen.getByRole("button", { name: "Salva le sigle scelte" })); await waitFor(() => expect(state.rpc).toHaveBeenCalled());
  const args = state.rpc.mock.calls[0][1]; expect(state.rpc.mock.calls[0][0]).toBe("planimetrie_salva_conteggi"); expect(args.p_sha256).toMatch(/^[a-f\d]{64}$/);
  expect(args.p_righe.every((r: { pagina: number }) => r.pagina === 1)).toBe(true);
  expect(args.p_righe.filter((r: { simbolo: string }) => r.simbolo === "PA").reduce((sum: number, r: { quantita: number }) => sum + r.quantita, 0)).toBe(23);
  fireEvent.change(screen.getByRole("combobox", { name: "Pagina della tavola" }), { target: { value: "2" } });
  expect(screen.queryByRole("checkbox", { name: "Salva PA" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Conta le sigle" })); await screen.findByRole("checkbox", { name: "Salva PA" });
  fireEvent.click(screen.getByRole("button", { name: "Salva le sigle scelte" })); await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(2));
  expect(state.rpc.mock.calls[1][1].p_righe.every((r: { pagina: number }) => r.pagina === 2)).toBe(true);
});
it("annullare scarta i risultati tardivi senza salvare o avviare l’AI", async () => {
  let completa!: (r: typeof pdf) => void; state.estrai.mockImplementation(() => new Promise(resolve => { completa = resolve; }));
  mostra(); await waitFor(() => expect(screen.getByRole("button", { name: "Conta le sigle" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Conta le sigle" })); await screen.findByText("Leggo il testo della tavola…");
  fireEvent.click(screen.getByRole("button", { name: "Annulla lettura" }));
  await act(async () => { completa(pdf); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(screen.queryByRole("checkbox", { name: "Salva PA" })).not.toBeInTheDocument(); expect(state.rpc).not.toHaveBeenCalled(); expect(state.invoke).not.toHaveBeenCalled();
});
it("la legenda delle scansioni viene proposta dall’AI e rimane modificabile prima del conteggio", async () => {
  state.invoke.mockResolvedValue({ data: { legenda: ["PA — Punto alimentazione", "S1 — Serramento A"] }, error: null });
  mostra(); await waitFor(() => expect(screen.getByRole("button", { name: "Leggi legenda con AI" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Leggi legenda con AI" }));
  expect(await screen.findByRole("textbox", { name: "Legenda della tavola" })).toHaveValue("PA — Punto alimentazione\nS1 — Serramento A");
  expect(state.invoke).toHaveBeenCalledWith("planimetria-conta-simboli", expect.objectContaining({ body: expect.objectContaining({ azione: "legenda", company_id: "azienda" }) }));
  expect(state.rpc).not.toHaveBeenCalled();
});
