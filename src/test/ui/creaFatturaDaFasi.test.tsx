import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreaFatturaDialog } from "@/components/orders/CreaFatturaDialog";
import type { Installment } from "@/lib/orderUtils";

type Righe = Array<Record<string, unknown>>;
const mocks = vi.hoisted(() => ({
  tabelle: {} as Record<string, unknown[]>,
  crea: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const costruttore = (tabella: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "in", "or"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: null as unknown, error: null as unknown });
    q.then = (ok: (v: unknown) => unknown) => ok({ data: mocks.tabelle[tabella] ?? [], error: null });
    return q;
  };
  return { supabase: { from: costruttore, rpc: vi.fn(async () => ({ error: null })) } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/hooks/useDocumentiFiscali", () => ({ useCreateDocumento: () => ({ mutate: mocks.crea, isPending: false }) }));
vi.mock("@/hooks/billing/useFatturaOrdineLink", () => ({ useLinkFatturaOrdine: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: { iban_principale: "IT60X0542811101000000123456" } }) }));
vi.mock("@/hooks/useBonusFiscaliFlags", () => ({ useBonusFiscaliFlags: () => ({ bonusMultipli: false }) }));
vi.mock("@/components/fatturazione/PreviewFattura", () => ({ PreviewFattura: (): null => null }));

const apri = (installments: Installment[] = []) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <CreaFatturaDialog open onOpenChange={vi.fn()} orderId="o1" orderCode="ORD-1" orderDescription="Lavori" totalAmount={30000} vatRate={10} customerId={null} customerName="Mario" installments={installments} />
    </MemoryRouter>
  </QueryClientProvider>,
);
const fase = (id: string, name: string, percentuale: number, importo_venduto: number) => ({ id, name, status: "in_corso", percentuale, importo_venduto });
const righeCreate = () => (mocks.crea.mock.calls[0][0] as { righe: Righe }).righe;
/** Il riquadro delle fasi si apre dalla scelta già attiva. */
const apriFasi = async () => { fireEvent.click(await screen.findByRole("button", { name: "Fasi", pressed: true })); };
const creaFattura = () => fireEvent.click(screen.getByRole("button", { name: /Crea fattura ·/ }));

beforeEach(() => {
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
    await screen.findByText(/fatturati senza dettaglio per fase/);
    await waitFor(() => expect(screen.getByLabelText("Importo da fatturare: Opere murarie")).toHaveValue("0,00"));
    expect(screen.getByText(/fatturati senza dettaglio per fase/)).toBeInTheDocument();
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

  it("le righe delle fasi non vengono da chi non vede gli importi", async () => {
    mocks.tabelle.order_work_phases = [fase("f1", "Opere murarie", 60, null as unknown as number)];
    apri();
    expect(await screen.findByRole("button", { name: "Un importo", pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fasi" })).not.toBeInTheDocument();
  });
});
