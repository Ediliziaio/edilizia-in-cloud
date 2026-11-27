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
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1", name: "Impresa" } }) }));
vi.mock("@/components/orders/CercaVoceRendiconto", () => ({
  CercaVoceRendiconto: ({ onScegliGenerale }: { onScegliGenerale: (v: unknown) => void }) => (
    <button type="button" onClick={() => onScegliGenerale({ tariffa_id: "t1", codice: null, descrizione: "Posa pavimento", unita: "mq", prezzo: 20, fonte: "committente" })}>scegli-voce</button>
  ),
}));
vi.mock("@/components/orders/CercaNelListino", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/orders/CercaNelListino")>()),
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
  note: null as string | null, rapportino_id: null as string | null, righe: 4, totale: 1250.5, senza_prezzo: 0, sal_id: null as string | null, rapportini: 0, rapportini_nuovi: 0, rapportini_ritirati: 0, ...o,
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
  m.rpc.mockImplementation(async (f: string) => ({
    data: f === "rendiconto_giornaliero_del_giorno" ? { id: "g1", numero: 3, stato: "bozza", aggiunti: 0, rapportini: 0, nuovi: 0 } : "g1",
    error: null,
  }));
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
    data: f === "rendiconti_giornalieri_da_rapportini" ? { prova: a.p_prova, giorni: 4, da_creare: 3, da_aggiornare: 1, gia_fatti: 1, errori: [], creati: a.p_prova ? [] : ["x", "y", "z"] } : null,
    error: null,
  }));
  draw();
  fireEvent.click(await screen.findByRole("button", { name: /Crea dai rapportini/ }));
  expect(await screen.findByText("Creo 3 rendiconti, uno per giorno; aggiorno 1 bozze.")).toBeVisible();
  expect(screen.getByText("Giorni con rapportini: 4")).toBeVisible();
  expect(screen.getByText("Già fatti: 1")).toBeVisible();
  expect(m.rpc).toHaveBeenCalledWith("rendiconti_giornalieri_da_rapportini", { p_order_id: "o", p_dal: null, p_al: null, p_prova: true });
  fireEvent.click(screen.getByRole("button", { name: "Crea" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconti_giornalieri_da_rapportini", { p_order_id: "o", p_dal: null, p_al: null, p_prova: false }));
});

async function nuovoConVoce() {
  draw();
  fireEvent.click(await screen.findByRole("button", { name: /Nuovo rendiconto del giorno/ }));
  fireEvent.change(await screen.findByLabelText("Giorno"), { target: { value: "2026-11-20" } });
  fireEvent.click(screen.getByRole("button", { name: "Apri" }));
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
  // Il rendiconto del giorno esiste già (lo ha aperto «del giorno»): si aggiorna, non se ne crea un altro.
  expect(p.id).toBe("g1");
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

it("«Nuovo rendiconto del giorno» chiede il giorno e dice quanti rapportini ha preso", async () => {
  m.rpc.mockImplementation(async (f: string) => ({
    data: f === "rendiconto_giornaliero_del_giorno" ? { id: "g1", numero: 3, stato: "bozza", aggiunti: 7, rapportini: 2, nuovi: 0 } : "g1", error: null,
  }));
  const { toast } = await import("sonner");
  draw();
  fireEvent.click(await screen.findByRole("button", { name: /Nuovo rendiconto del giorno/ }));
  fireEvent.change(await screen.findByLabelText("Giorno"), { target: { value: "2026-11-18" } });
  fireEvent.click(screen.getByRole("button", { name: "Apri" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconto_giornaliero_del_giorno", { p_order_id: "o", p_data: "2026-11-18" }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Prese le voci di 2 rapportini"));
  expect(await screen.findByLabelText("Lavori del giorno")).toBeVisible();
});

it("l'elenco dice da quanti rapportini nasce ogni rendiconto e quanti sono nuovi", async () => {
  m.tabelle.v_rendiconti_giornalieri = [testata({ rapportini: 3, rapportini_nuovi: 1, rapportini_ritirati: 0 })];
  draw();
  expect(await screen.findByText("da 3 rapportini")).toBeVisible();
  expect(screen.getByText("1 rapportino nuovo")).toBeVisible();
});

it("in bozza con rapportini nuovi, il pulsante li aggiunge richiamando «del giorno»", async () => {
  m.tabelle.v_rendiconti_giornalieri = [testata({ rapportini: 1, rapportini_nuovi: 2, rapportini_ritirati: 0 })];
  draw();
  fireEvent.click(await screen.findByText(/Massetto piano terra/));
  fireEvent.click(await screen.findByRole("button", { name: /Aggiungi le voci dei rapportini nuovi/ }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconto_giornaliero_del_giorno", { p_order_id: "o", p_data: "2026-11-20" }));
  expect(m.rpc.mock.calls.map((c) => c[0])).toContain("rendiconto_giornaliero_salva");
});

it("confermato con rapportini nuovi: l'avviso chiede di riaprirlo, senza pulsante di aggiunta", async () => {
  m.tabelle.v_rendiconti_giornalieri = [testata({ stato: "confermato", rapportini: 1, rapportini_nuovi: 1, rapportini_ritirati: 0 })];
  draw();
  fireEvent.click(await screen.findByText(/Massetto piano terra/));
  expect(await screen.findByText(/riapri il rendiconto per aggiungerne le voci/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /Aggiungi le voci dei rapportini nuovi/ })).not.toBeInTheDocument();
});
