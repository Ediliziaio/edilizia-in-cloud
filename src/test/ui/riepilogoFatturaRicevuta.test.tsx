import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 30/10/2026 — Il riepilogo della fattura ricevuta funziona senza XML (righe e totali
// dal database), dice a cosa è collegata e collega fornitore e commessa da lì.

const finto = vi.hoisted(() => ({ dati: {} as Record<string, unknown>, rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): any => {
    const c: any = {};
    for (const m of ["select", "eq", "is", "order", "in", "or", "limit"]) c[m] = () => c;
    if (tabella === "rate_fornitori") {
      let id: string;
      let modifica: Record<string, unknown>;
      c.eq = (campo: string, valore: string) => { if (campo === "id") id = valore; return c; };
      c.update = (valori: Record<string, unknown>) => { modifica = valori; return c; };
      c.single = async () => {
        const rata = (finto.dati["rate_fornitori[]"] as Array<{id:string}>).find(r => r.id === id);
        if (!rata) return { error: "Rata assente" };
        Object.assign(rata, modifica);
        return { data: {id}, error: null as null };
      };
    }
    c.maybeSingle = async () => ({ data: finto.dati[tabella] ?? null, error: null as null });
    c.then = (ok: (v: unknown) => unknown) => ok({ data: finto.dati[`${tabella}[]`] ?? [], error: null as null });
    return c;
  };
  return { supabase: { from: catena, rpc: (...a: unknown[]) => finto.rpc(...a) } };
});
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, solaLettura: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { RiepilogoFatturaRicevuta } from "@/components/fatturazione/RiepilogoFatturaRicevuta";

const FIC: Record<string, unknown> = {
  id: "f1", cedente_ragione_sociale: "Edilmateriali Rossi Srl", cedente_piva: "IT01234567890", cedente_cf: null,
  tipo_documento: "TD01", numero_fattura: "1288", data_fattura: "2026-10-15",
  imponibile_totale: 356, iva_totale: 78.32, totale_documento: 434.32,
  righe: [
    { descrizione: "ZAVORRA CLS 13 X 100 X H21", quantita: 4, prezzo_unitario: 20, aliquota_iva: 22, imponibile: 80 },
    { descrizione: "CEMENTO 32,5 R SACCO 25 KG", quantita: 40, prezzo_unitario: 6.9, aliquota_iva: 22, imponibile: 276 },
  ],
  riepilogo_iva: [], stato: "letta", xml_url: null, xml_bytes: null,
  purchase_order_id: null, company_cost_id: null, fornitore_id: null, order_id_suggerito: "o9", anomalie_rilevate: [],
};

function apri() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter>
      <RiepilogoFatturaRicevuta fatturaId="f1" companyId="co" onClose={() => {}} azioni={{ onVersioneCompleta: vi.fn() }} />
    </MemoryRouter></QueryClientProvider>,
  );
}

beforeEach(() => {
  finto.rpc.mockReset().mockResolvedValue({ data: { esito: "collegata" }, error: null as null });
  finto.dati = {
    fatture_ricevute: FIC,
    "fatture_ricevute[]": [{ id: "f1" }, { id: "f2" }],
    "suppliers[]": [{ id: "s1", name: "Edilmateriali Rossi", vat_number: "01234567890", fiscal_code: null }],
    orders: { id: "o9", order_code: "C-2026-041", client_name: "Biemme" },
  };
});

describe("riepilogo della fattura ricevuta", () => {
  it("senza XML mostra righe, IVA ricavata e totale; niente «versione completa»", async () => {
    apri();
    expect((await screen.findAllByText("CEMENTO 32,5 R SACCO 25 KG")).length).toBeGreaterThan(0);
    expect(screen.getByText(/IVA 22% su/)).toBeTruthy();
    expect(screen.getByText("434,32 €")).toBeTruthy();
    expect(screen.queryByText(/Versione completa/)).toBeNull();
  });

  it("mostra subito conto, macrocommessa, commessa, magazzino e residuo sull’imponibile", async () => {
    finto.dati.fatture_ricevute = { ...FIC, company_cost_id: "c1", imponibile_totale: 100, totale_documento: 122 };
    finto.dati.company_costs = { id: "c1", amount: 100, category: "trasporti", quota_magazzino: 15,
      allocations: [{ order_id: "g", pct: 50, importo: 50 }, { order_id: "o", pct: 25 }] };
    finto.dati["orders[]"] = [{ id: "g", order_code: "G-1", workflow_kind: "generale" }, { id: "o", order_code: "C-1" }];
    apri();
    const box = within(await screen.findByRole("table", { name: "Quote per destinazione" }));
    expect(screen.getByRole("combobox", { name: "Conto di costo" })).toHaveTextContent("trasporti");
    for (const nome of [/Macrocommessa · G-1.*50%.*50,00/, /Commessa · C-1.*25%.*25,00/, /Magazzino.*15%.*15,00/, /Costo generale.*10%.*10,00/]) {
      expect(box.getByRole("row", { name: nome })).toBeVisible();
    }
  });

  it("somma le quote di due ordini di acquisto della stessa commessa", async () => {
    finto.dati.fatture_ricevute = { ...FIC, imponibile_totale: 100 };
    finto.dati["fattura_ricevuta_ordini[]"] = [20, 30].map((importo, i) => ({
      importo, purchase_orders: { id: "po" + i, oda_number: "ODA-" + i, orders: { id: "o", order_code: "C-1" } },
    }));
    apri();
    const box = within(await screen.findByRole("table", { name: "Quote per destinazione" }));
    expect(box.getByRole("row", { name: /Commessa · C-1.*50%.*50,00/ })).toBeVisible();
  });

  it("mostra la prima rata ancora aperta, anche se scaduta, con importo e Ri.Ba.", async () => {
    finto.dati["rate_fornitori[]"] = [
      { numero: 1, stato: "pagata", scadenza: "2026-09-10", pagata_il: "2026-09-12" },
      { numero: 2, stato: "da_pagare", scadenza: "2026-10-10", importo: 125, metodo: "MP12" },
      { numero: 3, stato: "da_pagare", scadenza: "2026-12-10", importo: 250 },
    ];
    apri();
    const label = await screen.findByText("Prossima scadenza");
    expect(label.nextElementSibling).toHaveTextContent("10 ott 2026 · 125,00 € · Ri.Ba.");
  });
  it("pagando una sola rata ricarica la scadenza successiva e il residuo", async () => {
    finto.dati["rate_fornitori[]"] = [
      { id:"r1", numero:1, stato:"da_pagare", scadenza:"2025-10-10", importo:120, metodo:"MP12" },
      { id:"r2", numero:2, stato:"da_pagare", scadenza:"2025-11-10", importo:80, metodo:"MP12" },
    ];
    apri();
    fireEvent.click(await screen.findByRole("button", {name:"Segna pagata la rata 1"}));
    fireEvent.change(screen.getByLabelText("Data effettiva del pagamento"), {target:{value:"2025-10-09"}});
    fireEvent.click(screen.getByRole("button", {name:"Conferma pagamento"}));
    await screen.findByText("Rata 1 · pagata il 9 ott 2025");
    expect(screen.getByText("Prossima scadenza").nextElementSibling).toHaveTextContent("10 nov 2025");
    expect(screen.getByText(/Residuo fattura/)).toHaveTextContent("80,00 €");
    expect(screen.queryByRole("button", {name:"Segna pagata la rata 1"})).toBeNull();
  });
  it("mostra la data effettiva della singola rata anche senza piano XML", async () => {
    finto.dati["rate_fornitori[]"] = [{ numero: 2, pagata_il: "2026-11-17" }];
    apri();
    expect(await screen.findByText(/Rata 2 · pagata il 17 nov 2026/)).toBeTruthy();
  });

  it("collega il fornitore della stessa partita IVA, con le altre fatture del cedente", async () => {
    apri();
    fireEvent.click(await screen.findByText(/Collega a Edilmateriali Rossi/));
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("collega_fornitore_ricevute", {
      p_company_id: "co", p_invoice_ids: ["f1", "f2"], p_supplier_id: "s1",
    }));
  });

  it("accetta la commessa suggerita dall'AI", async () => {
    apri();
    await screen.findByText("L'AI suggerisce");
    fireEvent.click(screen.getByRole("button", { name: "Collega" }));
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("commessa_collega_fattura_ricevuta", { p_fattura_id: "f1", p_order_id: "o9" }));
  });

  it("con l'ordine d'acquisto la commessa non si sceglie qui", async () => {
    finto.dati.fatture_ricevute = { ...FIC, purchase_order_id: "po1" };
    finto.dati.purchase_orders = { id: "po1", oda_number: "ODA-118", orders: { id: "o1", order_code: "C-2026-033" } };
    apri();
    await screen.findByText("ODA-118");
    expect(screen.getByText("C-2026-033")).toBeTruthy();
    expect(screen.queryByText("Scegli commessa")).toBeNull();
    expect(screen.queryByText("L'AI suggerisce")).toBeNull();
  });
});


describe("stato di lettura all’apertura", () => {
  it("aprire il riepilogo basta; la scelta manuale resta fino alla prossima apertura", async () => {
    finto.dati.fatture_ricevute = {...FIC,stato:"non_letta",da_leggere:null,note_interne:"Nota del cliente"};
    finto.rpc.mockImplementation(async (name:string,args:{p_da_leggere?:boolean})=>{
      if(name!=="fattura_ricevuta_lettura")return {data:null,error:null};
      const unread=args.p_da_leggere!;
      finto.dati.fatture_ricevute={...(finto.dati.fatture_ricevute as object),stato:unread?"non_letta":"letta",da_leggere:unread};
      return {data:{id:"f1",stato:unread?"non_letta":"letta",da_leggere:unread},error:null};
    });
    const view=apri();
    fireEvent.click(await screen.findByRole("button",{name:"Segna come non letta"}));
    await screen.findByRole("button",{name:"Segna come letta"});
    expect(finto.rpc.mock.calls.filter(c=>c[0]==="fattura_ricevuta_lettura").map(c=>c[1].p_da_leggere)).toEqual([false,true]);
    view.unmount();apri();await screen.findByRole("button",{name:"Segna come non letta"});
    expect(finto.rpc.mock.calls.filter(c=>c[0]==="fattura_ricevuta_lettura").map(c=>c[1].p_da_leggere)).toEqual([false,true,false]);
  });
});
