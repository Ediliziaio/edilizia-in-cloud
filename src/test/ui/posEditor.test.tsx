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
import { lavorazioneVuota, posVuoto, type PosContenuto } from "../../../supabase/functions/_shared/posModello";

const stato = vi.hoisted(() => ({
  errore: null as Error | null,
  pos: null as unknown,
  approva: vi.fn(),
  salva: vi.fn(),
  // l'avanzamento del PDF: approvazione e anteprima
  approvaInCorso: false,
  fase: null as string | null,
  annulla: vi.fn(),
  anteprimaInCorso: false,
  apriAnteprima: vi.fn(),
}));

vi.mock("@/hooks/usePscCommessa",()=>({usePscCommessa:()=>({data:[] as never[],isPending:false,isError:false,isFetching:false,refetch:vi.fn()}),identificaPsc:vi.fn()}));
vi.mock("@/components/sicurezza/pos/ProdottiLavorazionePos",()=>({ProdottiLavorazionePos:(): null =>null}));
vi.mock("@/lib/sicurezza/apriPdfPos",()=>({apriAnteprimaPos:vi.fn()}));
vi.mock("@/hooks/useAnteprimaPos",()=>({useAnteprimaPos:()=>({apri:stato.apriAnteprima,inCorso:stato.anteprimaInCorso,fase:stato.anteprimaInCorso?stato.fase:null,annulla:stato.annulla})}));
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
    usePos: () => ({ data: stato.pos, isLoading: false, error: stato.errore, refetch: vi.fn() }),
    useSalvaPos: () => ({mutate:stato.salva,mutateAsync:stato.salva,isPending:false}),
    useApprovaPos: () => ({ mutate: vi.fn(), mutateAsync: stato.approva, isPending: stato.approvaInCorso, fase: stato.approvaInCorso ? stato.fase : null, annulla: stato.annulla }),
    useNuovaRevisione: mut,
    datiAppPos: vi.fn(() => new Promise(() => {})),
    lavorazioniAiPos: vi.fn(),
    caricaAllegatoPos: vi.fn(),
    linkAllegatoPos: vi.fn(),
  };
});
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewSicurezzaCantiere: true, isAdmin: true, solaLettura: false }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));

import { datiAppPos, lavorazioniAiPos } from "@/hooks/usePos";
import PosEditor from "@/pages/azienda/sicurezza/PosEditor";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  if (!("structuredClone" in globalThis)) {
    (globalThis as unknown as { structuredClone: unknown }).structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
  }
});
afterEach(() => { cleanup(); stato.errore = null; stato.approva.mockReset(); stato.salva.mockReset(); stato.approvaInCorso = false; stato.anteprimaInCorso = false; stato.fase = null; stato.annulla.mockReset(); stato.apriAnteprima.mockReset(); vi.mocked(datiAppPos).mockImplementation(() => new Promise(() => {})); });

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

function mostra() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const albero=()=> <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/azienda/sicurezza-cantiere/pos/pos-1"]}>
        <Routes><Route path="/azienda/sicurezza-cantiere/pos/:id" element={<PosEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>;
  const view=render(albero());return {...view,aggiorna:()=>view.rerender(albero())};
}

describe("editor del POS", () => {
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
  const originale=riga(esempioPdfPos().contenuto);stato.pos=originale;let termina:(v:typeof originale)=>void=()=>{};stato.salva.mockImplementation(()=>new Promise(resolve=>{termina=resolve;}));mostra();fireEvent.change(screen.getByLabelText('Datore di lavoro'),{target:{value:'Prima modifica'}});fireEvent.click(screen.getByRole('button',{name:'Approva e prepara PDF'}));await waitFor(()=>expect(stato.salva).toHaveBeenCalledOnce());fireEvent.change(screen.getByLabelText('Datore di lavoro'),{target:{value:'Seconda modifica durante la richiesta'}});await act(async()=>{termina({...originale,updated_at:'2026-10-27T12:03:00Z'});});expect(stato.approva).not.toHaveBeenCalled();expect(screen.getByText('Modifiche non salvate')).toBeTruthy();expect((screen.getByLabelText('Datore di lavoro') as HTMLInputElement).value).toBe('Seconda modifica durante la richiesta');
  stato.salva.mockResolvedValue({...originale,updated_at:'2026-10-27T12:04:00Z'});fireEvent.click(screen.getByRole('button',{name:'Salva'}));await waitFor(()=>expect(stato.salva).toHaveBeenCalledTimes(2));expect(stato.salva.mock.calls[1][0].attesa_updated_at).toBe('2026-10-27T12:03:00Z');
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
  const testoModalita = () => (screen.getByLabelText("Modalità organizzative") as HTMLTextAreaElement).value;

  it("le modalità organizzative scritte dall'AI restano «da verificare» e fermano l'approvazione finché non si conferma", async () => {
    bozzaSenzaModalita();
    vi.mocked(lavorazioniAiPos).mockResolvedValue(proposta("Accesso dal cancello su via Roma"));
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /Completa con l'AI/ }));
    await waitFor(() => expect(testoModalita()).toBe("Accesso dal cancello su via Roma"));
    expect(screen.getByText(/le ha proposte l'AI/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Annulla" })); // chiude la finestra delle proposte
    await waitFor(() => expect(screen.queryByText("Lavorazioni proposte dall'AI")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Approva e prepara/ }));
    expect(await screen.findByText(/Modalità organizzative proposte dall'AI/)).toBeTruthy();
    expect(stato.approva).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Il POS non ha ancora tutti i contenuti minimi")).toBeNull());

    fireEvent.click(screen.getByRole("checkbox", { name: /le ha proposte l'AI/ }));
    await waitFor(() => expect(screen.queryByText(/le ha proposte l'AI/)).toBeNull());
    expect(testoModalita()).toBe("Accesso dal cancello su via Roma");
  });

  it("quello che si scrive mentre l'AI risponde non viene sovrascritto", async () => {
    bozzaSenzaModalita();
    let rispondi: (v: ReturnType<typeof proposta>) => void = () => {};
    vi.mocked(lavorazioniAiPos).mockImplementation(() => new Promise((resolve) => { rispondi = resolve as never; }));
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /Completa con l'AI/ }));
    await waitFor(() => expect(lavorazioniAiPos).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Modalità organizzative"), { target: { value: "Scritto a mano nell'attesa" } });
    await act(async () => { rispondi(proposta("Testo dell'AI")); });
    await waitFor(() => expect(screen.getByText("Lavorazioni proposte dall'AI")).toBeTruthy());
    expect(testoModalita()).toBe("Scritto a mano nell'attesa");
    expect(screen.queryByText(/le ha proposte l'AI/)).toBeNull();
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
    expect(screen.getByText("Approvato")).toBeTruthy();
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

  it("«Anteprima PDF» apre l'anteprima di questo POS", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: /Anteprima PDF/ }));
    expect(stato.apriAnteprima).toHaveBeenCalledWith("az-1", "pos-1");
  });
});
