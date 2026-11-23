import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ righe: null as unknown, costo: null as unknown, rpc: vi.fn(), chiudi: vi.fn(), scelte: 0, condiviso: false, xml: null as string | null, legami: [] as unknown[] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (f: string, a: unknown) => { stato.rpc(f, a); return Promise.resolve({ data: {}, error: null }); },
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    Object.assign(q, { select: () => q, eq: () => q, neq: () => q, limit: () => Promise.resolve({data: stato.condiviso ? [{id:"altra"}] : [], error:null}), maybeSingle: () => Promise.resolve({ data: t === "fatture_ricevute" ? { righe: stato.righe, xml_raw: stato.xml } : stato.costo, error: null }),
      then: (ok: (v: unknown) => unknown) => ok({ data: t === "fattura_ddt" ? stato.legami : [], error: null }) });
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
const mostra = (extra = {}, suImponibile = false) => render(<QueryClientProvider client={new QueryClient()}><CollegaFatturaCommesseDialog suImponibile={suImponibile} companyId="co" onChiudi={stato.chiudi} fattura={{ ...fattura, ...extra }} /></QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); stato.righe = null; stato.costo = { order_id: null, allocations: [], quota_magazzino: null, quota_magazzino_righe: null }; stato.scelte = 0; stato.condiviso = false; stato.xml = null; stato.legami = []; });
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
  it("dal riepilogo divide il netto per percentuale e conserva gli importi passando agli euro", async () => {
    mostra({}, true);
    fireEvent.click(await screen.findByRole("button", { name: "Cerca la commessa…" }));
    fireEvent.click(screen.getByRole("button", { name: "Dividi su un’altra commessa" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Cerca la commessa…" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Percentuali" }));
    fireEvent.change(screen.getByLabelText("Percentuale della commessa 1"), { target: { value: "32,15" } });
    fireEvent.click(screen.getByRole("button", { name: "Importi" }));
    expect(screen.getByLabelText("Importo della commessa 2")).toHaveValue("678,5");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", {
      p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 321.5 }, { order_id: "c2", importo: 678.5 }], p_magazzino: 0, p_magazzino_righe: null,
    }));
  });
  it("un costo condiviso tra documenti non può essere sovrascritto dalla singola fattura", async () => {
    stato.condiviso = true;
    mostra({}, true);
    await screen.findByText(/raggruppa più fatture/);
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull();
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
  it("bolla per bolla: la fattura dice quali voci sono di quale bolla, e la bolla caricata propone la sua commessa", async () => {
    stato.righe = [
      { numero_linea: 1, descrizione: "CLS RCK35", imponibile: 468 },
      { numero_linea: 2, descrizione: "CLS RCK37", imponibile: 432 },
      { numero_linea: 3, descrizione: "Pompa", imponibile: 100 },
    ];
    stato.xml = `<p:FatturaElettronica xmlns:p="x"><FatturaElettronicaBody><DatiGenerali>
      <DatiDDT><NumeroDDT>2026-DT05-0004727</NumeroDDT><DataDDT>2026-09-15</DataDDT><RiferimentoNumeroLinea>1</RiferimentoNumeroLinea></DatiDDT>
      <DatiDDT><NumeroDDT>2026-DT03-0001841</NumeroDDT><DataDDT>2026-09-16</DataDDT><RiferimentoNumeroLinea>2</RiferimentoNumeroLinea><RiferimentoNumeroLinea>3</RiferimentoNumeroLinea></DatiDDT>
      </DatiGenerali></FatturaElettronicaBody></p:FatturaElettronica>`;
    stato.legami = [{ numero_ddt: "2026-DT05-0004727", data_ddt: "2026-09-15", ddt_ricezione_id: "b1", ddt_ricezione: { order_id: "cantiere" } }];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Bolla per bolla (2)" }));
    expect(screen.getByText("DDT 2026-DT05-0004727")).toBeInTheDocument();
    expect(screen.getByText("dalla bolla caricata")).toBeInTheDocument();
    // La seconda bolla: una scelta per due voci.
    fireEvent.click(screen.getAllByRole("button", { name: "Commessa…" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", expect.objectContaining({
      p_quote: [expect.objectContaining({ order_id: "cantiere", importo: 468, righe: [1] }), expect.objectContaining({ order_id: "c1", importo: 532, righe: [2, 3] })],
    })));
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

/**
 * La finestra chiede una cosa sola: resta stretta (19/11/2026). Il contenitore operativo di serie è
 * «spazio», 1.280 px, e la regola del foglio di stile batte le classi Tailwind: su un portatile la
 * finestra riempiva lo schermo e «Salva» finiva fuori vista, come nel video di Impresa Vulcano.
 */
describe("l'ampiezza della finestra", () => {
  it("è quella di una conferma, non quella larga di serie", () => {
    const sorgente = readFileSync(
      resolve(process.cwd(), "src/components/fatturazione/CollegaFatturaCommesseDialog.tsx"),
      "utf8",
    );
    expect(sorgente).toMatch(/<DialogContent[^>]*ampiezza="conferma"/);
  });
});
