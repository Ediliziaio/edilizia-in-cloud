import { esempioPdfPos } from "../fixtures/posEsempioPdf";
/**
 * L'editor del POS disegnato davvero: le undici sezioni del modello, la
 * completezza, «Approva» che su un POS incompleto mostra le voci mancanti
 * invece di chiamare il server, un POS approvato in sola lettura con «Nuova
 * revisione», e una scheda proposta dall'AI che chiede la conferma.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { nuovaDaSchedaStandard, SCHEDE_STANDARD_POS } from "../../../supabase/functions/_shared/posSchedeStandard";
import { lavorazioneVuota, posVuoto, type PosContenuto } from "../../../supabase/functions/_shared/posModello";

// In JSDOM le prove con più passaggi ridisegnano tutte le sezioni dell’editor.
vi.setConfig({ testTimeout: 15_000 });

const stato = vi.hoisted(() => ({
  errore: null as Error | null,
  puoLeggereComputo: false,
  leggiComputo: vi.fn(),
  fasiExtra: [] as Array<{ id: string; name: string }>,
  pos: null as unknown,
  sceltaPscDaConfermare: false,
  approva: vi.fn(),
  salva: vi.fn(),
  // l'avanzamento del PDF: approvazione e anteprima
  approvaInCorso: false,
  fase: null as string | null,
  annulla: vi.fn(),
  anteprimaInCorso: false,
  apriAnteprima: vi.fn(),
}));

const pscDellaProva = () => (stato.pos as { contenuto?: PosContenuto } | null)?.contenuto?.procedure_psc.documento;
vi.mock("../../../supabase/functions/_shared/posComputo", () => ({
  leggiComputoPerPos: stato.leggiComputo,
}));
vi.mock("@/components/sicurezza/pos/AnteprimaBozzaPos", () => ({
  AnteprimaBozzaPos: ({ contenuto }: { contenuto: PosContenuto }) => <output>{contenuto.impresa.datore_lavoro}</output>,
}));
vi.mock("@/hooks/usePscCommessa", () => ({
  usePscCommessa: () => ({ data: pscDellaProva() ? [{ ...pscDellaProva(), created_at: "" }] : [], isPending: false, isError: false, isFetching: false, refetch: vi.fn() }),
  identificaPsc: vi.fn(),
}));
vi.mock("@/hooks/useAvvioSicurezza", () => ({
  useAvvioSicurezza: () => ({ isLoading: false, isError: false, data: stato.sceltaPscDaConfermare ? null : {
    stato: pscDellaProva() ? "previsto" : "non_previsto", psc: pscDellaProva() ?? null, motivazione: "Verifica dimostrativa", versione: "v1",
  } }),
  useSalvaAvvioSicurezza: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/components/sicurezza/pos/ProdottiLavorazionePos",()=>({ProdottiLavorazionePos:(): null =>null}));
vi.mock("@/lib/sicurezza/apriPdfPos",()=>({apriAnteprimaPos:vi.fn()}));
vi.mock("@/hooks/useAnteprimaPos",()=>({useAnteprimaPos:()=>({apri:stato.apriAnteprima,inCorso:stato.anteprimaInCorso,fase:stato.anteprimaInCorso?stato.fase:null,annulla:stato.annulla})}));
// L'invio per e-mail ha i suoi test (posInvio.test.tsx): qui basta che il pulsante non pretenda un utente collegato.
vi.mock("@/components/sicurezza/pos/InvioPos",()=>({InvioPos:(p:{tipo:string;emissioneId:string|null})=><button type="button" data-testid={`invio-${p.tipo}`} disabled={!p.emissioneId}>Invia</button>,useIncaricoCse:()=>({data:null as null})}));
// Anche la copia firmata ha i suoi test (posCopiaFirmata.test.tsx).
vi.mock("@/components/sicurezza/pos/CopiaFirmataPos",()=>({CopiaFirmataSezione:():null=>null}));
vi.mock("@/hooks/useEmissioniPos",()=>({
 useEmissioniPos:()=>({data:[] as never[],isLoading:false,isError:false}),
 useContenutiPerEmissione:()=>({data:[] as never[],isLoading:false,isError:false}),
 usePreparaEmissione:()=>({mutate:vi.fn(),isPending:false}),
 apriEmissionePos:vi.fn(),
}));
vi.mock("@/hooks/usePos", () => {
  const mut = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  class ErrorePos extends Error {
    constructor(m: string, readonly mancanti: unknown[] = []) { super(m); }
  }
  return {
    ErrorePos,
    chiaveDatiAppPos: (azienda: string, id: string) => ["pos-dati-app", azienda, id],
    usePos: () => ({ data: stato.pos, isLoading: false, error: stato.errore, refetch: vi.fn() }),
    useSalvaPos: () => ({mutate:stato.salva,mutateAsync:stato.salva,isPending:false}),
    useApprovaPos: () => ({ mutate: vi.fn(), mutateAsync: stato.approva, isPending: stato.approvaInCorso, fase: stato.approvaInCorso ? stato.fase : null, annulla: stato.annulla }),
    useNuovaRevisione: mut,
    datiAppPos: vi.fn(() => new Promise(() => {})),
    lavorazioniAiPos: vi.fn(),
    chiamaServerPos: vi.fn().mockResolvedValue({ lettura: null }),
    caricaAllegatoPos: vi.fn(),
    linkAllegatoPos: vi.fn(),
  };
});
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewSicurezzaCantiere: true, isAdmin: true, solaLettura: false, canViewOrders: stato.puoLeggereComputo }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));

import { chiamaServerPos, datiAppPos, lavorazioniAiPos } from "@/hooks/usePos";
import PosEditor from "@/pages/azienda/sicurezza/PosEditor";

vi.mock("@/hooks/useFascicoloCantiere", () => ({
  useFasiFascicolo: () => ({ data: [{ id: "fase-demo", name: "Preparazione del cantiere" }, ...stato.fasiExtra], isError: false }),
  useCommesseFascicolo: () => ({ data: [] as never[], isLoading: false, isError: false }),
}));

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  if (!("structuredClone" in globalThis)) {
    (globalThis as unknown as { structuredClone: unknown }).structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
  }
});
afterEach(() => { cleanup(); stato.errore = null; stato.puoLeggereComputo = false; stato.leggiComputo.mockReset(); stato.fasiExtra = []; stato.sceltaPscDaConfermare = false; stato.approva.mockReset(); stato.salva.mockReset(); stato.approvaInCorso = false; stato.anteprimaInCorso = false; stato.fase = null; stato.annulla.mockReset(); stato.apriAnteprima.mockReset(); vi.mocked(lavorazioniAiPos).mockReset(); vi.mocked(datiAppPos).mockImplementation(() => new Promise(() => {})); vi.mocked(chiamaServerPos).mockReset().mockResolvedValue({ lettura: null }); });

function riga(contenuto: PosContenuto, status = "bozza") {
  // The complete fixture now includes a declared PSC original; this suite exercises save concurrency, not source verification.
  if(contenuto.procedure_psc.psc_presente)contenuto={...contenuto,versione_psc:1,procedure_psc:{...contenuto.procedure_psc,documento:{archivio:"sicurezza_documenti",id:"psc-fixture",company_id:"az-1",order_id:"ord-1",titolo:"PSC sintetico per test",file_name:"psc.pdf",file_path:"az-1/documenti/ord-1/psc.pdf",data_documento:"2026-10-27",revisione:"02",sha256:"a".repeat(64)}}};
  if(status==="bozza") contenuto={...contenuto,versione_prodotti:1,lavorazioni:contenuto.lavorazioni.map(l=>({...l,prodotti_riesaminati:true}))};
  return {
    id: "pos-1", company_id: "az-1", order_id: "ord-1", status, revisione: status === "approvato" ? 1 : 0,
    revisioni: [{ rev: 0, data: "2026-09-24", descrizione: "Prima emissione" }], contenuto, daCompilare: false, iter: {},
    approvato_da_nome: status === "approvato" ? "Mario Rossi" : null, approvato_il: status === "approvato" ? "2026-09-24T10:00:00Z" : null,
    created_at: "2026-09-24T09:00:00Z", updated_at: "2026-09-24T09:00:00Z",
    commessa: { order_code: "ORD-2026-029", description: "Cappotto termico" },
  };
}

function mostra(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const albero=()=> <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/azienda/sicurezza-cantiere/pos/pos-1"]}>
        <Routes><Route path="/azienda/sicurezza-cantiere/pos/:id" element={<PosEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>;
  const view=render(albero());return {...view,aggiorna:()=>view.rerender(albero())};
}

describe("editor del POS", () => {
  it("la guida apre il primo campo, aggiorna il conteggio e raggiunge una scheda chiusa dall’elenco", async () => {
    const contenuto = posVuoto();
    contenuto.lavorazioni = [
      { ...lavorazioneVuota("l1"), titolo: "Prima scheda" },
      { ...lavorazioneVuota("l2"), titolo: "Seconda scheda" },
    ];
    stato.pos = riga(contenuto);
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Prepara la bozza POS" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Prepara la bozza POS" })).getByRole("button", { name: "Vai alla verifica" }));
    const committente = screen.getByLabelText("Committente: cognome e nome o ragione sociale");
    await waitFor(() => expect(committente).toHaveFocus(), { timeout: 4000 });
    const guida = within(screen.getByRole("region", { name: "Compilazione guidata del POS" }));
    const totaleIniziale = Number(guida.getByText(/^\d+ voci da completare$/).textContent?.split(" ")[0]);
    fireEvent.change(committente, { target: { value: "Committente Demo" } });
    expect(guida.getByText(`${totaleIniziale - 1} voci da completare`)).toBeInTheDocument();
    fireEvent.click(guida.getByRole("button", { name: "Prossima voce" }));
    await waitFor(() => expect(screen.getByLabelText("Committente: indirizzo")).toHaveFocus(), { timeout: 4000 });
    expect(screen.getByRole("button", { name: "Apri la lavorazione 2" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(guida.getByRole("button", { name: "Elenco" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lavorazione «Seconda scheda»: descrizione/ }));
    await waitFor(() => expect(document.getElementById("lv-1-descrizione")).toHaveFocus(), { timeout: 4000 });
    expect(screen.getByRole("button", { name: "Chiudi la lavorazione 2" })).toHaveAttribute("aria-expanded", "true");
    expect(stato.salva).not.toHaveBeenCalled();
  });

  it("prepara dati e testi da un solo passaggio, aggiunge solo le fasi confermate e verifica la bozza aggiornata", async () => {
    const contenuto = posVuoto();
    contenuto.impresa.sede_legale.telefono = "02123456";
    contenuto.lavorazioni = [{
      ...lavorazioneVuota("serramenti"), titolo: "Posa serramenti", fase_id: "fase-serramenti", descrizione: "Tre finestre sul cortile.",
    }];
    const originale = riga(contenuto);
    const fonte = posVuoto();
    fonte.opera.committente.nominativo = "Committente Demo";
    fonte.impresa.sede_legale.indirizzo = "Via proposta";
    stato.pos = originale;
    stato.fasiExtra = [
      { id: "fase-serramenti", name: "Posa serramenti" },
      { id: "fase-cartongesso", name: "Posa cartongesso" },
    ];
    stato.salva.mockResolvedValue(originale);
    vi.mocked(datiAppPos).mockResolvedValue({ contenuto: fonte, contesto: { avvisi: [], mezzi: [], subappaltatori: [] } });
    mostra();
    const apri = screen.getByRole("button", { name: "Prepara la bozza POS" });
    fireEvent.click(apri);
    let preparazione = within(screen.getByRole("dialog", { name: "Prepara la bozza POS" }));
    expect(await preparazione.findByRole("checkbox", { name: "Committente" })).toBeChecked();
    expect(preparazione.queryByRole("checkbox", { name: "Sede legale" })).toBeNull();
    expect(preparazione.getByRole("checkbox", { name: "Posa serramenti" })).toBeChecked();
    expect(preparazione.getAllByRole("checkbox", { name: "Posa serramenti" })).toHaveLength(1);
    const cartongesso = preparazione.getByRole("checkbox", { name: "Posa cartongesso" });
    expect(cartongesso).not.toBeChecked();
    fireEvent.click(cartongesso);
    fireEvent.click(preparazione.getByRole("button", { name: "Annulla" }));
    expect(await screen.findByLabelText("Committente: cognome e nome o ragione sociale")).toHaveValue("");
    expect(screen.queryByDisplayValue("Posa cartongesso")).toBeNull();
    fireEvent.click(apri);
    preparazione = within(screen.getByRole("dialog", { name: "Prepara la bozza POS" }));
    expect(preparazione.getByRole("checkbox", { name: "Posa cartongesso" })).not.toBeChecked();
    fireEvent.click(preparazione.getByRole("checkbox", { name: "Posa cartongesso" }));
    fireEvent.click(preparazione.getByRole("button", { name: "Applica e vai alla verifica" }));
    await waitFor(() => expect(screen.getByLabelText("Committente: indirizzo")).toHaveFocus(), { timeout: 4000 });
    expect(screen.getByLabelText("Committente: cognome e nome o ragione sociale")).toHaveValue("Committente Demo");
    expect(lavorazioniAiPos).not.toHaveBeenCalled();
    expect(stato.salva).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.salva.mock.lastCall?.[0].contenuto).toMatchObject({
      impresa: { sede_legale: { telefono: "02123456", indirizzo: "" } },
      lavorazioni: [
        { id: "serramenti", descrizione: "Tre finestre sul cortile.", modalita: expect.stringContaining("Confermare vani, pesi"), verificata: false },
        { titolo: "Posa cartongesso", fase_id: "fase-cartongesso", fonti_scheda: { standard: expect.any(Object) }, verificata: false },
      ],
    }));
  });

  it("compila solo i campi di risorsa vuoti e le lavorazioni selezionate", async () => {
    const contenuto = posVuoto();
    contenuto.lavorazioni = [
      { ...lavorazioneVuota("l1"), titolo: "Posa interna", macchine: "Trapano" },
      { ...lavorazioneVuota("l2"), titolo: "Intervento manuale" },
      { ...lavorazioneVuota("l3"), titolo: "Intervento da verificare" },
    ];
    const originale = riga(contenuto);
    stato.pos = originale;
    stato.salva.mockResolvedValue(originale);
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Risorse non previste" }));
    const dialogo = within(screen.getByRole("dialog", { name: "Dichiara le risorse non previste" }));
    expect(dialogo.getByRole("button", { name: "Compila 0 campi" })).toBeDisabled();
    for (const nome of ["Posa interna", "Intervento manuale", "Macchine e attrezzature", "Impianti"]) {
      fireEvent.click(dialogo.getByRole("checkbox", { name: nome }));
    }
    fireEvent.click(dialogo.getByRole("button", { name: "Compila 3 campi" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.salva).toHaveBeenCalledOnce());
    expect(stato.salva.mock.lastCall?.[0].contenuto.lavorazioni).toMatchObject([
      { macchine: "Trapano", impianti: "Nessuno", sostanze: "" },
      { macchine: "Nessuna", impianti: "Nessuno", sostanze: "" },
      { macchine: "", impianti: "", sostanze: "" },
    ]);
    expect(stato.approva).not.toHaveBeenCalled();
  });

  it('il confronto aggiorna soltanto la bozza e richiede ancora Salva',async()=>{
    const contenuto=posVuoto();stato.pos=riga(contenuto);const fonte=posVuoto();fonte.impresa.datore_lavoro='Datore aggiornato';vi.mocked(datiAppPos).mockResolvedValue({contenuto:fonte,contesto:{avvisi:[],mezzi:[],subappaltatori:[]}});mostra();fireEvent.click(screen.getByRole('button',{name:'Confronta dati dell’app'}));fireEvent.click(await screen.findByRole('checkbox',{name:'Sostituisci Datore di lavoro'}));fireEvent.click(screen.getByRole('button',{name:'Applica alla bozza (1)'}));expect((screen.getByLabelText('Datore di lavoro') as HTMLInputElement).value).toBe('Datore aggiornato');expect(stato.salva).not.toHaveBeenCalled();expect(stato.approva).not.toHaveBeenCalled();expect(screen.getByText('Modifiche non salvate')).toBeTruthy();
  });

  it("mostra le sezioni del modello e blocca l'approvazione di un POS incompleto", () => {
    stato.pos = riga(posVuoto());
    mostra();
    expect(screen.getByRole("heading", { name: "Piano Operativo di Sicurezza" })).toBeTruthy();
    for (const titolo of ["Opera, committente e cantiere", "Dati identificativi dell'impresa", "Lavorazioni svolte in cantiere", "Firme e consegna"]) {
      expect(screen.getByRole("heading", { name: new RegExp(titolo) })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: /Approva/ }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(/Nominativo del datore di lavoro/)).toBeTruthy();
    expect(stato.approva).not.toHaveBeenCalled();
  });

  it("un POS approvato si legge soltanto e offre la nuova revisione", () => {
    stato.pos = riga(posVuoto(), "approvato");
    mostra();
    expect(screen.queryByRole("button", { name: /^Approva$/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Nuova revisione/ })).toBeTruthy();
    expect((screen.getByLabelText("Datore di lavoro") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/da Mario Rossi il 24\/09\/2026/)).toBeTruthy();
  });

  it("una scheda proposta dall'AI chiede la conferma, e scrivere segna le modifiche da salvare", () => {
    const p = posVuoto();
    p.lavorazioni = [{ ...lavorazioneVuota("ai-1"), titolo: "Montaggio ponteggio", origine: "ai", verificata: false }];
    stato.pos = riga(p);
    mostra();
    expect(screen.getByText("Proposta dall'AI")).toBeTruthy();
    expect(screen.getByText(/Ho letto questa scheda/)).toBeTruthy();
    expect(screen.queryByText("Modifiche non salvate")).toBeNull();
    fireEvent.change(screen.getByLabelText("Datore di lavoro"), { target: { value: "Mario Rossi" } });
    expect(screen.getByText("Modifiche non salvate")).toBeTruthy();
  });
});


describe('Verifica umana della formazione',()=>{
  it('richiede una conferma esplicita e la azzera quando cambia una voce',()=>{
    const p=posVuoto();
    p.formazione=[{nominativo:'Operaio Prova',qualifica:'Operaio',base:true,rischi_specifici:true,rischi_cantiere:false,dpi_terza_categoria:false,altro:'',attestati:'Attestato sintetico',verificata:false,riferimento_addetto:{tipo:'hr',id:'hr-test'}}];
    stato.pos=riga(p);
    mostra();
    const conferma=screen.getByRole('checkbox',{name:/Ho controllato i documenti/});
    expect(conferma).toHaveAttribute('aria-checked','false');
    fireEvent.click(conferma);
    expect(conferma).toHaveAttribute('aria-checked','true');
    fireEvent.change(screen.getByLabelText('Lavoratore'),{target:{value:'Operaio Corretto'}});
    expect(conferma).toHaveAttribute('aria-checked','false');
    expect(screen.queryByText(/Attestati nell.app: Attestato sintetico/)).toBeNull();
    expect(screen.getByText(/Riga senza collegamento HR univoco/)).toBeTruthy();
    expect(screen.getByRole('checkbox',{name:'Base'})).toHaveAttribute('aria-checked','false');
  });
});

describe('Conferma di una lavorazione riutilizzata',()=>{
  it('la richiede di nuovo dopo una modifica del testo',()=>{
    const p=posVuoto();
    p.lavorazioni=[{...lavorazioneVuota('modello-1'),titolo:'Posa',origine:'modello',verificata:true}];
    stato.pos=riga(p);mostra();
    const conferma=screen.getByRole('checkbox',{name:/Ho letto questa scheda/});
    expect(conferma).toHaveAttribute('aria-checked','true');
    expect(screen.getByText('Riuso confermato')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Titolo della lavorazione 1'),{target:{value:'Posa adattata'}});
    expect(conferma).toHaveAttribute('aria-checked','false');
    expect(screen.getByText('Da adattare al cantiere')).toBeTruthy();
  });
});

describe('Bozze precedenti e controllo tecnico aggiornato',()=>{
  it('propone il riesame prodotti di una bozza precedente senza cambiare il record salvato',()=>{
    const p=posVuoto();p.lavorazioni=[{...lavorazioneVuota('l1'),sostanze:'Sigillante'}];stato.pos={...riga(p),contenuto:p};mostra();expect(screen.getByText(/Controlli aggiornati proposti/)).toBeTruthy();expect(screen.getByText('Modifiche non salvate')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Approva e prepara PDF'}));expect(screen.getByText(/identifica i singoli prodotti/)).toBeTruthy();expect(stato.salva).not.toHaveBeenCalled();expect(stato.approva).not.toHaveBeenCalled();expect((stato.pos as {contenuto:PosContenuto}).contenuto.versione_prodotti).toBeUndefined();fireEvent.click(screen.getByRole('button',{name:'Chiudi'}));fireEvent.click(screen.getByRole('button',{name:'Annulla'}));expect(screen.getByText('Modifiche non salvate')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Approva e prepara PDF'}));expect(screen.getByText(/identifica i singoli prodotti/)).toBeTruthy();expect(stato.approva).not.toHaveBeenCalled();
  });

  it('propone i controlli v2 senza salvare automaticamente e richiede la verifica della formazione',()=>{
    const p=posVuoto();p.versione_controlli=1;p.formazione=[{nominativo:'Operaio Precedente',qualifica:'Operaio',base:true,verificata:false,rischi_specifici:true,rischi_cantiere:true,dpi_terza_categoria:false,altro:'',attestati:''}];
    stato.pos=riga(p);mostra();expect(screen.getByText(/Controlli aggiornati proposti/)).toBeTruthy();expect(screen.getByText('Modifiche non salvate')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/Approva e prepara/}));
    expect(screen.getByText('Documenti e pertinenza della formazione da verificare per: Operaio Precedente')).toBeTruthy();expect(stato.approva).not.toHaveBeenCalled();
  });
  it('mantiene inalterato il contenuto storico già approvato con i controlli precedenti',()=>{
    const p=posVuoto();p.versione_controlli=1;stato.pos=riga(p,'approvato');mostra();expect(screen.queryByText(/Controlli aggiornati proposti/)).toBeNull();expect(screen.queryByText('Modifiche non salvate')).toBeNull();
  });
});


describe('La conferma riguarda il documento effettivamente letto',()=>{
 it('un aggiornamento del record in background non fa approvare il nuovo contenuto non mostrato',async()=>{
  const originale=riga(esempioPdfPos().contenuto);stato.pos=originale;const view=mostra();stato.pos={...originale,updated_at:'2026-10-27T12:01:00Z',contenuto:{...originale.contenuto,impresa:{...originale.contenuto.impresa,datore_lavoro:'Modificato altrove'}}};view.aggiorna();
  expect((screen.getByLabelText('Datore di lavoro') as HTMLInputElement).value).toBe(originale.contenuto.impresa.datore_lavoro);fireEvent.click(screen.getByRole('button',{name:'Approva e prepara PDF'}));await waitFor(()=>expect(stato.approva).toHaveBeenCalledWith({posId:'pos-1',attesaUpdatedAt:originale.updated_at}));
 });
 it('un conflitto del server resta visibile senza sostituire la bozza locale',async()=>{
  stato.pos=riga(esempioPdfPos().contenuto);stato.approva.mockRejectedValue(new Error('Il POS è cambiato rispetto alla versione letta'));mostra();fireEvent.click(screen.getByRole('button',{name:'Approva e prepara PDF'}));expect(await screen.findByText('Il POS è cambiato rispetto alla versione letta')).toBeInTheDocument();expect((screen.getByLabelText('Datore di lavoro') as HTMLInputElement).value).toBe('Mario Rossi');expect(stato.salva).not.toHaveBeenCalled();
 });
 it('dopo un salvataggio riuscito approva usando la versione restituita dal server',async()=>{
  const originale=riga(esempioPdfPos().contenuto);stato.pos=originale;stato.salva.mockResolvedValue({...originale,updated_at:'2026-10-27T12:02:00Z'});mostra();fireEvent.change(screen.getByLabelText('Datore di lavoro'),{target:{value:'Adattamento da salvare'}});fireEvent.click(screen.getByRole('button',{name:'Approva e prepara PDF'}));await waitFor(()=>expect(stato.approva).toHaveBeenCalledWith({posId:'pos-1',attesaUpdatedAt:'2026-10-27T12:02:00Z'}));expect(stato.salva.mock.calls[0][0].attesa_updated_at).toBe(originale.updated_at);
 });
 it('le modifiche inserite durante il salvataggio restano da salvare e fermano l’approvazione',async()=>{
  const originale = riga(esempioPdfPos().contenuto);
  stato.pos = originale;
  let termina: (v: typeof originale) => void = () => {};
  stato.salva.mockImplementation(() => new Promise(resolve => { termina = resolve; }));
  mostra();
  const datore = screen.getByLabelText("Datore di lavoro") as HTMLInputElement;
  fireEvent.change(datore, { target: { value: "Prima modifica" } });
  fireEvent.click(screen.getByText("Approva e prepara PDF"));
  await waitFor(() => expect(stato.salva).toHaveBeenCalledOnce());
  fireEvent.change(datore, { target: { value: "Seconda modifica durante la richiesta" } });
  await act(async () => { termina({ ...originale, updated_at: "2026-10-27T12:03:00Z" }); });
  expect(stato.approva).not.toHaveBeenCalled();
  expect(screen.getByText("Modifiche non salvate")).toBeInTheDocument();
  expect(datore).toHaveValue("Seconda modifica durante la richiesta");

  stato.salva.mockResolvedValue({ ...originale, updated_at: "2026-10-27T12:04:00Z" });
  fireEvent.click(screen.getByText("Salva", { selector: "button" }));
  await waitFor(() => expect(stato.salva).toHaveBeenCalledTimes(2));
  expect(stato.salva.mock.calls[1][0].attesa_updated_at).toBe("2026-10-27T12:03:00Z");
 });
});


describe("la proposta dell'AI", () => {
  const proposta = (modalita: string) => ({
    lavorazioni: [{ ...lavorazioneVuota("ai-1"), titolo: "Demolizione tramezzi", origine: "ai" as const, verificata: false }],
    modalita_organizzative: modalita,
  });
  const bozzaSenzaModalita = () => {
    const c = esempioPdfPos().contenuto;
    c.opera.modalita_organizzative = "";
    const originale = riga(c);
    stato.pos = originale;
    stato.salva.mockResolvedValue({ ...originale, updated_at: "2026-10-30T09:00:00Z" });
    return originale;
  };

  it("precompila il perimetro di una scheda e applica solo i testi vuoti alla stessa lavorazione", async () => {
    const contenuto = posVuoto();
    contenuto.lavorazioni = [{
      ...lavorazioneVuota("l-esistente"), titolo: "Posa serramenti", fase_id: "fase-demo",
      modalita: "Procedura di posa già definita.", macchine: "Ventosa manuale",
      fonti_scheda: { quesiti: [{ domanda: "Quali ausili?", risposta: "Ventosa manuale" }] },
    }];
    const originale = riga(contenuto);
    stato.pos = originale;
    stato.salva.mockResolvedValue(originale);
    vi.mocked(lavorazioniAiPos).mockResolvedValue({
      lavorazioni: [{
        ...lavorazioneVuota("l-proposta"), titolo: "Rimozione e posa dei serramenti", fase_id: "fase-demo", origine: "ai",
        descrizione: "Sostituzione dei serramenti dei vani indicati nel rilievo.", modalita: "Testo alternativo.",
        macchine: "Sollevatore ipotizzato",
        fonti_scheda: { quesiti: [{ domanda: "Quali ausili?", risposta: "" }, { domanda: "Quali vani?", risposta: "" }] },
      }],
    });
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Proponi testo con l’AI" }));
    const perimetro = within(screen.getByRole("dialog", { name: "Prepara le lavorazioni con l’AI" }));
    expect(perimetro.getByRole("textbox", { name: "Lavorazioni da includere" })).toHaveValue("Posa serramenti");
    expect(perimetro.getByRole("checkbox", { name: "Preparazione del cantiere" })).toBeChecked();
    fireEvent.click(perimetro.getByRole("button", { name: "Genera proposte" }));
    const revisione = within(await screen.findByRole("dialog", { name: "Rivedi le proposte AI" }));
    expect(lavorazioniAiPos).toHaveBeenCalledWith("az-1", "pos-1", { ambito: "Posa serramenti", fasi: ["fase-demo"] });
    expect(revisione.getByRole("combobox", { name: /Azione per Rimozione/ })).toHaveValue("testi:l-esistente");
    expect(revisione.getByText("Sostituzione dei serramenti dei vani indicati nel rilievo.")).toBeInTheDocument();
    expect(revisione.queryByText("Testo alternativo.")).toBeNull();
    fireEvent.click(revisione.getByRole("button", { name: "Applica alla bozza (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.salva.mock.lastCall?.[0].contenuto.lavorazioni).toMatchObject([{
      id: "l-esistente", titolo: "Posa serramenti", descrizione: "Sostituzione dei serramenti dei vani indicati nel rilievo.",
      modalita: "Procedura di posa già definita.", macchine: "Ventosa manuale", origine: "ai", verificata: false,
      fonti_scheda: { quesiti: [{ domanda: "Quali ausili?", risposta: "Ventosa manuale" }, { domanda: "Quali vani?", risposta: "" }] },
    }]));
  });

  it("seleziona un capitolo e modifica la ditta proposta prima di salvare la lavorazione", async () => {
    const originale = bozzaSenzaModalita();
    originale.contenuto.impresa.ruolo = "affidataria_esecutrice";
    const indice = { computo: { id: "computo-demo", titolo: "Computo stradale",
      capitoli: [{ nome: "Barriere", voci: 90, fase: { id: "fase-demo", name: "Preparazione del cantiere" } }] } };
    vi.mocked(chiamaServerPos).mockImplementation(async body => (body.azione === "computo_ai" ? indice : { lettura: null }) as never);
    const risposta = proposta("");
    risposta.lavorazioni[0] = { ...risposta.lavorazioni[0], titolo: "Posa delle barriere", svolgimento: "subappalto", svolgimento_con: "Asfalti Demo" };
    vi.mocked(lavorazioniAiPos).mockResolvedValue({ ...risposta, ditte: ["Asfalti Demo", "Barriere Demo", "Segnaletica Demo"] });
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Proponi con l'AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Capitoli del computo" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Barriere · 90 voci/ }));
    fireEvent.click(screen.getByRole("button", { name: "Seleziona le fasi proposte" }));
    fireEvent.click(screen.getByRole("button", { name: "Genera proposte" }));
    const revisione = await screen.findByRole("dialog", { name: "Rivedi le proposte AI" });
    expect(lavorazioniAiPos).toHaveBeenCalledWith("az-1", "pos-1", {
      fasi: ["fase-demo"], ambito: "", computo: { id: "computo-demo", capitoli: ["Barriere"] },
    });
    fireEvent.change(within(revisione).getByRole("combobox", { name: /Chi esegue.*Posa delle barriere/ }), { target: { value: "Barriere Demo" } });
    fireEvent.click(within(revisione).getByRole("button", { name: "Applica alla bozza (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.salva.mock.lastCall?.[0].contenuto.lavorazioni).toContainEqual(
      expect.objectContaining({ titolo: "Posa delle barriere", svolgimento: "subappalto", svolgimento_con: "Barriere Demo", verificata: false }),
    ));
  });

  it("le modalità organizzative scritte dall'AI restano «da verificare» e fermano l'approvazione finché non si conferma", async () => {
    bozzaSenzaModalita();
    vi.mocked(lavorazioniAiPos).mockResolvedValue(proposta("Accesso dal cancello su via Roma"));
    mostra();
    const campoModalita = screen.getByLabelText("Modalità organizzative") as HTMLTextAreaElement;
    const testoModalita = () => campoModalita.value;
    fireEvent.click(screen.getByRole("button", { name: "Proponi con l'AI" }));
    const genera = screen.getByRole("button", { name: "Genera proposte" }) as HTMLButtonElement;
    expect(genera.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Preparazione del cantiere" }));
    fireEvent.click(genera);
    const revisione = await screen.findByRole("dialog", { name: "Rivedi le proposte AI" });
    expect(testoModalita()).toBe("");
    fireEvent.click(within(revisione).getByRole("checkbox", { name: "Demolizione tramezzi" }));
    fireEvent.click(within(revisione).getByRole("checkbox", { name: "Inserisci anche le modalità organizzative" }));
    fireEvent.click(within(revisione).getByRole("button", { name: "Applica alla bozza" }));
    await waitFor(() => expect(testoModalita()).toBe("Accesso dal cancello su via Roma"));
    expect(screen.getByText(/le ha proposte l'AI/)).toBeTruthy();
    expect(screen.queryByDisplayValue("Demolizione tramezzi")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Approva e prepara/ }));
    expect(await screen.findByText(/Modalità organizzative proposte dall'AI/)).toBeTruthy();
    expect(stato.approva).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Il POS non ha ancora tutti i contenuti minimi")).toBeNull());

    fireEvent.click(screen.getByRole("checkbox", { name: /le ha proposte l'AI/ }));
    await waitFor(() => expect(screen.queryByText(/le ha proposte l'AI/)).toBeNull());
    expect(testoModalita()).toBe("Accesso dal cancello su via Roma");
  });

  it("mostra le fonti collegate e porta nel PSC soltanto la prescrizione scelta", async () => {
    const originale = bozzaSenzaModalita();
    const psc = originale.contenuto.procedure_psc.documento!;
    const estratto = "Separare la posa dal lavoro sullo stesso fronte.";
    const adegua = proposta("");
    vi.mocked(lavorazioniAiPos).mockResolvedValue({
      ...adegua, lavorazioni: [
        { ...adegua.lavorazioni[0], titolo: "Posa delle finestre",
          fonti_scheda: { psc: { id: psc.id, revisione: psc.revisione, sha256: psc.sha256, estratti: [{ pagina: 4, testo: estratto }] } } },
        { ...adegua.lavorazioni[0], id: "ai-2", titolo: "Sola consegna al varco" },
      ],
    });
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Proponi con l'AI" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Preparazione del cantiere" }));
    fireEvent.click(screen.getByRole("button", { name: "Genera proposte" }));
    const revisione = await screen.findByRole("dialog", { name: "Rivedi le proposte AI" });
    const daEscludere = within(revisione).getByRole("checkbox", { name: "Sola consegna al varco" });
    fireEvent.click(daEscludere);
    expect(daEscludere).toHaveAttribute("aria-checked", "false");
    fireEvent.click(within(revisione).getByRole("button", { name: "Applica alla bozza (1)" }));
    expect(screen.queryByDisplayValue("Sola consegna al varco")).toBeNull();
    fireEvent.click(screen.getByText("Fonti della scheda"));
    fireEvent.click(screen.getByRole("button", { name: "Porta in Procedure PSC" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(stato.salva.mock.lastCall![0].contenuto.procedure_psc.voci).toContainEqual({
      procedura: estratto, indicazioni: "", pagina: "4", lavorazione_id: "ai-1",
      fonte_estratto: { id: psc.id, revisione: psc.revisione, sha256: psc.sha256 },
    });
  });

  it("quello che si scrive mentre l'AI risponde non viene sovrascritto", async () => {
    bozzaSenzaModalita();
    let rispondi: (v: ReturnType<typeof proposta>) => void = () => {};
    vi.mocked(lavorazioniAiPos).mockImplementation(() => new Promise((resolve) => { rispondi = resolve as never; }));
    mostra();
    const campoModalita = screen.getByLabelText("Modalità organizzative") as HTMLTextAreaElement;
    const testoModalita = () => campoModalita.value;
    fireEvent.click(screen.getByRole("button", { name: "Proponi con l'AI" }));
    const genera = screen.getByRole("button", { name: "Genera proposte" }) as HTMLButtonElement;
    expect(genera.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Preparazione del cantiere" }));
    fireEvent.click(genera);
    await waitFor(() => expect(lavorazioniAiPos).toHaveBeenCalledWith("az-1", "pos-1", { fasi: ["fase-demo"], ambito: "" }));
    fireEvent.change(campoModalita, { target: { value: "Scritto a mano nell'attesa" } });
    await act(async () => { rispondi(proposta("Testo dell'AI")); });
    expect(await screen.findByRole("dialog", { name: "Rivedi le proposte AI" })).toBeTruthy();
    expect(screen.queryByText("Inserisci anche le modalità organizzative")).toBeNull();
    expect(testoModalita()).toBe("Scritto a mano nell'attesa");
    expect(screen.queryByText(/le ha proposte l'AI/)).toBeNull();
  });
});

describe("schede standard", () => {
  it("suggerisce e inserisce il testo standard in una scheda esistente, conservando la descrizione", async () => {
    const contenuto = posVuoto();
    contenuto.lavorazioni = [{
      ...lavorazioneVuota("l1"), titolo: "Posa serramenti", descrizione: "Sostituzione di tre finestre lato cortile.",
    }];
    const originale = riga(contenuto);
    stato.pos = originale;
    stato.salva.mockResolvedValue(originale);
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Testi pronti" }));
    const testi = within(screen.getByRole("dialog", { name: "Testi pronti per la lavorazione" }));
    expect(testi.getByRole("combobox", { name: "Modello di testo" })).toHaveValue("serramenti");
    expect(testi.queryByText("Descrizione della lavorazione")).toBeNull();
    expect(testi.getByText(/Confermare vani, pesi/)).toBeInTheDocument();
    fireEvent.click(testi.getByRole("button", { name: "Inserisci testi mancanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.salva.mock.lastCall?.[0].contenuto.lavorazioni).toMatchObject([{
      id: "l1", descrizione: "Sostituzione di tre finestre lato cortile.", modalita: expect.stringContaining("Confermare vani, pesi"),
      origine: "modello", verificata: false, fonti_scheda: { standard: { id: "serramenti" } },
    }]));
    expect(lavorazioniAiPos).not.toHaveBeenCalled();
  });

  it("cerca un modello senza chiamare l’AI e salva i dettagli della scheda modificabile", async () => {
    const originale = riga(posVuoto());
    stato.pos = originale;
    stato.salva.mockResolvedValue(originale);
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Schede standard" }));
    const catalogo = screen.getByRole("dialog", { name: "Schede standard POS" });
    fireEvent.change(within(catalogo).getByRole("textbox", { name: "Cerca una scheda standard" }), { target: { value: "zanzariere" } });
    expect(within(catalogo).getAllByRole("button", { name: /Aggiungi scheda/ })).toHaveLength(1);
    fireEvent.change(within(catalogo).getByRole("combobox", { name: "Associa a una fase della commessa" }), { target: { value: "fase-demo" } });
    fireEvent.click(within(catalogo).getByRole("button", { name: /Aggiungi scheda Tapparelle/ }));
    const scheda = screen.getByDisplayValue("Tapparelle, zanzariere, cassonetti e persiane");
    expect(scheda).toBeTruthy();
    const risposta = screen.getByRole("textbox", { name: "Chi gestisce alimentazione e prove dei sistemi motorizzati?" });
    fireEvent.change(risposta, { target: { value: "Il referente elettrico dopo consegna del fronte." } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    const salvata = stato.salva.mock.calls[0][0].contenuto.lavorazioni[0];
    expect(salvata.fase_id).toBe("fase-demo");
    expect(salvata.fonti_scheda).toMatchObject({
      standard: { id: "schermature", versione: 1 },
      quesiti: [{ risposta: "" }, { risposta: "Il referente elettrico dopo consegna del fronte." }],
    });
    expect(lavorazioniAiPos).not.toHaveBeenCalled();
  });
});

describe("approvato ma con una verifica negativa", () => {
  it("lo stato non resta verde: l'esito negativo del CSE si vede nell'intestazione", () => {
    const c = esempioPdfPos().contenuto;
    c.procedure_psc.psc_presente = true;
    stato.pos = { ...riga(c, "approvato"), iter: { cse_esito: "negativo" } };
    mostra();
    expect(screen.getByText("Approvato, verifica negativa")).toBeTruthy();
    expect(screen.queryByText("Approvato")).toBeNull();
  });
  it("un esito negativo che non si applica a questo POS (né subappalto né PSC) non cambia lo stato", () => {
    const c = esempioPdfPos().contenuto;
    c.impresa.ruolo = "affidataria";
    c.impresa.subappalto_a = "";
    c.procedure_psc.psc_presente = false;
    stato.pos = { ...riga(c, "approvato"), iter: { affidataria_esito: "negativo", cse_esito: "negativo" } };
    mostra();
    expect(screen.getByText("PDF approvato · iter da completare")).toBeTruthy();
  });
});

describe("invio del POS a chi lo deve verificare", () => {
  it("il subappaltatore invia all’affidataria e può registrare il riscontro del CSE", () => {
    const c = esempioPdfPos().contenuto;
    stato.pos = riga(c, "approvato");
    mostra();
    expect(screen.queryByTestId("invio-cse")).toBeNull();
    expect(screen.getByTestId("invio-affidataria")).toBeTruthy();
    cleanup();
    stato.pos = riga(c, "bozza");
    mostra();
    expect(screen.queryByTestId("invio-cse")).toBeNull();
    expect(screen.queryByTestId("invio-affidataria")).toBeNull();
  });

  it("senza CSE né subappalto non c'è nessuno a cui inviarlo", () => {
    const c = esempioPdfPos().contenuto;
    c.impresa.ruolo = "affidataria"; c.impresa.subappalto_a = ""; c.procedure_psc.psc_presente = false;
    stato.pos = riga(c, "approvato");
    mostra();
    expect(screen.queryByTestId("invio-cse")).toBeNull();
    expect(screen.queryByTestId("invio-affidataria")).toBeNull();
  });
});

describe("nuova revisione con firme non salvate", () => {
  it("«Nuova revisione» aspetta il salvataggio delle date di firma, che altrimenti andrebbero perse", () => {
    stato.pos = riga(esempioPdfPos().contenuto, "approvato");
    mostra();
    const nuova = screen.getByRole("button", { name: /Nuova revisione/ }) as HTMLButtonElement;
    expect(nuova.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Firmato dal datore di lavoro il"), { target: { value: "2026-10-29" } });
    expect((screen.getByRole("button", { name: /Nuova revisione/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ricarica in background fallita", () => {
  it("quando la precompilazione fallisce, consente di riprovare e recuperare i dati", async () => {
    stato.pos = { ...riga(posVuoto()), daCompilare: true };
    const contenuto = posVuoto();
    contenuto.impresa.datore_lavoro = "Datore recuperato";
    vi.mocked(datiAppPos).mockRejectedValueOnce(new Error("Fonti non disponibili"))
      .mockResolvedValueOnce({ contenuto, contesto: { avvisi: [], mezzi: [], subappaltatori: [] } });
    mostra();
    expect(await screen.findByRole("alert")).toHaveTextContent("non sono disponibili per la precompilazione");
    expect(screen.queryByRole("heading", { name: "Piano Operativo di Sicurezza" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova a recuperare i dati" }));
    const campo = await screen.findByLabelText("Datore di lavoro");
    expect(campo).toHaveValue("Datore recuperato");
    expect(stato.salva).not.toHaveBeenCalled();
  });
  it("con un POS già letto l'editor resta aperto e la bozza non si perde", () => {
    stato.pos = riga(esempioPdfPos().contenuto);
    stato.errore = new Error("rete caduta");
    mostra();
    expect(screen.getByRole("heading", { name: "Piano Operativo di Sicurezza" })).toBeTruthy();
    expect(screen.queryByText("Non riesco a caricare il POS.")).toBeNull();
  });
  it("senza nessun dato l'errore si vede, con «Riprova»", () => {
    stato.pos = null;
    stato.errore = new Error("rete caduta");
    mostra();
    expect(screen.getByText("Non riesco a caricare il POS.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeTruthy();
  });
});

it("prepara insieme le sole fasi selezionate, suggerisce uno standard pertinente e blocca il reinserimento", async () => {
  stato.fasiExtra = [
    { id: "fase-ser", name: "Sostituzione serramenti piano primo" },
    { id: "fase-ambigua", name: "Rimozione e posa infissi" },
    { id: "fase-fv", name: "Posa fotovoltaico" },
  ];
  const originale = riga(posVuoto());
  stato.pos = originale;
  stato.salva.mockResolvedValue(originale);
  mostra();
  fireEvent.click(screen.getByRole("button", { name: "Dalle fasi" }));
  let dialog = within(screen.getByRole("dialog", { name: "Prepara lavorazioni dalle fasi" }));
  fireEvent.click(dialog.getByRole("checkbox", { name: "Preparazione del cantiere" }));
  fireEvent.change(dialog.getByRole("searchbox"), { target: { value: "serramenti" } });
  fireEvent.click(dialog.getByRole("checkbox", { name: "Sostituzione serramenti piano primo" }));
  expect(dialog.getByRole("combobox", { name: "Testo di partenza per Sostituzione serramenti piano primo" })).toHaveValue("serramenti");
  fireEvent.change(dialog.getByRole("searchbox"), { target: { value: "" } });
  fireEvent.click(dialog.getByRole("checkbox", { name: "Rimozione e posa infissi" }));
  const modello = dialog.getByRole("combobox", { name: "Testo di partenza per Rimozione e posa infissi" });
  expect(modello).toHaveValue("");
  fireEvent.change(modello, { target: { value: "demolizioni" } });
  fireEvent.click(dialog.getByRole("button", { name: "Inserisci 3 lavorazioni" }));

  expect(screen.getByLabelText("Titolo della lavorazione 1")).toHaveValue("Preparazione del cantiere");
  expect(screen.getByLabelText("Titolo della lavorazione 2")).toHaveValue("Sostituzione serramenti piano primo");
  expect(screen.queryByDisplayValue("Posa fotovoltaico")).toBeNull();
  expect(screen.getByRole("button", { name: "Apri la lavorazione 2" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Apri la lavorazione 2" }));
  expect(screen.getByRole("textbox", { name: "Quali ausili si usano per movimentare telai e vetri?" })).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Dalle fasi" }));
  dialog = within(screen.getByRole("dialog", { name: "Prepara lavorazioni dalle fasi" }));
  expect(dialog.getByRole("checkbox", { name: "Sostituzione serramenti piano primo" })).toBeDisabled();
  fireEvent.click(dialog.getByRole("button", { name: "Annulla" }));

  fireEvent.click(screen.getByRole("button", { name: "Salva" }));
  await waitFor(() => expect(stato.salva).toHaveBeenCalled());
  const schede = stato.salva.mock.calls[0][0].contenuto.lavorazioni;
  expect(schede).toHaveLength(3);
  expect(schede[0]).toMatchObject({ fase_id: "fase-demo", rischi: "", origine: "utente" });
  expect(schede[1]).toMatchObject({ fase_id: "fase-ser", origine: "modello", verificata: false, dpi: "", fonti_scheda: { standard: { id: "serramenti" } } });
  expect(schede[2]).toMatchObject({ fase_id: "fase-ambigua", fonti_scheda: { standard: { id: "demolizioni" } } });
  expect(lavorazioniAiPos).not.toHaveBeenCalled();
  expect(stato.approva).not.toHaveBeenCalled();
});

it("aggiunge alla bozza soltanto i dati dichiarati nella traccia e conserva il testo già scritto", async () => {
  const contenuto = posVuoto();
  contenuto.opera.modalita_organizzative = "Fronte nord consegnato.";
  const originale = riga(contenuto);
  stato.pos = originale;
  stato.salva.mockResolvedValue(originale);
  mostra();
  fireEvent.click(screen.getByRole("button", { name: "Compila con una traccia" }));
  const dialog = within(screen.getByRole("dialog", { name: "Organizzazione e turni" }));
  expect(dialog.getByRole("button", { name: "Inserisci nel POS" })).toBeDisabled();
  fireEvent.change(dialog.getByLabelText("Accessi e percorsi"), { target: { value: "Ingresso dal varco nord." } });
  fireEvent.change(dialog.getByLabelText("Giorni e orari dei turni"), { target: { value: "Lunedì–venerdì, 8:00–17:00." } });
  fireEvent.click(dialog.getByRole("button", { name: "Inserisci nel POS" }));
  expect(screen.getByLabelText("Modalità organizzative")).toHaveValue("Fronte nord consegnato.\nAccessi e percorsi: Ingresso dal varco nord.");
  expect(screen.getByLabelText("Turni di lavoro")).toHaveValue("Lunedì–venerdì, 8:00–17:00.");
  expect(stato.salva).not.toHaveBeenCalled();
  expect(stato.approva).not.toHaveBeenCalled();
});

it("riusa il contesto della creazione e evita di scaricare subito di nuovo i dati della commessa", async () => {
  stato.pos = riga(posVuoto());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["pos-dati-app", "az-1", "pos-1"], { contesto: { mezzi: [{ nome: "Mezzo già recuperato" }], subappaltatori: [], avvisi: [] } });
  vi.mocked(datiAppPos).mockClear();
  mostra(qc);
  expect(await screen.findByText("Mezzo già recuperato", { exact: false })).toBeVisible();
  expect(datiAppPos).not.toHaveBeenCalled();
});

describe("Avanzamento del PDF nell'editor", () => {
  const apri = (status = "bozza") => { stato.pos = riga(esempioPdfPos().contenuto, status); mostra(); };

  it("mentre si approva il pulsante dice a che punto è e, finché si disegna, c'è «Annulla» (a sola icona) che ferma tutto", () => {
    stato.approvaInCorso = true; stato.fase = "disegna";
    apri();
    expect(screen.getByRole("button", { name: /Disegno il PDF…/ })).toBeDisabled();
    const annulla = screen.getByRole("button", { name: "Annulla" });
    expect(annulla.textContent).toBe("");
    fireEvent.click(annulla);
    expect(stato.annulla).toHaveBeenCalledOnce();
  });

  it("quando il documento sta partendo verso il server (si conserva) e quando lavora il server non c'è più «Annulla»", () => {
    stato.approvaInCorso = true;
    for (const [fase, testo] of [["conserva", /Lo conservo…/], ["server", /Lo preparo sul server…/]] as const) {
      stato.fase = fase;
      apri();
      expect(screen.getByRole("button", { name: testo })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Annulla" })).toBeNull();
      cleanup();
    }
  });

  it("senza nulla in corso il pulsante è quello di sempre e «Annulla» non c'è", () => {
    apri();
    expect(screen.getByRole("button", { name: /Approva e prepara PDF/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Annulla" })).toBeNull();
  });

  it("l'anteprima mostra la fase nel suo pulsante e ha il suo «Annulla»", () => {
    stato.anteprimaInCorso = true; stato.fase = "prepara";
    apri();
    expect(screen.getByRole("button", { name: /Preparo il documento…/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(stato.annulla).toHaveBeenCalledOnce();
  });

  it("apre l’anteprima dalla versione salvata di questo POS", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "PDF dalla versione salvata" }));
    expect(stato.apriAnteprima).toHaveBeenCalledWith("az-1", "pos-1");
  });
});

it("una bozza completa richiede la decisione sulla pertinenza del PSC prima di emettere", () => {
  stato.pos = riga(esempioPdfPos().contenuto);
  stato.sceltaPscDaConfermare = true;
  mostra();
  fireEvent.click(screen.getByRole("button", { name: /Approva e prepara PDF/ }));
  expect(stato.approva).not.toHaveBeenCalled();
  expect(screen.getByText("POS non approvato")).toBeInTheDocument();
  expect(screen.getAllByText(/Conferma l’applicabilità del PSC/).length).toBeGreaterThan(0);
});

it("aggiorna l’anteprima con la bozza in memoria e conserva i campi quando la chiude", async () => {
  stato.pos = riga(posVuoto());
  mostra();
  const campo = screen.getByLabelText("Datore di lavoro");
  fireEvent.change(campo, { target: { value: "Datore della bozza" } });
  fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF dal vivo" }));
  const dialog = within(screen.getByRole("dialog", { name: "Anteprima PDF dal vivo" }));
  expect(await dialog.findByText("Datore della bozza")).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Chiudi" }));
  expect(screen.queryByRole("dialog", { name: "Anteprima PDF dal vivo" })).toBeNull();
  expect(campo).toHaveValue("Datore della bozza");
  expect(stato.salva).not.toHaveBeenCalled();
  expect(stato.apriAnteprima).not.toHaveBeenCalled();
});

it("prepara fasi e voci di computo con assegnazioni esplicite e conserva i riferimenti senza duplicati", async () => {
  stato.puoLeggereComputo = true;
  const originale = riga(posVuoto());
  stato.pos = originale;
  stato.salva.mockResolvedValue(originale);
  const voce = { id: "v1", titolo: "Posa di serramenti del primo piano", codice: "SE-12", capitolo: "Forniture", quantita: 6, unita: "cad" };
  const altra = { ...voce, id: "v2", codice: "SE-13", quantita: 4 };
  stato.leggiComputo.mockResolvedValue({ fonte: { id: "cm-1", titolo: "Contratto Demo", stato: "contrattuale", voci: [voce, altra] } });
  const qc = new QueryClient();
  qc.setQueryData(["pos-dati-app", "az-1", "pos-1"], {
    contesto: { avvisi: [], mezzi: [], subappaltatori: [{ ragione_sociale: "Infissi Demo", tipo_lavori: "Serramenti" }] },
  });
  mostra(qc);
  fireEvent.click(screen.getByRole("button", { name: "Fasi e computo" }));
  let dialog = within(screen.getByRole("dialog", { name: "Prepara lavorazioni" }));
  fireEvent.click(dialog.getByRole("checkbox", { name: "Preparazione del cantiere" }));
  expect(stato.leggiComputo).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Computo" }));
  await dialog.findByText("Contratto Demo · Contrattuale · 2 voci");
  const ricerca = dialog.getByRole("searchbox");
  fireEvent.change(ricerca, { target: { value: "SE-12" } });
  fireEvent.click(dialog.getByRole("checkbox", { name: voce.titolo }));
  fireEvent.change(dialog.getByRole("combobox", { name: `Chi svolge ${voce.titolo}` }), { target: { value: "ditta:Infissi Demo" } });
  fireEvent.change(ricerca, { target: { value: "SE-13" } });
  fireEvent.click(dialog.getByRole("checkbox", { name: altra.titolo }));
  expect(dialog.getByRole("button", { name: "Inserisci 3 lavorazioni" })).toBeDisabled();
  fireEvent.click(dialog.getByRole("button", { name: "Assegna le rimanenti all’impresa del POS" }));
  fireEvent.click(dialog.getByRole("button", { name: "Inserisci 3 lavorazioni" }));
  fireEvent.click(screen.getByRole("button", { name: "Fasi e computo" }));
  dialog = within(screen.getByRole("dialog", { name: "Prepara lavorazioni" }));
  fireEvent.click(dialog.getByRole("button", { name: "Computo" }));
  expect(dialog.getAllByRole("checkbox", { name: voce.titolo })).toHaveLength(2);
  expect(dialog.getAllByRole("checkbox", { name: voce.titolo }).every(e => e.hasAttribute("disabled"))).toBe(true);
  fireEvent.click(dialog.getByRole("button", { name: "Annulla" }));

  fireEvent.click(screen.getByRole("button", { name: "Salva" }));
  await waitFor(() => expect(stato.salva).toHaveBeenCalledOnce());
  expect(stato.salva.mock.lastCall?.[0].contenuto.lavorazioni).toMatchObject([
    { fase_id: "fase-demo", svolgimento: "diretto" },
    { svolgimento: "subappalto", svolgimento_con: "Infissi Demo", verificata: false, fonti_scheda: { computo: { id: "cm-1", voci: [voce] } } },
    { svolgimento: "diretto", fonti_scheda: { computo: { id: "cm-1", voci: [altra] } } },
  ]);
});

it("riformula solo le risposte compilate e aggiunge la proposta rivista senza sostituire il testo manuale", async () => {
  const contenuto = posVuoto();
  const scheda = nuovaDaSchedaStandard(SCHEDE_STANDARD_POS.find(s => s.id === "tramezzi")!, "testo-l1");
  scheda.modalita = "Testo operativo scritto a mano.";
  const [domanda, segnaposto] = scheda.fonti_scheda!.quesiti!;
  domanda.risposta = "Intervento previsto in vano A.";
  segnaposto.risposta = "Da confermare.";
  contenuto.lavorazioni = [scheda];
  stato.pos = riga(contenuto);
  vi.mocked(chiamaServerPos).mockImplementation(async b => (b.azione === "testo_lavorazione_ai" ? { testo: "Si interviene in vano A." } : { lettura: null }) as never);
  mostra();

  const campo = screen.getByLabelText("Modalità e organizzazione della fase di lavoro");
  fireEvent.click(screen.getByRole("button", { name: "Prepara testo dalle risposte" }));
  const dialogo = within(screen.getByRole("dialog", { name: "Testo per la fase di lavoro" }));
  expect(dialogo.queryByText("Da confermare.")).toBeNull();
  fireEvent.click(dialogo.getByRole("button", { name: "Genera proposta" }));
  const proposta = await dialogo.findByRole("textbox", { name: "Testo proposto per la fase di lavoro" });
  expect(proposta).toHaveValue("Si interviene in vano A.");
  expect(campo).toHaveValue("Testo operativo scritto a mano.");
  expect(chiamaServerPos).toHaveBeenCalledWith(expect.objectContaining({ azione: "testo_lavorazione_ai", risposte: [domanda] }));
  fireEvent.change(proposta, { target: { value: "Impostazione prevista nel vano A." } });
  fireEvent.click(dialogo.getByRole("button", { name: "Aggiungi alla modalità di lavoro" }));
  expect(campo).toHaveValue("Testo operativo scritto a mano.\n\nImpostazione prevista nel vano A.");
  expect(stato.salva).not.toHaveBeenCalled();
});
