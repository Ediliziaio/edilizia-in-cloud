import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderWorkPhases } from "@/components/orders/OrderWorkPhases";
import { assignment, phase } from "../fixtures/workPlanning";
import type { WorkPhase, PhaseAssignment } from "@/hooks/useOrderWorkPhases";

const state = vi.hoisted(() => ({
  permissions: { canEditOrders: true, canViewCosts: true, canManagePayments: true },
  phases: [] as WorkPhase[], unassigned: [] as PhaseAssignment[], loading: false, error: false,
  add: vi.fn(), update: vi.fn(), remove: vi.fn(), addPhase: vi.fn(), applyTemplate: vi.fn(), updatePhase: vi.fn(), refetch: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useOrderScheduleHealth", () => ({ useOrderScheduleHealth: () => ({ data: null as null }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  PHASE_TEMPLATES: [{ key: "simple", label: "Intervento semplice", hint: "Due fasi", phases: ["Preparazione", "Posa"] }],
  useOrderWorkPhases: () => ({
    phases: state.phases, unassigned: state.unassigned, isLoading: state.loading, isError: state.error, refetch: state.refetch,
    employees: [{ id: "e1", label: "Mario Rossi" }], externalTeams: [{ id: "s1", label: "Edil Alfa", kind: "esterna" }, { id: "si", label: "Squadra dipendenti", kind: "interna" }],
    totals: { preventivo: 200, consuntivo: 120, scostamento: -80 },
    addPhase: { mutate: state.addPhase }, applyTemplate: { mutate: state.applyTemplate }, updatePhase: { mutate: state.updatePhase }, deletePhase: { mutate: state.remove },
    addAssignment: { mutate: state.add }, updateAssignment: { mutateAsync: state.update }, deleteAssignment: { mutateAsync: state.remove },
    materialsByPhase: new Map(), unassignedMaterials: [] as unknown[], setMaterialPhase: { mutate: vi.fn() }, splitMaterial: { mutate: vi.fn() },
  }),
}));
vi.mock("@/components/orders/OrderLaborCosts", () => ({ OrderLaborCosts: ({ editable, parte }: { editable: boolean; parte?: string }) => <div>Ditte {parte} {editable ? "modificabili" : "sola lettura"}</div> }));
vi.mock("@/components/orders/CantiereLogistica", () => ({ CantiereLogistica: () => <div>Il cantiere</div> }));
vi.mock("@/hooks/useCantiereLogistica", () => ({ useMezziLavoro: () => ({ data: { sul_cantiere: [] as Array<Record<string, unknown>>, con_le_persone: [
  { id: "m1", nome: "Ducato bianco", tipo: "furgone", targa: "GF 482 KD", persona: "Luca Ferrari", fasi: ["p1"], a_bordo: ["Livella laser"], altrove: null as string | null },
] } }) }));
vi.mock("@/components/orders/AppCantiere", () => ({ AppCantiere: ({ modificabile }: { modificabile: boolean }) => <div>Nell'app {modificabile ? "capocantiere modificabile" : "sola lettura"}</div> }));
vi.mock("@/components/orders/CreatePurchaseOrderButton", () => ({ CreatePurchaseOrderButton: () => <button>Crea OdA</button> }));
// Squadre della commessa (26/09): qui conta il blocco delle lavorazioni.
vi.mock("@/components/manodopera/SquadreCommessa", () => ({
  SquadreCommessa: () => <div>Squadre della commessa</div>,
  SquadreFase: () => <div>Squadre della fase</div>,
}));
vi.mock("@/components/manodopera/NoteCantiere", () => ({
  NoteCantiere: ({ phaseId }: { phaseId?: string | null }) => <div>{phaseId ? `Note della fase ${phaseId}` : "Note della commessa"}</div>,
}));
vi.mock("@/hooks/useOperai", () => ({
  useSquadreCommessa: () => ({ data: [] as unknown[] }),
  useNoteCantiere: () => ({ data: [] as unknown[] }),
}));
// Con più di sei fasi compaiono filtri e ricerca.
const setteFasi = () => [
  phase(), phase({ id: "p2", name: "Collaudo", status: "completata", assignments: [] }),
  ...["Demolizioni", "Impianti", "Massetti", "Intonaci", "Pavimenti"].map((name, i) => phase({ id: `px${i}`, name, status: "da_iniziare", assignments: [] })),
];

beforeEach(() => {
  vi.clearAllMocks(); state.phases = [phase(), phase({ id: "p2", name: "Collaudo", status: "completata", assignments: [] })];
  state.unassigned = []; state.loading = false; state.error = false;
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
  it("il nuovo selettore esterno non offre le squadre di dipendenti", () => {
    HTMLElement.prototype.scrollIntoView = vi.fn(); draw();
    fireEvent.click(screen.getAllByRole("button", { name: "Persona o ditta" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Una ditta" }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Scegli chi" }), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Edil Alfa" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Squadra dipendenti" })).not.toBeInTheDocument();
  });
  it("conserva l'etichetta di una squadra interna già presente nello storico", () => {
    state.unassigned = [assignment({ id: "old", source: "team", executor_type: "esterno", employee_id: null, external_team_id: "si", phase_id: null })];
    draw(); expect(screen.getByText("Squadra dipendenti")).toBeInTheDocument();
  });
  it("l'app non è una sezione a parte: chi vede il cantiere sta dentro Lavori e squadre", () => {
    draw();
    expect(screen.queryByText(/Accesso all.app e ditte in subappalto/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accesso all.app/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nell'app capocantiere modificabile")).toBeInTheDocument();
    // le ditte in subappalto restano, da sole (DURC e contratto)
    expect(screen.getByText("Ditte ditte modificabili")).toBeInTheDocument();
    expect(state.add).not.toHaveBeenCalled();
  });
  it("separa il consuntivo iniziale dalla nuova assegnazione", () => {
    draw(); fireEvent.click(screen.getAllByRole("button", { name: "Persona o ditta" })[0]);
    const details = screen.getByText("Consuntivo iniziale (facoltativo)").closest("details");
    expect(details).not.toHaveAttribute("open"); expect(details).toHaveTextContent("non già registrato nei rapportini");
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
    expect(screen.getByText("Assegnazioni all'intera commessa")).toBeInTheDocument();
  });
  it("ricerca e comunica l'assenza di risultati", () => {
    state.phases = setteFasi(); draw(); fireEvent.change(screen.getByLabelText("Cerca lavorazione"), { target: { value: "inesistente" } });
    expect(screen.getByRole("status")).toHaveTextContent("Nessuna lavorazione corrisponde");
  });
  it("non presenta costi e non abilita modifiche a chi non ha i permessi", () => {
    Object.assign(state.permissions, { canEditOrders: false, canViewCosts: false }); draw();
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
    expect(screen.getByText("Squadra della commessa")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cerca lavorazione")).not.toBeInTheDocument();
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
    draw(); fireEvent.click(screen.getAllByRole("button", { name: "Persona o ditta" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Fase")).toHaveValue("");
    fireEvent.click(within(dialog).getByRole("button", { name: "Una ditta" }));
    expect(within(dialog).queryByLabelText("Ore già registrate (facoltativo)")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Se la ditta ha l'app, vede la commessa per tutta la durata dei lavori.")).toBeInTheDocument();
    expect(state.add).not.toHaveBeenCalled();
  });
  it("conserva creazione manuale e modelli senza salvataggi all'apertura", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Fasi di lavoro" }));
    fireEvent.click(screen.getByRole("button", { name: "Intervento semplice" }));
    expect(screen.getByRole("button", { name: "Aggiungi le 2 fasi" })).toBeInTheDocument();
    expect(state.applyTemplate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Aggiungi una singola fase"), { target: { value: "Demolizioni" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi fase" }));
    expect(state.addPhase).toHaveBeenCalledWith("Demolizioni", expect.any(Object));
  });
  it("crea l'assegnazione sulla fase scelta mantenendo il contratto dei dati", () => {
    state.phases = [phase({ assignments: [] })]; draw();
    fireEvent.click(screen.getAllByRole("button", { name: "Persona o ditta" })[0]);
    chooseEmployee();
    fireEvent.change(screen.getByLabelText("Fase"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma assegnazione" }));
    expect(state.add).toHaveBeenCalledWith(expect.objectContaining({ executor_type: "interno", employee_id: "e1", external_team_id: null,
      phase_id: "p1", cost_preventivo: 0, cost_consuntivo: 0, hours: null, is_paid: false }), expect.any(Object));
  });
  it("non crea una seconda riga della stessa persona sulla stessa fase", () => {
    draw(); fireEvent.click(screen.getAllByRole("button", { name: "Persona o ditta" })[0]);
    chooseEmployee(); fireEvent.change(screen.getByLabelText("Fase"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma assegnazione" }));
    expect(state.add).not.toHaveBeenCalled();
  });
  it("rifiuta un budget negativo senza inviare dati", () => {
    draw(); fireEvent.click(screen.getAllByRole("button", { name: "Persona o ditta" })[0]);
    chooseEmployee(); fireEvent.change(screen.getByLabelText("Budget manodopera €"), { target: { value: "-10" } });
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
    expect(screen.getByText("· Luca Ferrari, con Livella laser")).toBeInTheDocument();
    // e in cima c'è il cantiere: indirizzo, strada dalla sede, mezzi
    expect(screen.getByText("Il cantiere")).toBeInTheDocument();
  });
  it("una commessa vuota mostra i tre passi invece dei riquadri vuoti", () => {
    state.phases = []; state.unassigned = []; draw();
    expect(screen.getByText("Come si organizza questo cantiere")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scegli le fasi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Metti una squadra su tutta la commessa" })).toBeInTheDocument();
  });
});
