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
vi.mock("@/components/orders/OrderLaborCosts", () => ({ OrderLaborCosts: ({ editable }: { editable: boolean }) => <div>Accessi Campo {editable ? "modificabili" : "sola lettura"}</div> }));
vi.mock("@/components/orders/CreatePurchaseOrderButton", () => ({ CreatePurchaseOrderButton: () => <button>Crea OdA</button> }));

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
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Seleziona esecutore" }), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: "Mario Rossi" }));
};

describe("Lavorazioni e squadra", () => {
  it("il nuovo selettore esterno non offre le squadre di dipendenti", () => {
    HTMLElement.prototype.scrollIntoView = vi.fn(); draw();
    fireEvent.click(screen.getByRole("button", { name: "Assegna persona o squadra" }));
    fireEvent.click(screen.getByRole("button", { name: "Squadra esterna" }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Seleziona esecutore" }), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Edil Alfa" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Squadra dipendenti" })).not.toBeInTheDocument();
  });
  it("conserva l'etichetta di una squadra interna già presente nello storico", () => {
    state.unassigned = [assignment({ id: "old", source: "team", executor_type: "esterno", employee_id: null, external_team_id: "si", phase_id: null })];
    draw(); expect(screen.getByText("Squadra dipendenti")).toBeInTheDocument();
  });
  it("apre accessi e referenti dall'azione rapida senza mutazioni", () => {
    HTMLElement.prototype.scrollIntoView = vi.fn(); draw();
    const details = screen.getByText(/App Campo e affidamenti/).closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Accessi e referenti Campo" }));
    expect(details).toHaveAttribute("open"); expect(state.add).not.toHaveBeenCalled();
  });
  it("separa il consuntivo iniziale dalla nuova assegnazione", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna persona o squadra" }));
    const details = screen.getByText("Consuntivo iniziale (facoltativo)").closest("details");
    expect(details).not.toHaveAttribute("open"); expect(details).toHaveTextContent("non già registrato nei rapportini");
  });
  it("offre il collegamento ai rapportini nello stesso blocco", () => {
    const open = vi.fn(); render(<OrderWorkPhases orderId="order" onOpenReports={open} />);
    fireEvent.click(screen.getByRole("button", { name: "Vai ai rapportini" })); expect(open).toHaveBeenCalledOnce();
  });
  it("filtra lavorazioni senza perdere le assegnazioni generali", () => {
    state.unassigned = [assignment()]; draw();
    fireEvent.click(screen.getByRole("button", { name: "Completate" }));
    expect(screen.queryByRole("button", { name: "Opere murarie" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collaudo" })).toBeInTheDocument();
    expect(screen.getByText("Assegnazioni all'intera commessa")).toBeInTheDocument();
  });
  it("ricerca e comunica l'assenza di risultati", () => {
    draw(); fireEvent.change(screen.getByLabelText("Cerca lavorazione"), { target: { value: "inesistente" } });
    expect(screen.getByRole("status")).toHaveTextContent("Nessuna lavorazione corrisponde");
  });
  it("non presenta costi e non abilita modifiche a chi non ha i permessi", () => {
    Object.assign(state.permissions, { canEditOrders: false, canViewCosts: false }); draw();
    expect(screen.queryByText("Riepilogo costi della manodopera")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assegna persona o squadra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina fase" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Data inizio prevista")).toBeDisabled();
    expect(screen.getByText("Accessi Campo sola lettura")).toBeInTheDocument();
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
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna persona o squadra" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Lavorazione da assegnare")).toHaveValue("");
    fireEvent.click(within(dialog).getByRole("button", { name: "Squadra esterna" }));
    expect(within(dialog).queryByLabelText("Ore già registrate (facoltativo)")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/non abilita automaticamente un account/)).toBeInTheDocument();
    expect(state.add).not.toHaveBeenCalled();
  });
  it("conserva creazione manuale e modelli senza salvataggi all'apertura", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Aggiungi lavorazioni" }));
    fireEvent.click(screen.getByRole("button", { name: "Intervento semplice" }));
    expect(screen.getByRole("button", { name: "Aggiungi le 2 fasi" })).toBeInTheDocument();
    expect(state.applyTemplate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Aggiungi una singola fase"), { target: { value: "Demolizioni" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi fase" }));
    expect(state.addPhase).toHaveBeenCalledWith("Demolizioni", expect.any(Object));
  });
  it("crea l'assegnazione sulla fase scelta mantenendo il contratto dei dati", () => {
    state.phases = [phase({ assignments: [] })]; draw();
    fireEvent.click(screen.getByRole("button", { name: "Assegna persona o squadra" }));
    chooseEmployee();
    fireEvent.change(screen.getByLabelText("Lavorazione da assegnare"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma assegnazione" }));
    expect(state.add).toHaveBeenCalledWith(expect.objectContaining({ executor_type: "interno", employee_id: "e1", external_team_id: null,
      phase_id: "p1", cost_preventivo: 0, cost_consuntivo: 0, hours: null, is_paid: false }), expect.any(Object));
  });
  it("non crea una seconda riga della stessa persona sulla stessa fase", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna persona o squadra" }));
    chooseEmployee(); fireEvent.change(screen.getByLabelText("Lavorazione da assegnare"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma assegnazione" }));
    expect(state.add).not.toHaveBeenCalled();
  });
  it("rifiuta un budget negativo senza inviare dati", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna persona o squadra" }));
    chooseEmployee(); fireEvent.change(screen.getByLabelText("Budget manodopera €"), { target: { value: "-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma assegnazione" }));
    expect(state.add).not.toHaveBeenCalled();
  });
});
