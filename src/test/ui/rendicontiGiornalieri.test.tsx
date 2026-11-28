import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { RendicontiGiornalieri } from "@/components/orders/RendicontiGiornalieri";

const m = vi.hoisted(() => ({
  importi: true, modifica: true,
  tabelle: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
  predefinite: {} as Record<string, unknown>,
  tabelleLette: [] as string[],
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
    for (const k of ["eq", "in", "order"]) b[k] = () => b;
    b.select = (c: string) => { m.tabelleLette.push(`${t}:${c}`); return b; };
    b.maybeSingle = async () => ({ data: { tariffa_manodopera_id: "tar-man" }, error: null as unknown });
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: m.tabelle[t] ?? [], error: null }).then(res);
    return b;
  };
  return { supabase: { from, rpc: (f: string, a: object) => m.rpc(f, a) } };
});

const testata = (o: Record<string, unknown> = {}) => ({
  id: "g1", order_id: "o", data: "2026-11-20", numero: 3, stato: "bozza", descrizione_lavori: "Massetto piano terra",
  note: null as string | null, rapportino_id: null as string | null, righe: 4, totale: 1250.5, senza_prezzo: 0, sal_id: null as string | null, rapportini: 0, rapportini_nuovi: 0, rapportini_ritirati: 0,
  n_manodopera: 4, n_mezzi: 0, n_trasporti: 0, n_materiali: 0, n_voci: 0, ...o,
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
  m.rpc.mockReset(); m.tabelleLette = []; m.predefinite = {};
  m.rpc.mockImplementation(async (f: string) => ({
    data: f === "rendiconto_voci_predefinite" ? m.predefinite : f === "rendiconto_giornaliero_del_giorno" ? { id: "g1", numero: 3, stato: "bozza", aggiunti: 0, rapportini: 0, nuovi: 0 } : "g1",
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
  const riga = screen.getByText("Intonaco").closest("tr")!;
  expect(within(riga).getByText("4")).toBeVisible();
  expect(within(riga).getByText("2 senza prezzo")).toBeVisible();
  expect(within(riga).getByText("nel periodo")).toBeVisible();
  expect(within(riga).getByText("Confermato")).toBeVisible();
});

it("senza descrizione dice cosa contiene, senza leggere le righe di ogni rendiconto", async () => {
  m.tabelle.v_rendiconti_giornalieri = [
    testata({ id: "g1", descrizione_lavori: null, righe: 3, n_manodopera: 2, n_mezzi: 1 }),
    testata({ id: "g2", numero: 4, descrizione_lavori: "", righe: 0, n_manodopera: 0 }),
  ];
  draw();
  expect((await screen.findAllByText("2 persone · 1 mezzo"))[0]).toBeVisible();
  expect(screen.getAllByText("Vuoto")[0]).toBeVisible();
  expect(screen.queryByText("Senza descrizione")).not.toBeInTheDocument();
  // I conteggi stanno nella vista: l'elenco non apre la tabella delle righe.
  expect(m.tabelleLette.filter((x) => x.startsWith("appalto_rendiconto_righe"))).toEqual([]);
});

it("senza il permesso sugli importi spiega perché non mostra l'elenco", () => {
  m.importi = false;
  draw();
  expect(screen.getByText(/serve il permesso «Venduto e importi»/)).toBeVisible();
  expect(screen.queryByText("Rendiconto lavori")).not.toBeInTheDocument();
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
  fireEvent.click(await screen.findByRole("button", { name: /Rendiconto lavori/ }));
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
  fireEvent.click(await screen.findByRole("button", { name: /Rendiconto lavori/ }));
  fireEvent.change(await screen.findByLabelText("Giorno"), { target: { value: "2026-11-18" } });
  fireEvent.click(screen.getByRole("button", { name: "Apri" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconto_giornaliero_del_giorno", { p_order_id: "o", p_data: "2026-11-18" }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Prese le voci di 2 rapportini"));
  expect(await screen.findByLabelText("Lavori del giorno")).toBeVisible();
});

it("l'elenco dice da quanti rapportini nasce ogni rendiconto e quanti sono nuovi", async () => {
  m.tabelle.v_rendiconti_giornalieri = [testata({ rapportini: 3, rapportini_nuovi: 1, rapportini_ritirati: 0 })];
  draw();
  expect(await screen.findByText("da 3 rapp.")).toBeVisible();
  expect(screen.getByText("1 nuovo")).toBeVisible();
});

it("in bozza con rapportini nuovi, il pulsante li aggiunge richiamando «del giorno»", async () => {
  m.tabelle.v_rendiconti_giornalieri = [testata({ rapportini: 1, rapportini_nuovi: 2, rapportini_ritirati: 0 })];
  draw();
  fireEvent.click(await screen.findByText(/Massetto piano terra/));
  fireEvent.click(await screen.findByRole("button", { name: /Aggiungi le voci dei rapportini nuovi/ }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconto_giornaliero_del_giorno", { p_order_id: "o", p_data: "2026-11-20" }));
  expect(m.rpc.mock.calls.map((c) => c[0])).toContain("rendiconto_giornaliero_salva");
});

it("confermato: si corregge lì, e i rapportini nuovi si aggiungono senza riaprirlo", async () => {
  m.tabelle.v_rendiconti_giornalieri = [testata({ stato: "confermato", rapportini: 1, rapportini_nuovi: 1, rapportini_ritirati: 0 })];
  draw();
  fireEvent.click(await screen.findByText(/Massetto piano terra/));
  expect(await screen.findByText(/quello che salvi resta confermato/)).toBeVisible();
  expect(screen.getByRole("button", { name: /Aggiungi le voci dei rapportini nuovi/ })).toBeVisible();
  // Confermato non si riconferma: resta il «Salva», e il ritorno in bozza è un comando a parte.
  expect(screen.getByRole("button", { name: "Salva" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Conferma" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Riporta in bozza" })).toBeVisible();
});

it("«Rendiconto trasporti» parte con un viaggio da compilare", async () => {
  m.tabelle.v_rendiconti_giornalieri = [testata({ righe: 0, n_manodopera: 0, descrizione_lavori: null })];
  draw();
  fireEvent.click(await screen.findByRole("button", { name: /Rendiconto trasporti/ }));
  fireEvent.change(await screen.findByLabelText("Giorno"), { target: { value: "2026-11-20" } });
  fireEvent.click(screen.getByRole("button", { name: "Apri" }));
  expect(await screen.findByLabelText("Carico")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Carico"), { target: { value: "Cava Rossi" } });
  fireEvent.change(screen.getByLabelText("Scarico"), { target: { value: "Cantiere Po" } });
  fireEvent.change(screen.getByLabelText("Km"), { target: { value: "42" } });
  fireEvent.change(screen.getByLabelText("Prezzo"), { target: { value: "80" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconto_giornaliero_salva", expect.anything()));
  const p = (m.rpc.mock.calls.find((c) => c[0] === "rendiconto_giornaliero_salva")![1] as { p: { righe: Array<Record<string, unknown>> } }).p;
  expect(p.righe[0]).toMatchObject({ categoria: "trasporto", unita: "viaggio", quantita: 1, prezzo_unitario: 80,
    viaggio: { carico: "Cava Rossi", scarico: "Cantiere Po", km: "42" } });
});

it("una persona aggiunta con la voce a giornata: 8 ore diventano 1 giornata, col prezzo e la nota", async () => {
  m.predefinite = { data: "2026-11-20", manodopera: { listino_voce_id: "tar-giorn", unita: "giornata", prezzo: 248, fonte: "committente" } };
  draw();
  fireEvent.click(await screen.findByRole("button", { name: /Rendiconto lavori/ }));
  fireEvent.change(await screen.findByLabelText("Giorno"), { target: { value: "2026-11-20" } });
  fireEvent.click(screen.getByRole("button", { name: "Apri" }));
  await screen.findByLabelText("Lavori del giorno");
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconto_voci_predefinite", { p_order_id: "o", p_data: "2026-11-20" }));
  await new Promise((r) => setTimeout(r, 30));
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Aggiungi persona" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Mario Rossi" }));
  expect(await screen.findByText("Nel listino è a giornata: 8 h = 1")).toBeVisible();
  expect(screen.getByLabelText("Quantità")).toHaveValue("1");
  expect(screen.getByLabelText("Prezzo")).toHaveValue("248");
  expect(screen.queryByText("prezzo da definire")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Salva" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rendiconto_giornaliero_salva", expect.anything()));
  const p = (m.rpc.mock.calls.find((c) => c[0] === "rendiconto_giornaliero_salva")![1] as { p: { righe: Array<Record<string, unknown>> } }).p;
  expect(p.righe[0]).toMatchObject({ unita: "giornata", quantita: 1, listino_voce_id: "tar-giorn", employee_id: "e1" });
});

it("l'editor non chiede più tariffa_manodopera_id a orders", async () => {
  draw();
  fireEvent.click(await screen.findByRole("button", { name: /Rendiconto lavori/ }));
  fireEvent.change(await screen.findByLabelText("Giorno"), { target: { value: "2026-11-20" } });
  fireEvent.click(screen.getByRole("button", { name: "Apri" }));
  await screen.findByLabelText("Lavori del giorno");
  // Il nome del committente legge altre colonne di orders: quella delle ore non si chiede più (orders_visibili non la ha).
  expect(m.tabelleLette.filter((x) => x.startsWith("orders") && x.includes("tariffa_manodopera_id"))).toEqual([]);
});

/**
 * Il mezzo senza voce di listino (28/11/2026): il rendiconto lo dice e offre il collegamento, che
 * si fa una volta sul mezzo. Visto su Impresa Vulcano, dove 26 mezzi su 38 non hanno una voce e il
 * rendiconto usciva con «prezzo mancante» senza spiegare perché.
 */
it("una riga mezzo senza prezzo offre di collegare il mezzo al listino", async () => {
  m.tabelle.appalto_rendiconto_righe = [{
    id: "r1", categoria: "mezzo", descrizione: "MAN CAMION 3 ASSI · HE749NF", unita_misura: "ora",
    quantita: 9, prezzo_unitario: 0, prezzo_a_mano: false, prezzo_fonte: "mancante",
    listino_voce_id: null, tariffa_id: null, employee_id: null, subappaltatore_id: null,
    mezzo_id: "mz1", fase_id: null, da_rapportino_id: null, maggiorazione_pct: 0, note: null,
    viaggio: null, ordine: 1, voce_computo_id: null, extra_contratto: false,
  }];
  m.rpc.mockImplementation(async (f: string) => ({
    data: f === "mezzo_voci_suggerite"
      ? [{ listino_voce_id: "t9", appalto_tariffa_id: null, descrizione: "Camion 3 assi - a freddo",
           unita: "h", prezzo: 35, fonte: "generale", somiglianza: 0.54 }]
      : f === "rendiconto_voci_predefinite" ? {} : "g1",
    error: null,
  }));
  draw();
  fireEvent.click(await screen.findByText(/Massetto piano terra/));
  const collega = await screen.findByRole("button", { name: /questo mezzo non ha una voce di listino/i });
  fireEvent.click(collega);
  expect(await screen.findByLabelText("Voce di listino per questo mezzo")).toBeTruthy();
});
