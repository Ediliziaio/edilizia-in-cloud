import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { RendicontiGiornalieri } from "@/components/orders/RendicontiGiornalieri";

const m = vi.hoisted(() => ({
  importi: true, modifica: true,
  tabelle: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewOrderAmounts: m.importi, canEditOrders: m.modifica }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({ useOrderWorkPhases: () => ({ employees: [{ id: "e1", label: "Mario Rossi" }] }) }));
vi.mock("@/components/orders/PulsantePdfRendiconto", () => ({ PulsantePdfRendiconto: () => <button type="button">PDF</button> }));
vi.mock("@/hooks/useMezzi", () => ({ useMezzi: () => ({ data: [] as unknown[] }) }));
vi.mock("@/components/orders/CercaNelListino", () => ({
  CercaNelListino: ({ onScegli }: { onScegli: (v: unknown) => void }) => (
    <button type="button" onClick={() => onScegli({ tariffa_id: "t1", codice: null, descrizione: "Posa pavimento", unita: "mq", prezzo: 20, fonte: "committente" })}>scegli-voce</button>
  ),
}));
vi.mock("@/integrations/supabase/client", () => {
  const from = (t: string) => {
    const b: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order"]) b[k] = () => b;
    b.maybeSingle = async () => ({ data: { tariffa_manodopera_id: "tar-man" }, error: null as unknown });
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: m.tabelle[t] ?? [], error: null }).then(res);
    return b;
  };
  return { supabase: { from, rpc: (f: string, a: object) => m.rpc(f, a) } };
});

const testata = (o: Record<string, unknown> = {}) => ({
  id: "g1", order_id: "o", data: "2026-11-20", numero: 3, stato: "bozza", descrizione_lavori: "Massetto piano terra",
  note: null as string | null, rapportino_id: null as string | null, righe: 4, totale: 1250.5, senza_prezzo: 0, sal_id: null as string | null, ...o,
});

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});
beforeEach(() => {
  m.importi = true; m.modifica = true; m.tabelle = { v_rendiconti_giornalieri: [testata()], appalto_rendiconto_righe: [] };
  m.rpc.mockReset();
  m.rpc.mockResolvedValue({ data: "g1", error: null });
});
afterEach(cleanup);

const draw = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RendicontiGiornalieri orderId="o" />
  </QueryClientProvider>,
);

it("elenca i rendiconti con totale, stato e avvisi", async () => {
  m.tabelle.v_rendiconti_giornalieri = [
    testata(),
    testata({ id: "g2", numero: 4, stato: "confermato", senza_prezzo: 2, sal_id: "s1", descrizione_lavori: "Intonaco" }),
  ];
  draw();
  expect(await screen.findByText(/Massetto piano terra/)).toBeVisible();
  expect(screen.getByText("n. 4")).toBeVisible();
  expect(screen.getByText("2 senza prezzo")).toBeVisible();
  expect(screen.getByText("nel rendiconto del periodo")).toBeVisible();
  expect(screen.getByText("Confermato")).toBeVisible();
});

it("senza il permesso sugli importi spiega perché non mostra l'elenco", () => {
  m.importi = false;
  draw();
  expect(screen.getByText(/serve il permesso «Venduto e importi»/)).toBeVisible();
  expect(screen.queryByText("Nuovo rendiconto del giorno")).not.toBeInTheDocument();
});

it("«Crea dai rapportini» prima prova e mostra i conteggi, poi crea", async () => {
  m.rpc.mockImplementation(async (f: string, a: { p_prova?: boolean }) => ({
    data: f === "rendiconti_giornalieri_da_rapportini" ? { prova: a.p_prova, da_creare: 3, gia_fatti: 1, gia_nel_rendiconto: 2, creati: a.p_prova ? [] : ["x", "y", "z"] } : null,
    error: null,
  }));
  draw();
  fireEvent.click(await screen.findByRole("button", { name: /Crea dai rapportini/ }));
  expect(await screen.findByText("Da creare: 3")).toBeVisible();
  expect(screen.getByText("Già fatti: 1")).toBeVisible();
  expect(m.rpc).toHaveBeenCalledWith("rendiconti_giornalieri_da_rapportini", { p_order_id: "o", p_dal: null, p_al: null, p_prova: true });
  fireEvent.click(screen.getByRole("button", { name: "Crea" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconti_giornalieri_da_rapportini", { p_order_id: "o", p_dal: null, p_al: null, p_prova: false }));
});

async function nuovoConVoce() {
  draw();
  fireEvent.click(await screen.findByRole("button", { name: /Nuovo rendiconto del giorno/ }));
  fireEvent.change(await screen.findByLabelText("Lavori del giorno"), { target: { value: "Posa" } });
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi Altre voci" }));
  fireEvent.click(screen.getByRole("button", { name: "scegli-voce" }));
}

it("salva mandando il payload giusto: col listino il prezzo lo calcola il database", async () => {
  await nuovoConVoce();
  fireEvent.change(screen.getByLabelText("Quantità"), { target: { value: "2,5" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconto_giornaliero_salva", expect.anything()));
  const p = (m.rpc.mock.calls.find((c) => c[0] === "rendiconto_giornaliero_salva")![1] as { p: Record<string, unknown> }).p;
  expect(p).toMatchObject({ order_id: "o", descrizione_lavori: "Posa" });
  expect(p.id).toBeUndefined();
  expect(p.righe).toEqual([{ categoria: "voce", descrizione: "Posa pavimento", unita: "mq", quantita: 2.5, prezzo_a_mano: false, listino_voce_id: "t1" }]);
});

it("un prezzo modificato diventa prezzo a mano", async () => {
  await nuovoConVoce();
  fireEvent.change(screen.getByLabelText("Prezzo"), { target: { value: "55,5" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconto_giornaliero_salva", expect.anything()));
  const p = (m.rpc.mock.calls.find((c) => c[0] === "rendiconto_giornaliero_salva")![1] as { p: { righe: Array<Record<string, unknown>> } }).p;
  expect(p.righe[0]).toMatchObject({ prezzo_unitario: 55.5, prezzo_a_mano: true, listino_voce_id: "t1" });
});
