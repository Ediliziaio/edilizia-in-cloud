import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ fatture: [] as unknown[], costi: [] as unknown[], dettagli: {} as Record<string, unknown>, rpc: vi.fn(), update: vi.fn(), ordini: [] as unknown[], bolle: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (f: string, a: { p_costo?: string; p_fattura_id?: string }) => {
      stato.rpc(f, a);
      if (f === "commessa_fatture_bolle") return Promise.resolve({ data: stato.bolle, error: null });
      return Promise.resolve(f === "dettaglio_pagamento_costo" ? { data: stato.dettagli[a.p_costo!] ?? null, error: null } : { data: null, error: null });
    },
    from: (tabella: string) => {
      const q: Record<string, unknown> = {};
      const filtri: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q, order: () => q, is: () => q, neq: () => q, not: () => q, contains: () => { filtri.ripartiti = true; return q; },
        eq: (k: string, v: unknown) => { filtri[k] = v; return q; },
        in: (k: string, v: unknown) => { filtri[k] = v; return q; },
        then: (ok: (v: unknown) => unknown) => ok({ data: tabella === "orders" ? stato.ordini : [], error: null }),
        update: (v: unknown) => { stato.update(v); return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }; },
        range: () => {
          const dati: Record<string, unknown[]> = {
            purchase_orders: [{ id: "po1", oda_number: "ODA-1", total: 100, suppliers: { name: "Aluplast" } }],
            company_costs: "id" in filtri || "order_id" in filtri || filtri.ripartiti ? stato.costi : [],
            fatture_ricevute: (stato.fatture as Array<Record<string, unknown>>).filter((f) =>
              ("purchase_order_id" in filtri && f.purchase_order_id) || ("company_cost_id" in filtri && f.company_cost_id) || ("order_id_suggerito" in filtri && f.suggerita)),
          };
          return Promise.resolve({ data: dati[tabella] ?? [], error: null });
        },
      });
      return q;
    },
    storage: { from: vi.fn() },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "co" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: false, canEditOrders: true }) }));
vi.mock("@/components/orders/CaricaFatturaCommessa", () => ({ CaricaFatturaCommessaButton: (): null => null, collegaFatturaACommessa: vi.fn() }));
vi.mock("@/components/fatturazione/CollegaFatturaCommesseDialog", () => ({ CollegaFatturaCommesseDialog: (): null => null }));
vi.mock("@/components/orders/ExpensePaymentDialog", () => ({ ExpensePaymentDialog: ({ costId }: { costId: string }) => <p>pagamenti del costo {costId}</p> }));
vi.mock("@/components/fatturazione/RiepilogoFatturaRicevuta", () => ({ RiepilogoFatturaRicevuta: ({ fatturaId }: { fatturaId: string }) => <p>riepilogo di {fatturaId}</p> }));
import { OrderFattureFornitoriCard, ripartizioneDalleBolle } from "@/components/orders/OrderDocumentiFornitore";

const base = { imponibile_totale: null as number | null, numero_fattura: "F1", data_fattura: "2026-10-01", cedente_ragione_sociale: "Aluplast", totale_documento: 100, tipo_documento: "TD01", stato: "letta", purchase_order_id: null as string | null, company_cost_id: null as string | null, pagata_il: null as string | null, order_match_confidenza: null as number | null, anomalie_rilevate: null as unknown, ai_riassunto: "Serramenti", righe: null as unknown };
const mostra = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><OrderFattureFornitoriCard orderId="o1" mostraImporti puoModificare /></MemoryRouter></QueryClientProvider>);
const scegli = (r: ReturnType<typeof within>, voce: string) => {
  fireEvent.keyDown(r.getByRole("button", { name: /Cambia la verifica/ }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: voce }));
};
const riga = async (testo: RegExp) => (await screen.findByText(testo)).closest("tr")!;
beforeEach(() => { vi.clearAllMocks(); stato.fatture = []; stato.costi = []; stato.dettagli = {}; stato.ordini = []; stato.bolle = []; vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Fatture della commessa in tabella", () => {
  it("mostra verifica, pagamento e quanto manca, con gli importi di «Pagamenti e residuo»", async () => {
    stato.fatture = [{ ...base, id: "f1", company_cost_id: "c1", stato: "contabilizzata" }];
    stato.costi = [{ id: "c1", is_paid: false, paid_date: null }];
    stato.dettagli = { c1: { pagato: 30, residuo: 70 } };
    mostra();
    const r = within(await riga(/N\. F1/));
    expect(r.getByText("Verificata")).toBeInTheDocument();
    expect(r.getByText("Pagata in parte")).toBeInTheDocument();
    expect(r.getByText(/30,00/)).toBeInTheDocument();
    expect(r.getByText(/70,00/)).toBeInTheDocument();
    expect(r.getByText("Serramenti")).toBeInTheDocument();
    expect(r.queryByRole("button", { name: /Verifica la fattura/ })).toBeNull();
  });
  it("la verifica si cambia nei due sensi, senza toccare la contabilità", async () => {
    stato.fatture = [{ ...base, id: "f1", company_cost_id: "c1", stato: "contabilizzata" }];
    stato.costi = [{ id: "c1", is_paid: false, paid_date: null }];
    mostra();
    const r = within(await riga(/N\. F1/));
    expect(r.getByText("Verificata")).toBeInTheDocument();
    scegli(r, "Da verificare");
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_segna_verifica", { p_fattura_id: "f1", p_verificata: false }));
    expect(stato.rpc).not.toHaveBeenCalledWith("contabilizza_fattura_ricevuta", expect.anything());
  });
  it("contabilizzare è una scelta a parte, e chiede conferma", async () => {
    stato.fatture = [{ ...base, id: "f1", purchase_order_id: "po1" }];
    mostra();
    const r = within(await riga(/N\. F1/));
    expect(r.getByText("Da verificare")).toBeInTheDocument();
    scegli(r, "Contabilizza");
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("contabilizza_fattura_ricevuta", { p_fattura_id: "f1" }));
  });
  it("se chi guarda non conferma, la fattura non si contabilizza", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    stato.fatture = [{ ...base, id: "f1", purchase_order_id: "po1" }];
    mostra();
    scegli(within(await riga(/N\. F1/)), "Contabilizza");
    expect(stato.rpc).not.toHaveBeenCalledWith("contabilizza_fattura_ricevuta", expect.anything());
  });
  it("una fattura divisa mostra la quota, le altre commesse e le voci di questa", async () => {
    stato.fatture = [{ ...base, id: "f1", company_cost_id: "c1", stato: "contabilizzata", totale_documento: 1000, imponibile_totale: 820, righe: [{ numero_linea: 1, descrizione: "Moduli", imponibile: 400 }, { numero_linea: 2, descrizione: "Trasporto", imponibile: 600 }] }];
    stato.costi = [{ id: "c1", order_id: null, is_paid: false, paid_date: null, allocations: [{ order_id: "o1", pct: 40, importo: 400, righe: [1] }, { order_id: "o2", pct: 60, importo: 600 }] }];
    stato.ordini = [{ id: "o1", order_code: "C-1" }, { id: "o2", order_code: "C-2" }];
    mostra();
    const r = within(await riga(/N\. F1/));
    // La fattura intera, il costo che porta qui (IVA esclusa) e quanto pesa.
    expect(r.getByText(/1\.000,00/)).toBeInTheDocument();
    expect(r.getByText(/imp\. 820,00/)).toBeInTheDocument();
    expect(r.getByText(/^328,00/)).toBeInTheDocument();
    expect(r.getByText("40% della fattura")).toBeInTheDocument();
    expect(r.getByText("Divisa su 2 commesse")).toBeInTheDocument();
    expect(r.getByText(/C-2 · 60%/)).toBeInTheDocument();
    expect(r.getByText("Voci di questa commessa: Moduli")).toBeInTheDocument();
  });
  it("bolle: quanto vale la merce consegnata qui e quante bolle della fattura mancano (23/11/2026)", async () => {
    stato.fatture = [{ ...base, id: "f1", company_cost_id: "c1", stato: "contabilizzata", totale_documento: 50551.31, imponibile_totale: 41435.5 }];
    stato.costi = [{ id: "c1", order_id: null, is_paid: false, paid_date: null, allocations: [{ order_id: "o1", pct: 56.6881, importo: 23489 }] }];
    stato.bolle = [{ fattura_id: "f1", bolle_citate: 41, bolle_caricate: 1, bolle_qui: 1, valore_qui: 468, righe_senza_prezzo: 0 }];
    mostra();
    const r = within(await riga(/N\. F1/));
    expect(r.getByText(/50\.551,31/)).toBeInTheDocument();
    expect(r.getByText(/^23\.489,00/)).toBeInTheDocument();
    expect(r.getByText("56,7% della fattura")).toBeInTheDocument();
    expect(r.getByText(/Bolle qui: 468,00.*\(1 bolla\)/)).toBeInTheDocument();
    expect(r.getByText("40 bolle su 41 da caricare")).toBeInTheDocument();
  });
  it("tutte le bolle caricate e il costo qui è diverso: avviso sulla riga", async () => {
    stato.fatture = [{ ...base, id: "f1", company_cost_id: "c1", stato: "contabilizzata", totale_documento: 1220, imponibile_totale: 1000 }];
    stato.costi = [{ id: "c1", order_id: "o1", is_paid: false, paid_date: null, allocations: [] }];
    stato.bolle = [{ fattura_id: "f1", bolle_citate: 2, bolle_caricate: 2, bolle_qui: 1, valore_qui: 300, righe_senza_prezzo: 0 }];
    mostra();
    const r = within(await riga(/N\. F1/));
    expect(r.getByText("tutta la fattura")).toBeInTheDocument();
    expect(r.getByText(/non torna con le bolle consegnate: .*300,00/)).toBeInTheDocument();
  });
  it("fatturato oltre l'ordine: resta un avviso sulla riga, che dice quanto", async () => {
    stato.fatture = [{ ...base, id: "f1", purchase_order_id: "po1", stato: "contabilizzata", totale_documento: 150 }];
    mostra();
    const r = within(await riga(/N\. F1/));
    expect(r.getByText(/Fatturato .*150,00.* su un ordine di .*100,00/)).toBeInTheDocument();
  });
  it("una suggerita sta in tabella da collegare, non conta nei totali e si può scartare", async () => {
    stato.fatture = [{ ...base, id: "f2", suggerita: true, order_match_confidenza: 0.8 }];
    mostra();
    const r = within(await riga(/N\. F1/));
    expect(r.getByText("Da collegare")).toBeInTheDocument();
    expect(r.getByText("L’AI è sicura al 80%")).toBeInTheDocument();
    expect(screen.queryByText(/IVA inclusa/)).toBeNull();
    fireEvent.click(r.getByRole("button", { name: "Non è di questa commessa" }));
    await waitFor(() => expect(stato.update).toHaveBeenCalledWith({ order_id_suggerito: null, order_match_confidenza: null }));
  });
  it("con un costo collegato il pagamento apre «Pagamenti e residuo»; senza, segna la fattura pagata", async () => {
    stato.fatture = [{ ...base, id: "f1", company_cost_id: "c1", numero_fattura: "CC", stato: "contabilizzata" }, { ...base, id: "f2", purchase_order_id: "po1", numero_fattura: "SS", totale_documento: 10 }];
    stato.costi = [{ id: "c1", is_paid: false, paid_date: null }];
    mostra();
    fireEvent.click(within(await riga(/N\. CC/)).getByRole("button", { name: /Pagamento della fattura/ }));
    expect(await screen.findByText("pagamenti del costo c1")).toBeInTheDocument();
    fireEvent.click(within(await riga(/N\. SS/)).getByRole("button", { name: /Pagamento della fattura/ }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("registra_saldo_fattura_ricevuta", expect.objectContaining({ p_id: "f2", p_richiesta: expect.any(String) })));
  });
  it("la fattura si apre in un popup, senza uscire", async () => {
    stato.fatture = [{ ...base, id: "f1", purchase_order_id: "po1" }];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /N\. F1/ }));
    expect(await screen.findByText("riepilogo di f1")).toBeInTheDocument();
  });
  it("un numero filtra la tabella", async () => {
    stato.fatture = [{ ...base, id: "f1", numero_fattura: "A", purchase_order_id: "po1", totale_documento: 50 }, { ...base, id: "f3", numero_fattura: "B", purchase_order_id: "po1", stato: "contabilizzata", totale_documento: 10 }];
    mostra();
    await riga(/N\. A/);
    fireEvent.click(within(screen.getByRole("group", { name: "Fatture per stato" })).getByText("Verificate").closest("button")!);
    expect(screen.queryByText(/N\. A/)).toBeNull();
    expect(screen.getByText(/N\. B/)).toBeInTheDocument();
  });
});

describe("il costo sulla commessa torna con le bolle?", () => {
  const b = (citate: number, caricate: number, valoreQui: number, senzaPrezzo = 0) => ({ citate, caricate, qui: 1, valoreQui, senzaPrezzo });
  it("tutte caricate: torna se vale la merce consegnata qui, con tolleranza", () => {
    expect(ripartizioneDalleBolle(468, b(1, 1, 468))).toBe("torna");
    expect(ripartizioneDalleBolle(470, b(1, 1, 468))).toBe("torna");
    expect(ripartizioneDalleBolle(23489, b(1, 1, 468))).toBe("non_torna");
  });
  it("bolle mancanti: si può dire solo che non vale meno di quanto già consegnato", () => {
    expect(ripartizioneDalleBolle(23489, b(41, 1, 468))).toBe("incompleta");
    expect(ripartizioneDalleBolle(100, b(41, 1, 468))).toBe("non_torna");
  });
  it("righe senza prezzo o nessuna bolla: non si giudica", () => {
    expect(ripartizioneDalleBolle(100, b(2, 2, 0, 1))).toBe("incompleta");
    expect(ripartizioneDalleBolle(100, { citate: 0, caricate: 0, qui: 0, valoreQui: 0, senzaPrezzo: 0 })).toBeNull();
  });
});
