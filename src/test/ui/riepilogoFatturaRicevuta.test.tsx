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

const XML_DETTAGLI = '<FatturaElettronica versione="FPR12"><FatturaElettronicaHeader><DatiTrasmissione><CodiceDestinatario>ABC1234</CodiceDestinatario></DatiTrasmissione><CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore prova</Denominazione></Anagrafica></DatiAnagrafici><Contatti><Email>xml@example.test</Email></Contatti></CedentePrestatore><CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente prova</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente></FatturaElettronicaHeader><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD24</TipoDocumento><Divisa>EUR</Divisa><Data>2026-11-19</Data><Numero>PROVA</Numero><ImportoTotaleDocumento>434.32</ImportoTotaleDocumento><Causale>CAUSALE ORIGINALE</Causale></DatiGeneraliDocumento><DatiDDT><NumeroDDT>DDT-DIECI</NumeroDDT><DataDDT>2026-11-18</DataDDT><RiferimentoNumeroLinea>10</RiferimentoNumeroLinea></DatiDDT><DatiDDT><NumeroDDT>DDT-DUE</NumeroDDT><DataDDT>2026-11-17</DataDDT><RiferimentoNumeroLinea>2</RiferimentoNumeroLinea></DatiDDT></DatiGenerali><DatiBeniServizi>'+[[10,'AA000AA','80.00'],[2,'BB111BB','276.00']].map(([numero,targa,prezzo])=>'<DettaglioLinee><NumeroLinea>'+numero+'</NumeroLinea><Descrizione>Manutenzione</Descrizione><Quantita>1.12345678</Quantita><UnitaMisura>h.</UnitaMisura><PrezzoUnitario>'+prezzo+'</PrezzoUnitario><PrezzoTotale>'+prezzo+'</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA><AltriDatiGestionali><TipoDato>Targa</TipoDato><RiferimentoTesto>'+targa+'</RiferimentoTesto></AltriDatiGestionali></DettaglioLinee>').join('')+'</DatiBeniServizi></FatturaElettronicaBody></FatturaElettronica>';

const conXml = () => ({...FIC,xml_raw:XML_DETTAGLI,indice_corpo:0,righe:(FIC.righe as object[]).map((r,i)=>({...r,numero_linea:i===0?10:2}))});

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
  it("mostra targhe e DDT sulla riga corrispondente, precisione XML, causale e altri riferimenti nel popup", async () => {
    finto.dati.fatture_ricevute=conXml();
    apri();
    const tabella=within(await screen.findByRole('table',{name:'Cosa fattura'}));
    const righe=tabella.getAllByRole('row').slice(1);
    expect(righe[0]).toHaveTextContent('Manutenzione');
    expect(righe[0]).toHaveTextContent('AA000AA');
    expect(righe[0]).toHaveTextContent('DDT-DIECI');
    expect(righe[0]).not.toHaveTextContent('BB111BB');
    expect(righe[1]).toHaveTextContent('BB111BB');
    expect(righe[1]).toHaveTextContent('DDT-DUE');
    expect(righe[1]).not.toHaveTextContent('DDT-DIECI');
    expect(righe[0]).toHaveTextContent('1,12345678 h.');
    expect(screen.getByRole('table',{name:'Documenti di trasporto'})).toHaveTextContent('18-11-2026');
    expect(screen.getByText('CAUSALE ORIGINALE')).toBeVisible();
    const dettagli=screen.getByText(/Altri dati presenti nell’XML/).closest('details')!;
    fireEvent.click(within(dettagli).getByText(/Altri dati presenti/));
    expect(dettagli).toHaveTextContent('xml@example.test');
  });
  it("espone in testata le azioni e rende consultabili beneficiario, banca e dati XML aggiuntivi",async()=>{
    const pagamento='<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><Beneficiario>BENEFICIARIO ORIGINALE</Beneficiario><ModalitaPagamento>MP12</ModalitaPagamento><IBAN>IT60X0542811101000000123456</IBAN><IstitutoFinanziario>BANCA DEL FORNITORE</IstitutoFinanziario><DataScadenzaPagamento>2026-11-30</DataScadenzaPagamento><ImportoPagamento>434.32</ImportoPagamento></DettaglioPagamento></DatiPagamento>';
    finto.dati.fatture_ricevute={...conXml(),xml_raw:XML_DETTAGLI.replace('</FatturaElettronicaBody>',pagamento+'</FatturaElettronicaBody>')};
    apri();
    const azioni=within(await screen.findByRole('group',{name:'Azioni della fattura'}));
    expect(azioni.getByRole('button',{name:'Versione completa e stampa'})).toBeVisible();
    expect(azioni.getByRole('button',{name:'Scarica il file originale'})).toBeVisible();
    expect(azioni.getByRole('button',{name:'Confronta con DDT e ordini'})).toBeVisible();
    fireEvent.click(screen.getByText('Dati del documento e pagamenti XML'));
    const originale=screen.getByRole('table',{name:'Dati di pagamento'});
    expect(originale).toHaveTextContent('BENEFICIARIO ORIGINALE');
    expect(originale).toHaveTextContent('BANCA DEL FORNITORE');
    expect(originale).toHaveTextContent('IT60X0542811101000000123456');
  });
  it("il residuo deriva dai movimenti effettivi anche quando le rate risultano ancora aperte",async()=>{
    finto.dati.fatture_ricevute={...FIC,company_cost_id:'c1'};
    finto.dati.company_costs={id:'c1',amount:356};
    finto.dati['rate_fornitori[]']=[{id:'r1',numero:1,stato:'da_pagare',importo:434.32,scadenza:'2026-11-30'}];
    finto.rpc.mockImplementation(async(name:string)=>({data:name==='dettaglio_pagamento_costo'?{id:'c1',company_id:'co',totale:434.32,pagato:100,residuo:334.32,da_verificare:false,movimenti:[]}:null,error:null}));
    apri();
    expect(await screen.findByText('Pagamento parziale')).toBeVisible();
    const stato=within(screen.getByLabelText('Situazione dei pagamenti'));
    expect(stato.getByText('100,00 €')).toBeVisible();
    expect(stato.getByText('334,32 €')).toBeVisible();
    expect(screen.queryByRole('button',{name:'Segna pagata la rata 1'})).toBeNull();
  });

  it("conserva anche righe XML assenti nell’importazione, senza associarle per posizione", async () => {
    finto.dati.fatture_ricevute={...conXml(),righe:[(FIC.righe as object[])[0]]};
    apri();
    const extra=await screen.findByRole('region',{name:'Ulteriori righe XML'});
    expect(extra).toHaveTextContent('AA000AA');
    expect(extra).toHaveTextContent('BB111BB');
    const tabella=screen.getByRole('table',{name:'Cosa fattura'});
    expect(tabella).not.toHaveTextContent('AA000AA');
  });

  it("non mostra dati di un altro corpo quando l’indice del lotto non esiste", async () => {
    finto.dati.fatture_ricevute={...conXml(),indice_corpo:1};
    apri();
    await screen.findByText(/I dettagli dell’XML non sono leggibili/);
    expect(screen.queryByText('AA000AA')).toBeNull();
    expect(screen.queryByText('CAUSALE ORIGINALE')).toBeNull();
  });
  it("senza XML mostra righe, IVA ricavata e totale; niente «versione completa»", async () => {
    apri();
    expect((await screen.findAllByText("CEMENTO 32,5 R SACCO 25 KG")).length).toBeGreaterThan(0);
    expect(screen.getByText(/IVA 22% su/)).toBeTruthy();
    expect(within(screen.getByLabelText("Importi del documento")).getByText("434,32 €")).toBeTruthy();
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
