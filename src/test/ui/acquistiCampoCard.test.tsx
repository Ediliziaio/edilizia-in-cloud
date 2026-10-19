import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AcquistiCampoCard } from "@/components/warehouse/AcquistiCampoCard";

const state = vi.hoisted(() => ({
  acquisti: [] as Record<string, unknown>[],
  oda: [] as Record<string, unknown>[],
  rpc: vi.fn(), rpcError: null as unknown, error: vi.fn(), success: vi.fn(), signed: vi.fn(),
  elencoError: null as unknown, odaError: null as unknown, risposta: { ok: true, messaggio: "Registrato come costo del cantiere." } as unknown,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const result = () => ({ data: table === "campo_acquisti" ? state.acquisti : state.oda, error: table === "campo_acquisti" ? state.elencoError : state.odaError });
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or", "order", "in"]) q[m] = () => q;
    q.then = (yes: (r: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve(result()).then(yes, no);
    return q;
  },
  rpc: async (fn: string, args: unknown) => { state.rpc(fn, args); return { data: state.risposta, error: state.rpcError }; },
  storage: { from: () => ({ createSignedUrl: async (path: string) => { state.signed(path); return { data: { signedUrl: "https://signed.local/doc" }, error: null as null }; } }) },
} }));

const acquisto = (over: Record<string, unknown> = {}) => ({
  id: "a1", created_at: "2026-10-04T08:00:00Z", order_id: "o1", modalita: "pagato_da_me", fornitore: "Tecnomat S.p.A.", numero_documento: "123/45",
  totale: 45.5, righe: [{ descrizione: "Silicone neutro", quantita: 2, unita: "pz" }], foto_path: "company/o1/acquisti/f.jpg", purchase_order_id: null as string | null,
  stato: "da_verificare", rimborso_stato: "da_rimborsare", note: null as string | null,
  operaio: { first_name: "Marco", last_name: "Verdi" }, order: { order_code: "ORD-1" }, ...over,
});
const mostra = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AcquistiCampoCard /></QueryClientProvider>);

beforeEach(() => {
  vi.clearAllMocks(); state.acquisti = [acquisto()]; state.oda = []; state.rpcError = null;
  state.elencoError = null; state.odaError = null; state.risposta = { ok: true, messaggio: "Registrato come costo del cantiere." };
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(cleanup);

describe("Merce presa in negozio (ufficio)", () => {
  it("senza niente da verificare non compare", async () => {
    state.acquisti = [];
    const { container } = mostra();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("mostra chi, dove, quanto e cosa ha preso", async () => {
    mostra();
    expect(await screen.findByText(/Tecnomat S.p.A. · n. 123\/45/)).toBeInTheDocument();
    expect(screen.getByText("Marco Verdi")).toBeInTheDocument();
    expect(screen.getByText("ORD-1")).toBeInTheDocument();
    expect(screen.getByText("L’ho pagata io")).toBeInTheDocument();
    expect(screen.getByText("Silicone neutro")).toBeInTheDocument();
  });

  it("mostra chi l'ha mandata su WhatsApp anche senza account nell'app", async () => {
    state.acquisti = [acquisto({ operaio: null, dipendente: { first_name: "Mario", last_name: "Bianchi" }, fonte: "whatsapp" })];
    mostra();
    expect(await screen.findByText("Mario Bianchi · da WhatsApp")).toBeInTheDocument();
  });

  it("legge l'operaio dal collegamento giusto: la tabella ha due collegamenti ai profili", () => {
    // Senza il nome del collegamento PostgREST risponde 300 (scelta ambigua) e la scheda resta vuota.
    const codice = readFileSync(resolve(process.cwd(), "src/components/warehouse/AcquistiCampoCard.tsx"), "utf8");
    expect(codice).toContain("operaio:profiles!campo_acquisti_user_id_fkey(");
    expect(codice).not.toMatch(/operaio:profiles\(/);
  });

  it("registra con il totale corretto dall'ufficio", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    expect(screen.getByText(/rimborso all’operaio nello scadenzario/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Totale da registrare/), { target: { value: "44,90" } });
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_acquisto_verifica", { p_id: "a1", p_azione: "registra", p_totale: 44.9, p_purchase_order_id: null, p_motivo: null }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Registrata", { description: "Registrato come costo del cantiere." }));
  });

  it("rifiuta col motivo, che l'operaio leggerà", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    fireEvent.click(screen.getByRole("button", { name: "Rifiuta" }));
    fireEvent.change(screen.getByLabelText("Motivo del rifiuto"), { target: { value: "Scontrino illeggibile" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Rifiuta" }).at(-1)!);
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_acquisto_verifica", expect.objectContaining({ p_azione: "rifiuta", p_motivo: "Scontrino illeggibile" })));
  });

  it("per un ritiro d'ordine collega l'ordine d'acquisto e NON chiede il totale: il costo è già nell'ordine", async () => {
    state.acquisti = [acquisto({ modalita: "ritiro_ordine", rimborso_stato: "non_dovuto", purchase_order_id: "po1" })];
    state.oda = [{ id: "po1", oda_number: "ODA-7", status: "inviato", suppliers: { name: "Tecnomat" } }];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    expect(await screen.findByText(/non si crea un costo nuovo/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Totale da registrare/)).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Registra" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_acquisto_verifica", expect.objectContaining({ p_azione: "registra", p_totale: null, p_purchase_order_id: "po1" })));
  });

  it("per un ritiro senza ordine collegato si registra come costo diretto, col totale", async () => {
    state.acquisti = [acquisto({ modalita: "ritiro_ordine", rimborso_stato: "non_dovuto" })];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    expect(screen.getByLabelText(/Totale da registrare/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Registra" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_acquisto_verifica", expect.objectContaining({ p_totale: 45.5, p_purchase_order_id: null })));
  });

  it("chi ha pagato di tasca compare tra i rimborsi da fare, con un tocco li segna fatti", async () => {
    state.acquisti = [acquisto({ stato: "registrato", rimborso_stato: "da_rimborsare" })];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Segna rimborsato/ }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_acquisto_verifica", expect.objectContaining({ p_id: "a1", p_azione: "rimborsato" })));
  });

  it("mostra il documento nell'app con un indirizzo temporaneo, senza popup bloccati dal telefono", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Vedi il documento/ }));
    expect(await screen.findByAltText("Bolla o ricevuta allegata")).toHaveAttribute("src", "https://signed.local/doc");
    expect(screen.getByRole("link", { name: "Apri documento a dimensione intera" })).toHaveAttribute("href", "https://signed.local/doc");
    expect(window.open).not.toHaveBeenCalled();
    expect(state.signed).toHaveBeenCalledWith("company/o1/acquisti/f.jpg");
  });

  it("un errore nel caricare la merce non viene presentato come elenco vuoto", async () => {
    state.acquisti = []; state.elencoError = new Error("Offline"); mostra();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare la merce da verificare");
  });

  it("se non legge gli ordini blocca la registrazione, senza creare un costo diretto al loro posto", async () => {
    state.acquisti = [acquisto({ modalita: "ritiro_ordine", rimborso_stato: "non_dovuto" })];
    state.odaError = new Error("Offline"); mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a leggere gli ordini");
    expect(screen.getByRole("button", { name: "Registra" })).toBeDisabled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("non offre lo scollegamento fittizio di un ordine già proposto dal server", async () => {
    state.acquisti = [acquisto({ modalita: "ritiro_ordine", purchase_order_id: "po1" })]; mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    expect(screen.queryByRole("option", { name: "Nessuno: registra come costo diretto" })).toBeNull();
  });

  it("una risposta senza conferma esplicita non mostra 'Registrata'", async () => {
    state.risposta = null; mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Operazione non riuscita", expect.objectContaining({ description: expect.stringContaining("non è stata confermata") })));
    expect(state.success).not.toHaveBeenCalled();
  });

  it.each(["abc", "0", "-5", "1000001"])("blocca un importo non valido (%s) invece di registrare il totale precedente", async value => {
    mostra(); fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    fireEvent.change(screen.getByLabelText(/Totale da registrare/), { target: { value } });
    expect(screen.getByRole("button", { name: "Registra" })).toBeDisabled();
  });

  it("mostra la frase del database se l'operazione non è possibile, non il testo tecnico", async () => {
    state.rpcError = { code: "P0001", message: "Questo acquisto è già stato verificato." };
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Operazione non riuscita", { description: "Questo acquisto è già stato verificato." }));
  });

  it("nel menu degli ordini lo stato si legge con la sua etichetta («Confermato»)", async () => {
    state.acquisti = [acquisto({ modalita: "ritiro_ordine", rimborso_stato: "non_dovuto" })];
    state.oda = [{ id: "po1", oda_number: "ODA-7", status: "confermato", suppliers: { name: "Tecnomat" } }];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Verifica" }));
    expect(await screen.findByRole("option", { name: "ODA-7 · Tecnomat · Confermato" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /· confermato$/ })).toBeNull();
  });
});
