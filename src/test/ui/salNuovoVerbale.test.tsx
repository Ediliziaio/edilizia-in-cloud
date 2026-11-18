// Il nuovo verbale in un passaggio (10/11/2026, lotto C): rata proposta, voci che cambiano, certificato ed emissione.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  sal: [] as Array<Record<string, unknown>>, salMatura: "emesso" as string,
  update: vi.fn(), sostituisci: vi.fn(), conferma: vi.fn(),
  canEdit:true,vedeImporti:true,readError:false,save:vi.fn(),upsert:vi.fn(),
  fasi: [] as Array<Record<string, unknown>>,
  sottofasi: [] as Array<Record<string, unknown>>, vociCommessa: [] as Array<Record<string, unknown>>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => stato.conferma }));
vi.mock("@/components/shared/PrintPreviewModal", () => ({ PrintPreviewModal: (): null => null }));
vi.mock("@/hooks/useSalMatura", () => ({ useSalMatura: () => stato.salMatura }));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canEditOrders:stato.canEdit,canViewOrderAmounts:stato.vedeImporti,canViewSettingsOrders:false})}));
vi.mock("@/lib/orders/saveSalDraft",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/orders/saveSalDraft")>(),saveSalDraft:stato.save}));
vi.mock("@/hooks/usePianoPagamenti", () => ({ useSostituisciRate: () => ({ mutate: stato.sostituisci, isPending: false }) }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabella === "sal_records" ? stato.sal : tabella === "order_work_phases" ? stato.fasi : tabella === "order_work_subphases" ? stato.sottofasi : tabella === "order_work_phase_voci" ? stato.vociCommessa : [], error: stato.readError?new Error("rete non disponibile"):null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "order", "in", "not", "range"]) lettura[metodo] = () => lettura;
    lettura.upsert = (riga: Record<string, unknown>) => { stato.upsert(tabella, riga); return Promise.resolve({ error: null }); };
    lettura.update = (valori: Record<string, unknown>) => {
      stato.update(tabella, valori);
      const scrittura: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok) };
      scrittura.eq = () => scrittura;
      scrittura.select = () => ({then:(ok:(value:unknown)=>unknown)=>Promise.resolve({data:[{id:"confirmed",...valori}],error:null}).then(ok)});
      return scrittura;
    };
    return lettura;
  };
  return { supabase: { from: costruisci, functions: { invoke: vi.fn() } } };
});

import { SalTab } from "@/components/orders/SalTab";
import type { Installment } from "@/lib/orderUtils";
import { certificatoNelModulo, rataProposta, vociCheCambiano } from "@/lib/orders/salNuovoVerbale";
import { percentualiPrecedenti } from "@/lib/orders/salDaFasi";

const rate = (): Installment[] => [
  { id: "r1", position: 1, label: "SAL 1", type: "deposit", amount: 5000, is_paid: false, trigger_evento: "sal_numero", trigger_numero: 1 },
  { id: "r2", position: 2, label: "SAL 2", type: "deposit", amount: 5000, is_paid: false, trigger_evento: "sal_numero", trigger_numero: 2 },
];
const sal1 = () => ({
  id: "s1", numero_sal: 1, data_emissione: "2026-10-01", stato: "emesso", importo_totale: 4000, note: null as string | null, installment_id: "r1",
  sal_voci: [
    { id: "v1", descrizione: "Demolizioni", importo_contrattuale: 4000, percentuale_avanzamento: 100, importo_sal: 4000, note: null as string | null, fase_id: "f1" },
    { id: "v2", descrizione: "Massetti", importo_contrattuale: 6000, percentuale_avanzamento: 0, importo_sal: 0, note: null as string | null, fase_id: "f2" },
  ],
  sal_certificati: { sal_id: "s1", lavori_contrattuali: 4000, varianti: 0, ritenuta_pct: 5, ritenuta: 200, recupero_anticipazione: 0, altre_detrazioni: 0, acconti_precedenti: 0, netto: 3800 },
});
const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SalTab orderId="o1" companyId="c1" orderTotalAmount={10000} vatRate={10} installments={rate()} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  stato.sal = [sal1()]; stato.salMatura = "emesso"; stato.sottofasi = []; stato.vociCommessa = [];
  stato.fasi = [
    { id: "f1", name: "Demolizioni", status: "completata", percentuale: 100, importo_venduto: 4000 },
    { id: "f2", name: "Massetti", status: "in_corso", percentuale: 50, importo_venduto: 6000 },
  ];
  stato.canEdit = true; stato.vedeImporti = true; stato.readError = false; stato.save.mockResolvedValue({ id: "nuovo-sal" });
  stato.conferma.mockResolvedValue(true);
});
afterEach(cleanup);

describe("Lotto C, i conti", () => {
  it("propone la prima rata «al SAL» ancora libera", () => {
    expect(rataProposta(rate(), [{ numero_sal: 1, installment_id: "r1" }])).toBe("r2");
    expect(rataProposta(rate(), [{ numero_sal: 1, installment_id: "r1" }, { numero_sal: 2, installment_id: "r2" }])).toBe("");
  });

  it("le voci uguali al SAL precedente non si mostrano; senza precedente tutte", () => {
    const prec = percentualiPrecedenti(2, [sal1()]);
    const voci = [
      { descrizione: "Demolizioni", importo_contrattuale: "4000", percentuale_avanzamento: "100", note: "", fase_id: "f1" },
      { descrizione: "Massetti", importo_contrattuale: "6000", percentuale_avanzamento: "50", note: "", fase_id: "f2" },
      { descrizione: "Extra", importo_contrattuale: "100", percentuale_avanzamento: "0", note: "" },
    ];
    expect(vociCheCambiano(voci, prec)).toEqual([false, true, true]);
    expect(vociCheCambiano(voci, percentualiPrecedenti(1, []))).toEqual([true, true, true]);
    // importo vuoto o cambiato da una variante: si vede anche a % ferma
    expect(vociCheCambiano([{ ...voci[0], importo_contrattuale: "" }], prec)).toEqual([true]);
    expect(vociCheCambiano([{ ...voci[0], importo_contrattuale: "4500" }], prec)).toEqual([true]);
  });

  it("certificato: ritenuta del precedente, acconti = quanto restava del precedente, netto che torna", () => {
    const c = certificatoNelModulo({ cumulativo: 7000, precedente: sal1().sal_certificati, giaMaturato: 4000 });
    // 7000 − 5% (350) − acconti 3800 = 2850
    expect([c.ritenuta_pct, c.ritenuta, c.acconti_precedenti, c.netto]).toEqual([5, 350, 3800, 2850]);
    const conDetrazioni = certificatoNelModulo({ cumulativo: 7000, precedente: sal1().sal_certificati, giaMaturato: 4000, ritenutaPct: 10, altreDetrazioni: 100, nota: "penale" });
    expect([conDetrazioni.ritenuta, conDetrazioni.altre_detrazioni, conDetrazioni.netto, conDetrazioni.altre_detrazioni_nota]).toEqual([700, 100, 2400, "penale"]);
  });
});

describe("Lotto C, il modulo", () => {
  it("apre dalle lavorazioni con la rata suggerita e facoltativa", async () => {
    disegna();
    await screen.findByText("SAL #1");
    fireEvent.click(screen.getByRole("button", { name: /Nuovo verbale/ }));
    expect(await screen.findByText(/1 voce è uguale al SAL n\. 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SAL 2 ·.*suggerita/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Nessuna" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByLabelText("Descrizione *", { selector: "#sal-desc-1" })).toHaveValue("Massetti"));
    expect(screen.queryByLabelText("Descrizione *", { selector: "#sal-desc-0" })).toBeNull();
    // 4000 + 50% di 6000 = 7000; ritenuta 5% = 350; acconti 3800 → 2850
    const cert = screen.getByLabelText("Certificato di pagamento", { selector: "dl" });
    expect(cert.textContent).toContain("2.850,00");
    fireEvent.click(screen.getByRole("button", { name: "Controlla riepilogo" }));
    expect(screen.getByLabelText("Calcolo del pagamento del periodo")).toHaveTextContent(/Ritenuta 5% del periodo− 150,00/);
    expect(screen.getByLabelText("Riepilogo economico del verbale")).toHaveTextContent(/Da pagare per questo SAL2.850,00/);
    expect(screen.getByLabelText("Controllo del verbale SAL")).toHaveTextContent(/Rata collegata:\s*Nessuna/);
  });

  it("arrotonda il netto a 100 €: il resto è rinviato al prossimo certificato", async () => {
    disegna();
    await screen.findByText("SAL #1");
    fireEvent.click(screen.getByRole("button", { name: /Nuovo verbale/ }));
    await screen.findByText(/1 voce è uguale/);
    fireEvent.click(screen.getByRole("button", { name: "a 100 €" }));
    const cert = screen.getByLabelText("Certificato di pagamento", { selector: "dl" });
    expect(cert.textContent).toContain("Rinviato al prossimo certificato");
    expect(cert.textContent).toContain("2.800,00");
    fireEvent.click(screen.getByRole("button", { name: "Controlla riepilogo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salva bozza SAL" }));
    await waitFor(() => expect(stato.upsert).toHaveBeenCalledWith("sal_certificati", expect.objectContaining({ netto: 2800, rinviato: 50 })));
  });

  it("un certificato col netto negativo non si salva, e il motivo si legge", async () => {
    disegna();
    await screen.findByText("SAL #1");
    fireEvent.click(screen.getByRole("button", { name: /Nuovo verbale/ }));
    await screen.findByText(/1 voce è uguale/);
    fireEvent.change(screen.getByLabelText("Altre detrazioni (totale a oggi)"), { target: { value: "5000" } });
    expect(screen.getByText(/superano i lavori di questo verbale/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Controlla riepilogo" }));
    expect(await screen.findByRole("button", { name: "Salva bozza SAL" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salva ed emetti" })).toBeDisabled();
  });

  it("«Salva ed emetti»: bozza, certificato e emissione in un passaggio", async () => {
    disegna();
    await screen.findByText("SAL #1");
    fireEvent.click(screen.getByRole("button", { name: "Prepara SAL" }));
    await screen.findByText(/1 voce è uguale/);
    fireEvent.click(screen.getByRole("button", { name: "Controlla riepilogo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salva ed emetti" }));
    await waitFor(() => expect(stato.update).toHaveBeenCalledWith("sal_records", expect.objectContaining({ stato: "emesso" })));
    const salvato = stato.save.mock.calls[0][1];
    expect(salvato).toMatchObject({ number: 2, installmentId: "r2" });
    expect(salvato.lines.map((l: { descrizione: string }) => l.descrizione)).toEqual(["Demolizioni", "Massetti"]);
    expect(stato.upsert).toHaveBeenCalledWith("sal_certificati", expect.objectContaining({ sal_id: "nuovo-sal", netto: 2850, acconti_precedenti: 3800 }));
  });
});

describe("Acconto e ritenuta nel certificato (15/11/2026)", () => {
  it("con un acconto incassato il certificato si accende da sé e ne recupera la parte dei lavori", async () => {
    stato.sal = [];
    const piano: Installment[] = [
      { id: "a0", position: 0, label: "Acconto alla firma", type: "deposit", amount: 2200, is_paid: true, trigger_evento: "firma_contratto" },
      ...rate(),
    ];
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SalTab orderId="o1" companyId="c1" orderTotalAmount={10000} vatRate={10} installments={piano} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Crea verbale/ }));
    // Voci: 4000 + 50% di 6000 = 7000. Acconto 2000 senza IVA su 10.000: recupero 1.400. Nessuna ritenuta concordata.
    const cert = await screen.findByLabelText("Certificato di pagamento", { selector: "dl" });
    await waitFor(() => expect(cert.textContent).toContain("5.600,00"));
    expect(cert.textContent).toContain("Recupero anticipazione");
    expect(screen.getByText(/Acconto già fatturato o incassato/)).toBeInTheDocument();
    expect(screen.getByText(/non dice una ritenuta di garanzia/)).toBeInTheDocument();
  });
});

describe("SAL di chi ha «Venduto e importi» (15/11/2026)", () => {
  it("senza il diritto si vedono i verbali con le percentuali, senza importi né pulsanti per farli", async () => {
    stato.vedeImporti = false;
    stato.sal = [{ ...sal1(), importo_totale: null, sal_certificati: null, sal_voci: sal1().sal_voci.map((v) => ({ ...v, importo_contrattuale: null as number | null, importo_sal: null as number | null })) }];
    disegna();
    await screen.findByText("SAL #1");
    expect(screen.getByRole("note").textContent).toContain("Venduto e importi");
    expect(screen.queryByRole("button", { name: /Nuovo verbale/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Prepara SAL/ })).toBeNull();
    expect(screen.queryByLabelText("Riepilogo dei SAL")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Voci del verbale/ }));
    expect(within(screen.getByRole("table")).getByText("100%")).toBeVisible();
  });
});

it('mostra subito quota nuova e avverte se le fasi superano il contratto', async () => {
  stato.fasi[1].importo_venduto = 20000;
  disegna(); await screen.findByText('SAL #1');
  fireEvent.click(screen.getByRole('button', { name: /Nuovo verbale/ }));
  await waitFor(() => expect(screen.getByLabelText('Riepilogo economico del verbale')).toHaveTextContent('14.000,00'));
  const summary = screen.getByLabelText('Riepilogo economico del verbale');
  expect(summary).toHaveTextContent('4.000,00');
  expect(summary).toHaveTextContent('10.000,00');
  expect(screen.getByRole('alert')).toHaveTextContent('in più rispetto al contratto netto');
  expect(screen.getByRole('button', { name: /SAL 1 ·/ })).toHaveAttribute('title', 'Già collegata al SAL n. 1');
  expect(stato.save).not.toHaveBeenCalled();
});

it('navigare e cercare nelle fasi non esclude dal riepilogo né dal salvataggio le voci nascoste', async () => {
  disegna(); await screen.findByText('SAL #1');
  fireEvent.click(screen.getByRole('button', { name: /Nuovo verbale/ }));
  await screen.findByText(/1 voce è uguale/);
  const summary = screen.getByLabelText('Riepilogo economico del verbale');
  expect(summary).toHaveTextContent('7.000,00');
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Fasi del verbale' })).getByRole('button', { name: /Demolizioni/ }));
  expect(screen.getByLabelText('Descrizione *')).toHaveValue('Demolizioni');
  fireEvent.change(screen.getByRole('textbox', { name: 'Cerca nelle fasi e nelle voci del SAL' }), { target: { value: 'inesistente' } });
  expect(screen.getByText(/Nessuna voce in questa vista/)).toBeInTheDocument();
  expect(summary).toHaveTextContent('7.000,00');
  fireEvent.click(screen.getByRole('button', { name: 'Controlla riepilogo' }));
  const review = screen.getByRole('region', { name: 'Controllo del verbale SAL' });
  expect(review).toHaveTextContent('Demolizioni'); expect(review).toHaveTextContent('Massetti');
  expect(within(review).queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Salva bozza SAL' }));
  await waitFor(() => expect(stato.save).toHaveBeenCalledTimes(1));
  expect(stato.save.mock.calls[0][1].lines.map((v: { descrizione: string }) => v.descrizione)).toEqual(['Demolizioni', 'Massetti']);
});

it('una variante non riscrive il saldo già ripartito sulla fattura unica', async () => {
  stato.sal = [];
  const piano: Installment[] = [
    { id: 'a', position: 1, label: 'Acconto 30%', type: 'deposit', amount: 300, is_paid: true, documento_fiscale_id: 'fattura', documento_quota_lorda: 300 },
    { id: 's', position: 2, label: 'SAL 40%', type: 'deposit', amount: 400, is_paid: true, documento_fiscale_id: 'fattura', documento_quota_lorda: 400 },
    { id: 'b', position: 3, label: 'Saldo 30%', type: 'balance', amount: 300, is_paid: true, documento_fiscale_id: 'fattura', documento_quota_lorda: 300 },
  ];
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SalTab orderId="o1" companyId="c1" orderTotalAmount={1109.09} vatRate={10} installments={piano} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /Crea verbale/ }));
  fireEvent.click(screen.getByText('Pagamento, ritenute e note'));
  expect(screen.getByRole('button', { name: /Saldo 30% · 300,00/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Saldo 30% · 520,00/ })).toBeNull();
  expect(stato.save).not.toHaveBeenCalled(); expect(stato.sostituisci).not.toHaveBeenCalled();
});

it('riapre le voci al controllo se un campo non valido è nascosto da ricerca o fase selezionata', async () => {
  disegna(); await screen.findByText('SAL #1'); fireEvent.click(screen.getByRole('button', { name: /Nuovo verbale/ }));
  await screen.findByText(/1 voce è uguale/);
  fireEvent.change(screen.getByLabelText('Importo contrattuale netto (€)'), {target:{value:''}});
  fireEvent.change(screen.getByRole('textbox', {name:'Cerca nelle fasi e nelle voci del SAL'}), {target:{value:'nessun risultato'}});
  fireEvent.click(screen.getByRole('button', {name:'Controlla riepilogo'}));
  expect(screen.getByRole('alert')).toHaveTextContent('Voce 2');
  expect(screen.getByLabelText('Importo contrattuale netto (€)', {selector:'#sal-amount-1'})).toBeVisible();
  expect(stato.save).not.toHaveBeenCalled();
});

it('aggiorna quantità, percentuale pesata e netto insieme, conservando il dettaglio da stampare', async () => {
  stato.sal = [];
  stato.sottofasi = [
    {id:'sf1',phase_id:'f2',name:'Posa massetto',position:1,peso:1,fatta:false,percentuale:25,quantita_fatta:5},
    {id:'sf2',phase_id:'f2',name:'Finitura massetto',position:2,peso:1,fatta:false,percentuale:0,quantita_fatta:0},
  ];
  stato.vociCommessa = [
    {phase_id:'f2',subphase_id:'sf1',quantita:20,unita:'m²',importo:4000},
    {phase_id:'f2',subphase_id:'sf2',quantita:20,unita:'m²',importo:2000},
  ];
  disegna(); fireEvent.click(await screen.findByRole('button', {name:/Crea verbale/}));
  const qty = await screen.findByRole('textbox', {name:'Quantità a oggi di Posa massetto'});
  expect(qty).toHaveValue('5');
  fireEvent.change(qty, {target:{value:'10'}});
  expect(screen.getByRole('textbox', {name:'Avanzamento di Posa massetto'})).toHaveValue('50');
  expect(screen.getByRole('textbox', {name:'Avanzamento di Posa massetto'})).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Avanzamento cumulativo (%)', {selector:'#sal-pct-1'})).toHaveValue('33.33');
  // 4.000 demolizioni + 33,33% di 6.000 massetti. Arrotondamento per fase identico al DB.
  expect(screen.getByLabelText('Riepilogo economico del verbale')).toHaveTextContent('5.999,80');
  fireEvent.click(screen.getByRole('button', {name:'Controlla riepilogo'}));
  fireEvent.click(screen.getByRole('button', {name:'Salva bozza SAL'}));
  await waitFor(() => expect(stato.save).toHaveBeenCalledTimes(1));
  expect(stato.save.mock.calls[0][1].lines[1].sottofasi[0]).toMatchObject({sottofase_id:'sf1',quantita_a_oggi:'10',percentuale_avanzamento:'50'});
  expect(stato.sostituisci).not.toHaveBeenCalled();
});

it('per una voce a corpo si compila solo la percentuale, senza un secondo campo quantità', async () => {
  stato.sal = [];
  stato.sottofasi = [{id:'sf1',phase_id:'f2',name:'Massetto a corpo',position:1,peso:1,fatta:false,percentuale:0,quantita_fatta:0}];
  stato.vociCommessa = [{phase_id:'f2',subphase_id:'sf1',quantita:1,unita:'a corpo',importo:6000}];
  disegna(); fireEvent.click(await screen.findByRole('button', {name:/Crea verbale/}));
  const progress = await screen.findByRole('textbox', {name:'Avanzamento di Massetto a corpo'});
  expect(progress).not.toHaveAttribute('readonly');
  expect(screen.queryByRole('textbox', {name:'Quantità a oggi di Massetto a corpo'})).toBeNull();
  fireEvent.change(progress, {target:{value:'50'}});
  expect(screen.getByLabelText('Riepilogo economico del verbale')).toHaveTextContent('7.000,00');
  fireEvent.click(screen.getByRole('button', {name:'Controlla riepilogo'}));
  fireEvent.click(screen.getByRole('button', {name:'Salva bozza SAL'}));
  await waitFor(() => expect(stato.save).toHaveBeenCalledTimes(1));
  expect(stato.save.mock.calls[0][1].lines[1].sottofasi[0]).toMatchObject({quantita_a_oggi:'0.5',percentuale_avanzamento:'50'});
});

it('aggiungere una voce da una fase filtrata rende subito visibile la nuova riga', async () => {
  disegna(); await screen.findByText('SAL #1'); fireEvent.click(screen.getByRole('button', {name:/Nuovo verbale/}));
  await screen.findByText(/1 voce è uguale/);
  fireEvent.click(within(screen.getByRole('navigation', {name:'Fasi del verbale'})).getByRole('button', {name:/Massetti/}));
  fireEvent.change(screen.getByRole('textbox', {name:'Cerca nelle fasi e nelle voci del SAL'}), {target:{value:'massetti'}});
  fireEvent.click(screen.getByRole('button', {name:'Aggiungi voce'}));
  expect(screen.getByLabelText('Descrizione *', {selector:'#sal-desc-2'})).toBeVisible();
  expect(screen.getByRole('textbox', {name:'Cerca nelle fasi e nelle voci del SAL'})).toHaveValue('');
  expect(screen.getByLabelText('Riepilogo economico del verbale')).toHaveTextContent('7.000,00');
  expect(stato.save).not.toHaveBeenCalled();
});
