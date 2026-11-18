import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreaFatturaDialog } from "@/components/orders/CreaFatturaDialog";
import type { Installment } from "@/lib/orderUtils";
import { queryKeys } from "@/lib/queryKeys";

type Righe = Array<Record<string, unknown>>;
const mocks = vi.hoisted(() => ({
  tabelle: {} as Record<string, unknown[]>,
  crea: vi.fn(),
  rpc: vi.fn(),
  collega: vi.fn(),
  anagraficaError: null as { message: string } | null,
  ricercaPerNome: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const costruttore = (tabella: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "in", "or", "is"]) q[m] = () => q;
    q.or = (...args: unknown[]) => { if (tabella === "anagrafiche_native") mocks.ricercaPerNome(...args); return q; };
    q.maybeSingle = async () => ({ data: null as unknown, error: tabella === "anagrafiche_native" ? mocks.anagraficaError : null });
    q.then = (ok: (v: unknown) => unknown) => ok({ data: mocks.tabelle[tabella] ?? [], error: null });
    return q;
  };
  return { supabase: { from: costruttore, rpc: (...args: unknown[]) => mocks.rpc(...args) } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/hooks/useDocumentiFiscali", () => ({ useCreateDocumento: () => ({ mutateAsync: mocks.crea, isPending: false }) }));
vi.mock("@/hooks/billing/useFatturaOrdineLink", () => ({ useLinkFatturaOrdine: () => ({ mutateAsync: mocks.collega, isPending: false }) }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: { iban_principale: "IT60X0542811101000000123456" } }) }));
vi.mock("@/hooks/useBonusFiscaliFlags", () => ({ useBonusFiscaliFlags: () => ({ bonusMultipli: false }) }));
vi.mock("@/components/fatturazione/PreviewFattura", () => ({ PreviewFattura: (): null => null }));

const apri = (installments: Installment[] = [], customerId: string | null = null, client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), onApriBozza?: (id: string) => void) => render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <CreaFatturaDialog open onOpenChange={vi.fn()} orderId="o1" orderCode="ORD-1" orderDescription="Lavori" totalAmount={30000} vatRate={10} customerId={customerId} customerName="Mario" installments={installments} onApriBozza={onApriBozza} />
    </MemoryRouter>
  </QueryClientProvider>,
);
const fase = (id: string, name: string, percentuale: number, importo_venduto: number) => ({ id, name, status: "in_corso", percentuale, importo_venduto });
const righeCreate = () => (mocks.crea.mock.calls[0][0] as { righe: Righe }).righe;
/** Il riquadro delle fasi si apre dalla scelta già attiva. */
const apriFasi = async () => { fireEvent.click(await screen.findByRole("button", { name: "Fasi", pressed: true })); };
const creaFattura = () => fireEvent.click(screen.getByRole("button", { name: /Crea fattura ·/ }));

beforeEach(() => {
  mocks.rpc.mockResolvedValue({error:null});
  mocks.crea.mockResolvedValue({id:"nuova-fattura"});
  mocks.collega.mockResolvedValue(undefined);
  mocks.anagraficaError = null;
  mocks.tabelle = {
    order_work_phases: [fase("f1", "Opere murarie", 60, 20000), fase("f2", "Impianti", 0, 10000)],
    order_work_phase_voci: [
      { id: "v1", phase_id: "f1", descrizione: "Massetto", unita: "mq", quantita: 100, importo: 5000 },
      { id: "v2", phase_id: "f1", descrizione: "Tramezzi", unita: "mq", quantita: 50, importo: 15000 },
    ],
  };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Crea fattura: cosa fatturi", () => {
  it("con lavori maturati parte dalle fasi, mostra solo le scelte che esistono e crea una riga per fase", async () => {
    apri();
    expect(await screen.findByRole("button", { name: "Fasi", pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SAL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Articoli" })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Descrizione della riga").map((d) => (d as HTMLTextAreaElement).value)).toEqual(["Opere murarie — avanzamento lavori 60%"]);
    await apriFasi();
    expect(screen.getByLabelText("Importo da fatturare: Opere murarie")).toHaveValue("12.000,00");
    expect(screen.getByLabelText("Importo da fatturare: Impianti")).toHaveValue("0,00");
    creaFattura();
    expect(mocks.crea.mock.calls[0][0].cliente_snapshot).toMatchObject({ ragione_sociale: "Mario" });
    expect(mocks.crea.mock.calls[0][0].anagrafica_id).toBeUndefined();
    expect(righeCreate()).toEqual([expect.objectContaining({ id: "fase:f1", prezzo_unitario: 12000, aliquota_iva: "10", descrizione: "Opere murarie — avanzamento lavori 60%" })]);
  });

  it("toglie il già fatturato di quella fase, letto dalle fatture", async () => {
    mocks.tabelle.fattura_ordine = [{ fattura_id: "d1", importo_associato: null }];
    mocks.tabelle.documenti_fiscali = [{ id: "d1", tipo: "fattura", stato: "emessa", righe: [{ id: "fase:f1", imponibile: 5000 }], totale_documento: 5500 }];
    apri();
    await apriFasi();
    expect(await screen.findByLabelText("Importo da fatturare: Opere murarie")).toHaveValue("7.000,00");
  });

  it("aperta la fase, in fattura vanno le sue voci del computo, ciascuna col suo importo", async () => {
    apri();
    await apriFasi();
    fireEvent.click(await screen.findByRole("button", { name: /2 voci del computo/ }));
    expect(screen.getByLabelText("Importo da fatturare: Massetto")).toHaveValue("3.000,00");
    expect(screen.getByLabelText("Importo da fatturare: Tramezzi")).toHaveValue("9.000,00");
    fireEvent.click(screen.getByLabelText("In fattura: Tramezzi"));
    creaFattura();
    expect(righeCreate()).toEqual([expect.objectContaining({ id: "fase:f1:voce:v1", prezzo_unitario: 3000, descrizione: "Opere murarie: Massetto (100 mq) — quota del 60%" })]);
  });

  it("un importo scritto a mano vale per quella fase", async () => {
    apri();
    await apriFasi();
    fireEvent.change(await screen.findByLabelText("Importo da fatturare: Impianti"), { target: { value: "1.500,50" } });
    creaFattura();
    expect(righeCreate().map((r) => [r.id, r.prezzo_unitario])).toEqual([["fase:f1", 12000], ["fase:f2", 1500.5]]);
  });

  it("la riga si scrive come in una fattura normale: descrizione, quantità, prezzo; vale ciò che scrivi", async () => {
    apri();
    const descrizione = await screen.findByLabelText("Descrizione della riga");
    fireEvent.change(descrizione, { target: { value: "Opere murarie, primo stato di avanzamento" } });
    fireEvent.change(screen.getByLabelText("Quantità"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Prezzo senza IVA"), { target: { value: "1.000,00" } });
    fireEvent.change(screen.getByLabelText("Aliquota IVA"), { target: { value: "22" } });
    creaFattura();
    expect(righeCreate()).toEqual([expect.objectContaining({ id: "fase:f1", descrizione: "Opere murarie, primo stato di avanzamento", quantita: 2, prezzo_unitario: 1000, aliquota_iva: "22", imponibile: 2000 })]);
  });

  it("si aggiunge una riga vuota e senza descrizione la fattura non parte", async () => {
    apri();
    await screen.findByLabelText("Descrizione della riga");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi riga" }));
    expect(screen.getAllByLabelText("Descrizione della riga")).toHaveLength(2);
    creaFattura();
    expect(mocks.crea).not.toHaveBeenCalled();
    fireEvent.change(screen.getAllByLabelText("Descrizione della riga")[1], { target: { value: "Sopralluogo" } });
    fireEvent.change(screen.getAllByLabelText("Prezzo senza IVA")[1], { target: { value: "100" } });
    creaFattura();
    expect(righeCreate().map((r) => r.descrizione)).toEqual(["Opere murarie — avanzamento lavori 60%", "Sopralluogo"]);
  });

  it("togliere una riga toglie anche la fase", async () => {
    apri();
    fireEvent.click(await screen.findByRole("button", { name: /Togli la riga: Opere murarie/ }));
    await waitFor(() => expect(screen.queryByLabelText("Descrizione della riga")).not.toBeInTheDocument());
  });

  it("commessa già fatturata per intero senza dettaglio: non ripropone i lavori e lo dice", async () => {
    mocks.tabelle.fattura_ordine = [{ fattura_id: "d1", importo_associato: null }];
    mocks.tabelle.documenti_fiscali = [{ id: "d1", tipo: "fattura", stato: "emessa", righe: [{ id: "importo-rata", imponibile: 30000 }], totale_documento: 33000 }];
    apri();
    fireEvent.click(await screen.findByRole("button", { name: "Fasi" }));
    await screen.findByText(/in fatture o bozze senza dettaglio per fase/);
    await waitFor(() => expect(screen.getByLabelText("Importo da fatturare: Opere murarie")).toHaveValue("0,00"));
    expect(screen.getByText(/in fatture o bozze senza dettaglio per fase/)).toBeInTheDocument();
  });

  it("un SAL da fatturare viene prima di tutto, e la fattura si lega alla sua rata", async () => {
    mocks.tabelle.sal_records = [
      { id: "s1", numero_sal: 1, stato: "approvato", importo_totale: 9000, installment_id: "r1", data_emissione: "2026-10-01", sal_voci: [{ descrizione: "Opere", importo_sal: 9000 }] },
    ];
    apri([{ id: "r1", position: 1, type: "installment", label: "SAL 1", amount: 9900, is_paid: false } as unknown as Installment]);
    expect(await screen.findByRole("button", { name: "SAL", pressed: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Crea fattura ·/ })).toHaveTextContent("9.900,00"));
    creaFattura();
    expect(righeCreate()).toEqual([expect.objectContaining({ id: "sal:s1:0", prezzo_unitario: 9000, descrizione: "SAL n. 1 — Opere" })]);
  });

  it("con una rata da fatturare parte da una riga sola, coi lavori scritti per esteso", async () => {
    apri([{ id: "r1", position: 1, type: "deposit", label: "Acconto 30%", amount: 9900, is_paid: false } as unknown as Installment]);
    expect(await screen.findByRole("button", { name: "Un importo", pressed: true })).toBeInTheDocument();
    const righe = await screen.findAllByLabelText("Descrizione della riga");
    expect(righe.map((r) => (r as HTMLTextAreaElement).value)).toEqual(["Acconto 30% — commessa n. ORD-1\nLavori"]);
    creaFattura();
    expect(righeCreate()).toEqual([expect.objectContaining({ id: "importo-rata", prezzo_unitario: 9000, aliquota_iva: "10" })]);
  });

  it("una riga a prezzo 0 è solo testo e resta in fattura", async () => {
    apri();
    await screen.findByLabelText("Quantità");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi riga" }));
    fireEvent.change(screen.getAllByLabelText("Descrizione della riga")[1], { target: { value: "CIG 66636856D1" } });
    creaFattura();
    expect(righeCreate()[1]).toMatchObject({ descrizione: "CIG 66636856D1", prezzo_unitario: 0 });
  });

  it("le fatture in archivio contano nel già fatturato: la proposta si ferma al residuo del contratto", async () => {
    mocks.tabelle.invoices = [{ id: "i1", document_type: "invoice", status: "issued", subtotal: 25000 }];
    apri();
    await apriFasi();
    expect(await screen.findByLabelText("Importo da fatturare: Opere murarie")).toHaveValue("5.000,00");
    expect(screen.getByText(/in fatture o bozze senza dettaglio per fase/)).toHaveTextContent("25.000,00");
  });

  it("una rata già fatturata apre il documento esistente, senza consentire una seconda fattura", async () => {
    const rate = [
      { id: "r1", position: 1, type: "deposit", label: "Acconto", amount: 9900, is_paid: false, documento_fiscale_id: "d1", fattura: { id: "d1", numero: "FT-7", stato: "emessa" } },
      { id: "r2", position: 2, type: "balance", label: "Saldo", amount: 1100, is_paid: false },
    ] as unknown as Installment[];
    apri(rate);
    expect(await screen.findByRole("button", { name: /Saldo/ })).toBeInTheDocument();
    const acconto = screen.getByRole("button", { name: /Acconto.*FT-7/ });
    await waitFor(() => expect(screen.getAllByLabelText("Descrizione della riga")[0]).toHaveValue("Saldo — commessa n. ORD-1\nLavori"));
    fireEvent.click(acconto);
    expect(screen.getByText(/già fatturata con FT-7/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crea fattura ·/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apri fattura" }));
    expect(mocks.crea).not.toHaveBeenCalled();
  });

  it("una fattura con il piano 30/30/40 salva tre scadenze senza registrare incassi", async () => {
    const onApriBozza = vi.fn();
    apri([{ id: "r1", position: 1, type: "deposit", label: "Acconto 30%", amount: 9900, is_paid: false }], null, undefined, onApriBozza);
    expect(await screen.findByLabelText("Descrizione della riga")).toHaveValue("Acconto 30% — commessa n. ORD-1\nLavori");
    fireEvent.click(screen.getByRole("button", { name: "Nessuna rata" }));
    expect(screen.getByLabelText("Descrizione della riga")).toHaveValue("Lavori — commessa n. ORD-1\nLavori");
    fireEvent.change(screen.getByLabelText("Prezzo senza IVA"), { target: { value: "12.000,01" } });
    const pagamento = screen.getByText("Pagamento", { exact: true }).closest("summary");
    expect(pagamento).toBeInTheDocument();
    fireEvent.click(pagamento!);
    fireEvent.click(screen.getByRole("button", { name: "30% / 30% / 40%" }));
    expect(mocks.crea).not.toHaveBeenCalled();
    creaFattura();
    await waitFor(() => expect(onApriBozza).toHaveBeenCalledWith("nuova-fattura"));
    expect(mocks.crea).toHaveBeenCalledTimes(1);
    const bozza = mocks.crea.mock.calls[0][0];
    expect(bozza.scadenze_pagamento).toEqual([
      expect.objectContaining({ numero_rata: 1, importo: 3960, pagato: false }),
      expect.objectContaining({ numero_rata: 2, importo: 3960.01, pagato: false }),
      expect.objectContaining({ numero_rata: 3, importo: 5280, pagato: false }),
    ]);
    const dateScadenze = bozza.scadenze_pagamento.map((rata: { data_scadenza: string }) => rata.data_scadenza);
    expect(bozza.data_scadenza).toBe(dateScadenze[0]);
    expect(Date.parse(dateScadenze[2]) - Date.parse(dateScadenze[0])).toBe(60 * 86_400_000);
    expect(mocks.collega).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("le righe delle fasi non vengono da chi non vede gli importi", async () => {
    mocks.tabelle.order_work_phases = [fase("f1", "Opere murarie", 60, null as unknown as number)];
    apri();
    expect(await screen.findByRole("button", { name: "Un importo", pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fasi" })).not.toBeInTheDocument();
  });
});

it("CHECK-57: una lettura fallita blocca la bozza e non cerca un omonimo", async () => {
  mocks.anagraficaError = { message: "Lettura non disponibile" };
  apri([], "cliente-demo");
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile verificare l’anagrafica");
  expect(screen.getByRole("button", { name: /Crea fattura ·/ })).toBeDisabled();
  expect(mocks.ricercaPerNome).not.toHaveBeenCalled();
  expect(mocks.crea).not.toHaveBeenCalled();
});
it("CHECK-57: un cliente senza anagrafica collegata non viene abbinato per nome", async () => {
  apri([], "cliente-demo");
  await screen.findByText(/Anagrafica fiscale non collegata/);
  await screen.findByLabelText("Descrizione della riga");
  creaFattura();
  expect(mocks.crea.mock.calls[0][0].cliente_snapshot.ragione_sociale).toBe("Mario");
  expect(mocks.crea.mock.calls[0][0].anagrafica_id).toBeUndefined();
  expect(mocks.ricercaPerNome).not.toHaveBeenCalled();
});

it("CHECK-79: distingue una bozza dal fatturato emesso senza riproporre la quota", async () => {
  mocks.tabelle.fattura_ordine = [{ fattura_id: "d1", importo_associato: null }];
  mocks.tabelle.documenti_fiscali = [{ id: "d1", tipo: "fattura", stato: "bozza", righe: [{ id: "importo-rata", imponibile: 30000 }], totale_documento: 33000 }];
  apri();
  fireEvent.click(await screen.findByRole("button", { name: "Fasi" }));
  expect(await screen.findByText(/non sono fatturato emesso/)).toHaveTextContent("30.000,00");
  await waitFor(() => expect(screen.getByLabelText("Importo da fatturare: Opere murarie")).toHaveValue("0,00"));
});


it("il doppio clic attende anche il collegamento alla commessa e crea una sola bozza", async () => {
  let completa!: () => void;
  mocks.collega.mockImplementationOnce(() => new Promise<void>(resolve => { completa = resolve; }));
  apri();
  await screen.findByLabelText("Descrizione della riga");
  const button = screen.getByRole("button", {name:/Crea fattura ·/});
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(mocks.collega).toHaveBeenCalledTimes(1));
  expect(mocks.crea).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  expect(mocks.crea.mock.calls[0][0]).toMatchObject({ordine_id:"o1"});
  completa();
  await waitFor(() => expect(button).not.toBeDisabled());
});


it("SAL successivo: fattura soltanto la quota nuova e la collega alla commessa e alla rata esistenti", async () => {
  mocks.tabelle.sal_records = [
    {id:"s1",numero_sal:1,stato:"approvato",importo_totale:400,installment_id:"r1",sal_voci:[{descrizione:"Opere",importo_sal:400}]},
    {id:"s2",numero_sal:2,stato:"approvato",importo_totale:1000,installment_id:"r2",sal_voci:[{descrizione:"Opere",importo_sal:1000}]},
  ];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const chiaveRate = [...queryKeys.orders.installments("o1"), "quote-v1"];
  client.setQueryData(chiaveRate, [{ id: "r2", documento_fiscale_id: null }]);
  apri([{id:"r1",position:0,type:"deposit",label:"SAL 1",amount:440,is_paid:true,documento_fiscale_id:"precedente"}, {id:"r2",position:1,type:"balance",label:"SAL 2",amount:660,is_paid:false}], null, client);
  await screen.findByRole("button",{name:"SAL",pressed:true});
  await waitFor(()=>expect(screen.getByRole("button",{name:/Crea fattura ·/})).toHaveTextContent("660,00"));
  creaFattura();
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith("collega_rata_fattura",{p_rata_id:"r2",p_documento_id:"nuova-fattura"}));
  expect(client.getQueryState(chiaveRate)?.isInvalidated).toBe(true);
  expect(righeCreate()).toEqual([expect.objectContaining({id:"sal:s2:0",prezzo_unitario:600})]);
  expect(mocks.collega).toHaveBeenCalledWith({fatturaId:"nuova-fattura",ordineId:"o1",companyId:"c1",importoAssociato:660});
  expect(mocks.crea).toHaveBeenCalledTimes(1);
});

it("scegliere un'altra rata SAL compila il suo verbale e mantiene chiaro il passaggio all'importo manuale", async () => {
  mocks.tabelle.sal_records = [
    { id: "s1", numero_sal: 1, stato: "emesso", importo_totale: 400, installment_id: "r1", sal_voci: [{ descrizione: "Opere", importo_sal: 400 }] },
    { id: "s2", numero_sal: 2, stato: "emesso", importo_totale: 1000, installment_id: "r2",
      sal_certificati: { netto: 500 }, sal_voci: [{ descrizione: "Opere", importo_sal: 1000 }] },
  ];
  apri([
    { id: "r1", position: 0, type: "deposit", label: "SAL 1", amount: 440, is_paid: false },
    { id: "r2", position: 1, type: "balance", label: "SAL 2", amount: 550, is_paid: false },
  ]);
  await screen.findByRole("button", { name: "SAL", pressed: true });
  const rata = screen.getByRole("button", { name: /^SAL 2 550,00/ });
  fireEvent.click(rata);
  expect(rata).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "SAL", pressed: true })).toBeVisible();
  expect(screen.getByLabelText("Riepilogo della bozza")).toHaveTextContent("Verbale SAL n. 2");
  expect(screen.getByLabelText("Descrizione della riga")).toHaveValue("Certificato di pagamento n. 2 — SAL n. 2");
  expect(screen.getByRole("button", { name: /Crea fattura · 550,00/ })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Un importo" }));
  expect(rata).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Crea fattura · 550,00/ })).toBeEnabled();
  expect(mocks.crea).not.toHaveBeenCalled();
});

it('una garanzia già compresa nella fattura completa non propone un’altra fattura di svincolo', async()=>{
 mocks.tabelle.ritenute_garanzia=[{id:'garanzia',importo:100,note:'Già compresa nella fattura unica'}];
 mocks.tabelle.fattura_ordine=[{fattura_id:'full',importo_associato:null}];
 mocks.tabelle.documenti_fiscali=[{id:'full',tipo:'fattura',stato:'emessa',righe:[{id:'importo-rata',imponibile:30000}],totale_documento:33000}];
 apri();
 fireEvent.click(await screen.findByRole('button',{name:'Fasi'}));
 await screen.findByText(/in fatture o bozze senza dettaglio per fase/);
 await waitFor(()=>expect(screen.getByLabelText('Importo da fatturare: Opere murarie')).toHaveValue('0,00'));
 fireEvent.click(await screen.findByRole('button',{name:'Un importo'}));
 await screen.findByLabelText('Importo IVA inclusa');
 expect(screen.queryByRole('button',{name:'Fattura lo svincolo'})).toBeNull();
 expect(mocks.crea).not.toHaveBeenCalled();
});
