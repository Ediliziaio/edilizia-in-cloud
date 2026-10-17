vi.mock("@/components/orders/NewPhaseMaterial", () => ({NewPhaseMaterial: () => <button>Nuovo materiale</button>}));
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderWorkPhases } from "@/components/orders/OrderWorkPhases";
import { assignment, phase } from "../fixtures/workPlanning";
import type { WorkPhase, PhaseAssignment, PhaseMaterial } from "@/hooks/useOrderWorkPhases";
import type { SquadraInCommessa } from "@/hooks/useOperai";

const state = vi.hoisted(() => ({
  permissions: { canEditOrders: true, canViewCosts: true, canManagePayments: true },
  phases: [] as WorkPhase[], unassigned: [] as PhaseAssignment[], loading: false, error: false,
  mobile: false,
  crews: [] as SquadraInCommessa[],
  materials: new Map<string, PhaseMaterial[]>(),
  add: vi.fn(), update: vi.fn(), remove: vi.fn(), addPhase: vi.fn(), applyTemplate: vi.fn(), updatePhase: vi.fn(), refetch: vi.fn(), segnaSottofase: vi.fn(), aggiungiSottofase: vi.fn(), sottofasiPerFase: new Map<string, unknown[]>(),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/useAssignmentHourlyCost", () => ({useAssignmentHourlyCost: () => ({allowed: true, data: {amount: 26}, isLoading: false, isError: false})}));
vi.mock("@/hooks/use-mobile", () => ({useIsMobile: () => state.mobile}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as unknown[] }) }));
vi.mock("@/components/orders/AlertScostamentoSal", () => ({ AlertScostamentoSal: (): null => null }));
vi.mock("@/hooks/useSottofasi", () => ({
  useSottofasi: () => ({
    sottofasi: [] as unknown[], perFase: state.sottofasiPerFase, isLoading: false, isError: false,
    segna: { mutate: state.segnaSottofase }, aggiungi: { mutate: state.aggiungiSottofase },
    rinomina: { mutate: vi.fn() }, elimina: { mutate: vi.fn() },
  }),
}));
vi.mock("@/hooks/useModelliFasi", () => ({ useModelliFasi: () => ({ modelli: [] as unknown[], inizializzati: false }) }));
vi.mock("@/hooks/useAvanzamentoCommessa", () => ({
  useAvanzamentoCommessa: () => ({ percentuale: null as number | null, peso: "uguale", daMostrare: (locale: unknown) => locale }),
}));
vi.mock("@/hooks/useOrderScheduleHealth", () => ({ useOrderScheduleHealth: () => ({ data: null as null }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  PHASE_TEMPLATES: [{ key: "simple", label: "Intervento semplice", hint: "Due fasi", phases: ["Preparazione", "Posa"] }],
  useOrderWorkPhases: () => ({
    phases: state.phases, unassigned: state.unassigned, isLoading: state.loading, isError: state.error, refetch: state.refetch,
    employees: [{ id: "e1", label: "Mario Rossi" }], externalTeams: [{ id: "s1", label: "Edil Alfa", kind: "esterna" }, { id: "si", label: "Squadra dipendenti", kind: "interna" }],
    totals: { preventivo: 200, consuntivo: 120, scostamento: -80 },
    addPhase: { mutate: state.addPhase }, applyTemplate: { mutate: state.applyTemplate }, updatePhase: { mutate: state.updatePhase }, deletePhase: { mutate: state.remove },
    addAssignment: { mutate: state.add }, updateAssignment: { mutateAsync: state.update }, deleteAssignment: { mutateAsync: state.remove },
    materialsByPhase: state.materials, unassignedMaterials: [] as unknown[], setMaterialPhase: { mutate: vi.fn() }, splitMaterial: { mutate: vi.fn() },
  }),
}));
vi.mock("@/components/orders/OrderLaborCosts", () => ({ OrderLaborCosts: ({ editable, parte }: { editable: boolean; parte?: string }) => <div>Ditte {parte} {editable ? "modificabili" : "sola lettura"}</div> }));
vi.mock("@/components/orders/CantiereLogistica", () => ({ CantiereLogistica: () => <div>Il cantiere</div> }));
vi.mock("@/hooks/useCantiereLogistica", () => ({ useMezziLavoro: () => ({ data: { sul_cantiere: [] as Array<Record<string, unknown>>, con_le_persone: [
  { id: "m1", nome: "Ducato bianco", tipo: "furgone", targa: "GF 482 KD", persona: "Luca Ferrari", fasi: ["p1"], a_bordo: ["Livella laser"], altrove: null as string | null },
] } }) }));
vi.mock("@/components/orders/AppCantiere", () => ({ AppCantiere: ({ modificabile, organizzazione }: { modificabile: boolean; organizzazione?: {aperta: boolean; riepilogo: string; onGestione: () => void; onTurni?: () => void} }) => <div><p>Organizzazione · {organizzazione?.riepilogo}</p>{organizzazione && <><button onClick={organizzazione.onGestione} aria-expanded={organizzazione.aperta}>{organizzazione.aperta ? "Chiudi organizzazione" : "Gestisci"}</button>{organizzazione.onTurni && <button onClick={organizzazione.onTurni}>Pianifica turni</button>}</>}{(!organizzazione || organizzazione.aperta) && <div>Nell'app {modificabile ? "capocantiere modificabile" : "sola lettura"}</div>}</div> }));
vi.mock("@/components/orders/InternalTeamShifts", () => ({internalTeamShiftsEnabled: true, InternalTeamShifts: () => <div>Editor turni</div>}));
vi.mock("@/components/orders/CreatePurchaseOrderButton", () => ({ CreatePurchaseOrderButton: () => <button>Crea OdA</button> }));
// Squadre della commessa (26/09): qui conta il blocco delle lavorazioni.
vi.mock("@/components/manodopera/SquadreCommessa", () => ({
  SquadreCommessa: ({ soloFinestra }: { soloFinestra?: boolean }) => soloFinestra ? null : <div>Squadre della commessa</div>,
  SquadreFase: () => <div>Squadre della fase</div>,
}));
vi.mock("@/components/manodopera/NoteCantiere", () => ({
  NoteCantiere: ({ phaseId }: { phaseId?: string | null }) => <div>{phaseId ? `Note della fase ${phaseId}` : "Note della commessa"}</div>,
}));
vi.mock("@/hooks/useOperai", () => ({
  oggiRoma: () => "2026-10-14",
  useSquadre: () => ({data: [] as unknown[], isLoading: false, isError: false}),
  useSquadraSuCommessa: () => ({mutate: vi.fn()}),
  messaggioErroreOperai: () => "Errore",
  useSquadreCommessa: () => ({ data: state.crews }),
  useNoteCantiere: () => ({ data: [] as unknown[] }),
}));
// Con più di sei fasi compaiono filtri e ricerca.
const setteFasi = () => [
  phase(), phase({ id: "p2", name: "Collaudo", status: "completata", assignments: [] }),
  ...["Demolizioni", "Impianti", "Massetti", "Intonaci", "Pavimenti"].map((name, i) => phase({ id: `px${i}`, name, status: "da_iniziare", assignments: [] })),
];

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks(); state.phases = [phase(), phase({ id: "p2", name: "Collaudo", status: "completata", assignments: [] })];
  state.unassigned = []; state.crews = []; state.materials = new Map(); state.loading = false; state.error = false; state.mobile = false; state.sottofasiPerFase = new Map();
  Object.assign(state.permissions, { canEditOrders: true, canViewCosts: true, canManagePayments: true });
  state.update.mockResolvedValue(undefined); state.remove.mockResolvedValue(undefined);
});
afterEach(cleanup);
const draw = () => render(<OrderWorkPhases orderId="order" />);
const chooseEmployee = () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Scegli chi" }), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: "Mario Rossi" }));
};

describe("Lavorazioni e squadra", () => {
  it.each([false, true])("la squadra generale è indicata anche nella fase, mobile=%s, senza nuove righe ore o costi", mobile => {
    state.mobile = mobile;
    state.phases = [phase({status: "da_iniziare", assignments: [], start_date: "2026-10-20", end_date: "2026-10-23"})];
    state.crews = [{squadra_id: "crew", nome: "Muratori", colore: null, attiva: true, phase_id: null, fase: null, segue_fase: false, dal: "2026-10-14", al: null, capocantiere: false, finita: false, responsabile: null, componenti: []}];
    const before = JSON.stringify(state.crews);
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    expect(screen.getByText(/Squadra della commessa/, {selector: "span"})).toBeInTheDocument();
    expect(screen.queryByText(/nessuno la fa ancora/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: mobile ? /Opere murarie/ : "Opere murarie"}));
    fireEvent.click(screen.getByRole("button", {name: "Vedi squadra generale per Opere murarie"}));
    expect(screen.getByRole("button", {name: "Chiudi organizzazione"})).toBeInTheDocument();
    expect(state.add).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled(); expect(JSON.stringify(state.crews)).toBe(before);
  });
  it("su mobile un solo Assegna apre il modulo comune senza menu o salvataggi", async () => {
    state.mobile = true;
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    expect(screen.queryByRole("button", {name: "Assegna squadra"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Assegna"}));
    expect(await screen.findByRole("dialog", {name: "Assegna chi lavora"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Persona"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Squadra interna"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Ditta"})).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(state.add).not.toHaveBeenCalled();
  });
  it("una fase con sottofasi mostra la checklist e non si corregge a mano", () => {
    state.sottofasiPerFase = new Map([["p1", [
      { id: "s1", phase_id: "p1", name: "Tracce", position: 0, peso: 1, fatta: true, fatta_il: null },
      { id: "s2", phase_id: "p1", name: "Cavi", position: 1, peso: 1, fatta: false, fatta_il: null },
    ]]]);
    // la fase «in corso» si apre da sola: la checklist è già visibile
    draw();
    expect(screen.getByText("1 di 2 · 50%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: da fare" }));
    expect(state.segnaSottofase).toHaveBeenCalledWith({ id: "s2", fatta: true });
    // la percentuale non si corregge a mano: la decidono le sottofasi
    expect(screen.getByRole("button", { name: /Avanzamento Opere murarie/ })).toBeDisabled();
  });
  it("Lavorazioni riunisce responsabili e assegnazioni, con logistica e istruzioni a richiesta", () => {
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    expect(screen.queryByText("Nell'app capocantiere modificabile")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Gestisci"}));
    expect(screen.getByRole("button", { name: "Opere murarie" })).toBeInTheDocument();
    for (const text of ["Il cantiere", "Note della commessa", "Ditte ditte modificabili", "Nell'app capocantiere modificabile", "Squadre della commessa"]) {
      if (text !== "Squadre della commessa") expect(screen.getByText(text)).toBeInTheDocument();
    }
  });
  it("le assegnazioni generali compaiono una volta e prima delle fasi", () => {
    state.unassigned = [assignment({id: "general"})];
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    const panel = screen.getByRole("region", {name: "Responsabili e assegnazioni generali"});
    expect(screen.queryByText("Assegnazioni all'intera commessa")).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", {name: "Gestisci"}));
    expect(within(panel).getByText("Assegnazioni all'intera commessa")).toBeInTheDocument();
    expect(screen.getAllByText("Assegnazioni all'intera commessa")).toHaveLength(1);
    expect(panel.compareDocumentPosition(screen.getByRole("button", {name: "Opere murarie"})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", {name: "Chiudi organizzazione"}));
    expect(screen.queryByText("Assegnazioni all'intera commessa")).not.toBeInTheDocument();
  });
  it("la fase chiusa conserva il nome dell'operaio storico, non la sola etichetta Dipendente", () => {
    state.phases = [phase({status: "completata", assignments: [assignment({phase_id: "p1", employee_id: "inactive", executor_label: "Giacomo Storico", executor_inactive: true})]})];
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    fireEvent.click(screen.getByRole("button", {name: "Mostra 1 fase completata"}));
    expect(screen.getByText("Giacomo Storico (storico)")).toBeInTheDocument();
    expect(screen.queryByText("Dipendente")).not.toBeInTheDocument();
  });
  it("raggruppa le fasi concluse senza perderne l'accesso", () => {
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    expect(screen.queryByRole("button", { name: "Collaudo" })).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Mostra 1 fase completata" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Collaudo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nascondi 1 fase completata" }));
    expect(screen.queryByRole("button", { name: "Collaudo" })).not.toBeInTheDocument();
  });
  it("la ricerca trova anche una fase conclusa non espansa", () => {
    state.phases = setteFasi();
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    fireEvent.change(screen.getByLabelText("Cerca lavorazione"), { target: { value: "Collaudo" } });
    expect(screen.getByRole("button", { name: "Collaudo" })).toBeInTheDocument();
  });
  it("non confonde fasi concluse con collaudo concluso", () => {
    state.phases = [phase({ status: "completata" })];
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    expect(screen.getByRole("status")).toHaveTextContent("Verifica eventuali attività aperte e il collaudo prima della consegna");
    expect(screen.queryByRole("button", {name: "Opere murarie"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Mostra 1 fase completata"})).toHaveAttribute("aria-expanded", "false");
  });
  it("gli avvisi aprono e portano alla sezione giusta senza scrivere dati", () => {
    state.phases = [phase({status: "da_iniziare", start_date: null, assignments: []})];
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    fireEvent.click(screen.getByRole("button", {name: "Completa le date: Opere murarie"}));
    expect(screen.getByLabelText("Date di Opere murarie")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", {name: "Assegna chi lavora: Opere murarie"}));
    expect(screen.getByLabelText("Assegnazioni di Opere murarie")).toHaveFocus();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.updatePhase).not.toHaveBeenCalled();
    expect(state.add).not.toHaveBeenCalled();
  });
  it.each([false, true])("i materiali scoperti restano nei filtri e l'avviso funziona anche su mobile=%s", mobile => {
    state.mobile = mobile;
    state.phases = setteFasi();
    state.materials = new Map([["p1", [{id: "m1", name: "Collante", quantity: 1, phase_id: "p1", supplier_id: null, purchase_price: null, vat_rate: null, unit_price: null, discount_percent: null, standard_cost: null, readiness: "da_ordinare", odaNumber: null}]]]);
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    if (!mobile) fireEvent.click(screen.getByRole("button", {name: "Da organizzare"}));
    fireEvent.click(screen.getByRole("button", {name: "1 materiale da ordinare: Opere murarie"}));
    expect(screen.getByLabelText("Materiali di Opere murarie")).toHaveFocus();
    expect(state.updatePhase).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "Assegna chi lavora: Opere murarie"})).not.toBeInTheDocument();
  });
  it("una fase chiusa non riceve avvisi di organizzazione anche senza date e persone", () => {
    state.phases = [phase({status: "completata", start_date: null, end_date: null, assignments: []})];
    render(<OrderWorkPhases orderId="order" view="lavorazioni" />);
    fireEvent.click(screen.getByRole("button", {name: "Mostra 1 fase completata"}));
    expect(screen.queryByLabelText("Da organizzare: Opere murarie")).not.toBeInTheDocument();
  });
  it("il nuovo selettore esterno non offre le squadre di dipendenti", () => {
    HTMLElement.prototype.scrollIntoView = vi.fn(); draw();
    fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    fireEvent.click(screen.getByRole("button", { name: "Ditta" }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Scegli chi" }), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Edil Alfa" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Squadra dipendenti" })).not.toBeInTheDocument();
  });
  it("conserva l'etichetta di una squadra interna già presente nello storico", () => {
    state.unassigned = [assignment({ id: "old", source: "team", executor_type: "esterno", employee_id: null, external_team_id: "si", phase_id: null })];
    draw(); fireEvent.click(screen.getByRole("button", {name: "Gestisci"})); expect(screen.getByText("Squadra dipendenti")).toBeInTheDocument();
  });
  it("l'app non è una sezione a parte: chi vede il cantiere sta dentro Lavori e squadre", () => {
    draw();
    fireEvent.click(screen.getByRole("button", {name: "Gestisci"}));
    expect(screen.queryByText(/Accesso all.app e ditte in subappalto/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accesso all.app/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nell'app capocantiere modificabile")).toBeInTheDocument();
    // le ditte in subappalto restano, da sole (DURC e contratto)
    expect(screen.getByText("Ditte ditte modificabili")).toBeInTheDocument();
    expect(state.add).not.toHaveBeenCalled();
  });
  it("non inserisce un consuntivo nella nuova assegnazione", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    expect(screen.queryByText("Consuntivo iniziale (facoltativo)")).not.toBeInTheDocument();
    expect(screen.getByText(/Assegnare non registra una spesa/)).toBeInTheDocument();
  });
  it("offre il collegamento ai rapportini nello stesso blocco", () => {
    const open = vi.fn(); render(<OrderWorkPhases orderId="order" onOpenReports={open} />);
    fireEvent.click(screen.getByRole("button", { name: "Vai ai rapportini" })); expect(open).toHaveBeenCalledOnce();
  });
  it("filtra lavorazioni senza perdere le assegnazioni generali", () => {
    state.phases = setteFasi(); state.unassigned = [assignment()]; draw();
    fireEvent.click(screen.getByRole("button", { name: "Completate" }));
    expect(screen.queryByRole("button", { name: "Opere murarie" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collaudo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Gestisci"})); expect(screen.getByText("Assegnazioni all'intera commessa")).toBeInTheDocument();
  });
  it("ricerca e comunica l'assenza di risultati", () => {
    state.phases = setteFasi(); draw(); fireEvent.change(screen.getByLabelText("Cerca lavorazione"), { target: { value: "inesistente" } });
    expect(screen.getByRole("status")).toHaveTextContent("Nessuna lavorazione corrisponde");
  });
  it("non presenta costi e non abilita modifiche a chi non ha i permessi", () => {
    Object.assign(state.permissions, { canEditOrders: false, canViewCosts: false }); draw();
    fireEvent.click(screen.getByRole("button", {name: "Gestisci"}));
    expect(screen.queryByText("Riepilogo costi della manodopera")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Persona o ditta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina fase" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Data inizio prevista")).toBeDisabled();
    expect(screen.getByText("Ditte ditte sola lettura")).toBeInTheDocument();
    expect(screen.getByText("Nell'app sola lettura")).toBeInTheDocument();
  });
  it("distingue errore da cantiere vuoto", () => {
    state.error = true; draw(); expect(screen.getByText(/Impossibile caricare le lavorazioni/)).toBeInTheDocument();
    expect(screen.queryByText("Riepilogo costi della manodopera")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" })); expect(state.refetch).toHaveBeenCalled();
  });
  it("non mostra un riepilogo a zero durante il caricamento", () => {
    state.loading = true; draw(); expect(screen.getByText("Caricamento lavorazioni…")).toBeInTheDocument();
    expect(screen.queryByText("Persone nelle assegnazioni")).not.toBeInTheDocument();
  });
  it("mantiene semplice la commessa senza fasi", () => {
    state.phases = []; state.unassigned = [assignment()]; draw();
    fireEvent.click(screen.getByRole("button", {name: "Gestisci"}));
    expect(screen.getByText("Squadra della commessa")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cerca lavorazione")).not.toBeInTheDocument();
  });
  it("i turni restano su richiesta, senza editor sempre montato", () => {
    draw(); expect(screen.queryByText("Editor turni")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Pianifica turni"}));
    expect(within(screen.getByRole("dialog")).getByText("Editor turni")).toBeInTheDocument();
    expect(state.add).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
  });
  it("blocca date invertite prima della mutazione", () => {
    draw(); fireEvent.change(screen.getByLabelText("Data fine prevista"), { target: { value: "2026-09-01" } });
    expect(state.updatePhase).not.toHaveBeenCalled();
  });
  it("rettifica l'avanzamento con un dialog accessibile", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Avanzamento Opere murarie: 40%" }));
    fireEvent.change(screen.getByLabelText("Avanzamento %"), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva avanzamento" }));
    expect(state.updatePhase).toHaveBeenCalledWith({ id: "p1", percentuale: 70, status: "in_corso" });
  });
  it("apre l'assegnazione sul lavoro, non sui costi, e distingue gli esterni", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Fase")).toHaveValue("");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ditta" }));
    expect(within(dialog).queryByLabelText("Ore già registrate (facoltativo)")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Se la ditta ha l'app, vede la commessa per tutta la durata dei lavori.")).toBeInTheDocument();
    expect(state.add).not.toHaveBeenCalled();
  });
  it("conserva creazione manuale e modelli senza salvataggi all'apertura", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Aggiungi fasi" }));
    fireEvent.click(screen.getByRole("button", { name: "Usa un modello" }));
    fireEvent.click(screen.getByRole("button", { name: "Intervento semplice" }));
    expect(screen.getByRole("button", { name: "Aggiungi le 2 fasi" })).toBeInTheDocument();
    expect(state.applyTemplate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Scrivi una fase" }));
    fireEvent.change(screen.getByLabelText("Aggiungi una singola fase"), { target: { value: "Demolizioni" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi fase" }));
    expect(state.addPhase).toHaveBeenCalledWith("Demolizioni", expect.any(Object));
  });
  it("crea l'assegnazione sulla fase scelta mantenendo il contratto dei dati", () => {
    state.phases = [phase({ assignments: [] })]; draw();
    fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    chooseEmployee();
    fireEvent.change(screen.getByLabelText("Fase"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma assegnazione" }));
    expect(state.add).toHaveBeenCalledWith(expect.objectContaining({ executor_type: "interno", employee_id: "e1", external_team_id: null,
      phase_id: "p1", cost_preventivo: 0, cost_consuntivo: 0, hours: null, is_paid: false }), expect.any(Object));
  });
  it("non crea una seconda riga della stessa persona sulla stessa fase", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    chooseEmployee(); fireEvent.change(screen.getByLabelText("Fase"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma assegnazione" }));
    expect(state.add).not.toHaveBeenCalled();
  });
  it("rifiuta un budget negativo senza inviare dati", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    chooseEmployee(); fireEvent.click(screen.getByText("Prevedi le ore (facoltativo)")); fireEvent.change(screen.getByLabelText("Ore previste"), { target: { value: "-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma assegnazione" }));
    expect(state.add).not.toHaveBeenCalled();
  });
  it("con poche fasi niente filtri né ricerca", () => {
    draw();
    expect(screen.queryByLabelText("Cerca lavorazione")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completate" })).not.toBeInTheDocument();
  });
  it("la fase aperta dice chi la fa e ha le sue note per gli operai", () => {
    draw();
    expect(screen.getByText("Chi la fa")).toBeInTheDocument();
    expect(screen.getByText("Squadre della fase")).toBeInTheDocument();
    expect(screen.getByText("Note della fase p1")).toBeInTheDocument();
    expect(screen.getByText("Note della commessa")).toBeInTheDocument();
    // i mezzi di chi fa la fase stanno nella fase
    expect(screen.getByText("Mezzi")).toBeInTheDocument();
    expect(screen.getByText("Ducato bianco")).toBeInTheDocument();
    expect(screen.getByText("· Luca Ferrari, con Livella laser · al seguito della persona")).toBeInTheDocument();
    // e in cima c'è il cantiere: indirizzo, strada dalla sede, mezzi
    expect(screen.getByText("Il cantiere")).toBeInTheDocument();
  });
  it("una commessa vuota mostra i tre passi invece dei riquadri vuoti", () => {
    state.phases = []; state.unassigned = []; draw();
    expect(screen.getByText("Come si organizza questo cantiere")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scegli le fasi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assegna chi lavora a tutta la commessa" })).toBeInTheDocument();
  });
});
