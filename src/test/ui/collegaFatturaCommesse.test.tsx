import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ righe: null as unknown, costo: null as unknown, rpc: vi.fn(), chiudi: vi.fn(), scelte: 0 }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (f: string, a: unknown) => { stato.rpc(f, a); return Promise.resolve({ data: {}, error: null }); },
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    Object.assign(q, { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: t === "fatture_ricevute" ? { righe: stato.righe } : stato.costo, error: null }) });
    return q;
  },
} }));
vi.mock("@/lib/orders/financialRefresh", () => ({ refreshFinancialQueries: vi.fn() }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({
  OrderSelectCombobox: ({ value, onChange, placeholder }: { value?: string; onChange: (id: string) => void; placeholder?: string }) => (
    <button type="button" aria-label={placeholder} onClick={() => onChange(`c${++stato.scelte}`)}>{value ?? "nessuna"}</button>
  ),
}));
import { CollegaFatturaCommesseDialog } from "@/components/fatturazione/CollegaFatturaCommesseDialog";

const fattura = { id: "f1", numero: "F1", fornitore: "Aluplast", imponibile: 1000, totale: 1220, companyCostId: "k1" };
const mostra = (extra = {}) => render(<QueryClientProvider client={new QueryClient()}><CollegaFatturaCommesseDialog companyId="co" onChiudi={stato.chiudi} fattura={{ ...fattura, ...extra }} /></QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); stato.righe = null; stato.costo = { order_id: null, allocations: [], quota_magazzino: null, quota_magazzino_righe: null }; stato.scelte = 0; });
afterEach(cleanup);

describe("Collegare una fattura alle commesse", () => {
  it("il caso normale: scegli la commessa e salvi, senza importi da scrivere", async () => {
    mostra();
    expect(await screen.findByText(/1\.220,00/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Cerca la commessa…" }));
    expect(screen.queryByLabelText("Importo della commessa 1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", { p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 1000 }], p_magazzino: 0, p_magazzino_righe: null }));
    await waitFor(() => expect(stato.chiudi).toHaveBeenCalled());
  });
  it("dividendo, gli importi hanno l'IVA e l'altra commessa prende il resto; si salva l'imponibile", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Cerca la commessa…" }));
    fireEvent.click(screen.getByRole("button", { name: "Dividi su un’altra commessa" }));
    expect(screen.getByLabelText("Importo della commessa 1")).toHaveValue("610");
    expect(screen.getByLabelText("Importo della commessa 2")).toHaveValue("610");
    fireEvent.click(screen.getAllByRole("button", { name: "Cerca la commessa…" })[1]);
    fireEvent.change(screen.getByLabelText("Importo della commessa 1"), { target: { value: "244" } });
    expect(screen.getByLabelText("Importo della commessa 2")).toHaveValue("976");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", { p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 200 }, { order_id: "c2", importo: 800 }], p_magazzino: 0, p_magazzino_righe: null }));
  });
  it("oltre il totale non si salva", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Cerca la commessa…" }));
    fireEvent.click(screen.getByRole("button", { name: "Dividi su un’altra commessa" }));
    fireEvent.click(screen.getByRole("button", { name: "Dividi su un’altra commessa" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Cerca la commessa…" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Cerca la commessa…" })[2]);
    fireEvent.change(screen.getByLabelText("Importo della commessa 3"), { target: { value: "5000" } });
    expect(screen.getByRole("alert")).toHaveTextContent("superano");
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
  });
  it("togliendo la seconda commessa, la prima torna ad avere tutto", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Cerca la commessa…" }));
    fireEvent.click(screen.getByRole("button", { name: "Dividi su un’altra commessa" }));
    fireEvent.click(screen.getByRole("button", { name: "Togli la commessa 2" }));
    expect(screen.queryByLabelText("Importo della commessa 1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", { p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 1000 }], p_magazzino: 0, p_magazzino_righe: null }));
  });
  it("voce per voce: ogni voce va sulla sua commessa", async () => {
    stato.righe = [{ numero_linea: 1, descrizione: "Moduli", imponibile: 700 }, { numero_linea: 2, descrizione: "Trasporto", imponibile: 300 }];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Voce per voce" }));
    const [a, b] = screen.getAllByRole("button", { name: "Commessa…" });
    fireEvent.click(a); fireEvent.click(b);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", { p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 700, righe: [1] }, { order_id: "c2", importo: 300, righe: [2] }], p_magazzino: 0, p_magazzino_righe: null }));
  });
  it("riparte da com'è, con l'IVA, e si può scollegare", async () => {
    stato.costo = { order_id: null, allocations: [{ order_id: "x", pct: 60, importo: 600 }, { order_id: "y", pct: 40, importo: 400 }] };
    mostra();
    await waitFor(() => expect(screen.getByLabelText("Importo della commessa 2")).toHaveValue("488"));
    fireEvent.click(screen.getByRole("button", { name: "Scollega" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", { p_fattura_id: "f1", p_quote: [], p_magazzino: 0, p_magazzino_righe: null }));
  });
  it("una parte resta in magazzino: commesse + magazzino + spese generali = imponibile", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Cerca la commessa…" }));
    fireEvent.click(screen.getByRole("button", { name: "Una parte resta in magazzino" }));
    // La casella si apre facendo spazio: senza residuo dimezza l'ultima commessa.
    fireEvent.change(screen.getByLabelText("Importo che resta a magazzino"), { target: { value: "220" } });
    fireEvent.change(screen.getByLabelText("Importo della commessa 1"), { target: { value: "610" } });
    // 610 alla commessa + 220 a magazzino su 1.220: i 390 che restano sono spese generali.
    expect(screen.getByText(/Restano .*390,00.* e dal magazzino: vanno nelle spese generali\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", {
      p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 500 }], p_magazzino: 180.33, p_magazzino_righe: null,
    }));
  });
  it("commesse più magazzino oltre il totale non si salva", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Cerca la commessa…" }));
    fireEvent.click(screen.getByRole("button", { name: "Una parte resta in magazzino" }));
    fireEvent.change(screen.getByLabelText("Importo della commessa 1"), { target: { value: "1220" } });
    fireEvent.change(screen.getByLabelText("Importo che resta a magazzino"), { target: { value: "500" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Commesse e magazzino insieme superano");
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
  });
  it("voce per voce: una voce può restare a magazzino, e riaprendo si ritrova lì", async () => {
    stato.righe = [{ numero_linea: 1, descrizione: "Moduli", imponibile: 700 }, { numero_linea: 2, descrizione: "Viti avanzate", imponibile: 300 }];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Voce per voce" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Commessa…" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Manda a magazzino: Viti avanzate" }));
    expect(screen.getByText("Resta a magazzino")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", {
      p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 700, righe: [1] }], p_magazzino: 300, p_magazzino_righe: [2],
    }));
  });
  it("riaprendo una fattura con voci a magazzino, quelle voci sono ancora a magazzino", async () => {
    stato.righe = [{ numero_linea: 1, descrizione: "Moduli", imponibile: 700 }, { numero_linea: 2, descrizione: "Viti avanzate", imponibile: 300 }];
    stato.costo = { order_id: null, allocations: [{ order_id: "x", pct: 70, importo: 700, righe: [1] }], quota_magazzino: 300, quota_magazzino_righe: [2] };
    mostra();
    expect(await screen.findByText("Resta a magazzino")).toBeInTheDocument();
  });
  it("sull'ordine d'acquisto non si salva: la commessa viene da lì", async () => {
    mostra({ purchaseOrderId: "po1" });
    expect(await screen.findByRole("status")).toHaveTextContent("ordine d’acquisto");
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull();
  });
});
