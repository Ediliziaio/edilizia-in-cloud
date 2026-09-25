import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderLaborCosts } from "@/components/orders/OrderLaborCosts";
import { OrdineRapportiniCampo } from "@/components/orders/OrdineRapportiniCampo";

const state = vi.hoisted(() => ({
  assignments: [] as Array<Record<string, unknown>>, reports: [] as Array<Record<string, unknown>>,
  assignmentsError: false, subError: false, canEdit: true, canViewCosts: true,
  from: vi.fn(), invalidate: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(),
  recheck: vi.fn(), notifyPdf: vi.fn().mockResolvedValue(null),
}));
// Il client PDF ha test dedicati; qui verifichiamo che l'approvazione lo avvii.
vi.mock("@/lib/campo/rapportinoPdf", () => ({ notifyRapportinoPdf: state.notifyPdf, openRapportinoPdf: vi.fn() }));
vi.mock("@/lib/campo/loadLaborReview", () => ({ recheckLaborApproval: state.recheck }));
vi.mock("@/components/orders/LaborApprovalDialog", () => ({ LaborApprovalDialog: ({onApprove}: {onApprove: (fingerprint: string, acknowledged: boolean) => void}) =>
  <button onClick={() => onApprove("fingerprint", true)}>Conferma approvazione</button> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" }, role: "company_admin" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: state.canEdit, canViewCosts: state.canViewCosts }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [
  { id: "worker", first_name: "Mario", last_name: "Rossi", roles: ["worker"] },
  { id: "sub", first_name: "Luca", last_name: "Bianchi", roles: ["subcontractor"] },
] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from, auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) } } }));
vi.mock("sonner", () => ({ toast: { success: state.success, warning: state.warning, error: state.error } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "order-campo-assignments" ? state.assignments : queryKey[0] === "order-campo-rapportini" ? state.reports : [],
    isError: queryKey[0] === "order-campo-assignments" ? state.assignmentsError : state.subError,
    isLoading: false, refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
  useMutation: (config: { mutationFn: (arg: unknown) => Promise<unknown>; onSuccess?: (result: unknown) => void; onError?: (error: unknown) => void }) => ({
    isPending: false,
    mutate: async (arg: unknown) => { try { const result = await config.mutationFn(arg); config.onSuccess?.(result); } catch (e) { config.onError?.(e); } },
  }),
}));
const assignment = { id: "a", user_id: "worker", role_type: "employee", is_capocantiere: false, data_inizio: "2026-09-01", data_fine_prevista: null as string | null, note: "Preservare",
  profile: { id: "worker", first_name: "Mario", last_name: "Rossi" } };
const draw = () => render(<MemoryRouter><OrderLaborCosts orderId="order" /></MemoryRouter>);
const choose = (name: string) => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Utente" }), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(name) }));
};
function builder(data: unknown = null, error: unknown = null) {
  const result = { data, error }; const q = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), select: vi.fn(), eq: vi.fn(), limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result), then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
  for (const method of [q.insert, q.update, q.delete, q.select, q.eq, q.limit]) method.mockReturnValue(q);
  return q;
}
beforeEach(() => {
  vi.clearAllMocks(); state.assignments = []; state.reports = []; state.assignmentsError = false; state.subError = false; state.canEdit = true; state.canViewCosts = true;
  state.from.mockImplementation(() => builder());
  state.recheck.mockResolvedValue({stato:"inviato",updated_at:"version"});
});
afterEach(cleanup);

describe("Gestione Campo: protezioni e percorso semplice", () => {
  it("non chiama il database aprendo e annullando il dialog", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna accesso app Campo" }));
    fireEvent.click(screen.getByRole("button", { name: "Annulla" })); expect(state.from).not.toHaveBeenCalled();
  });
  it("seleziona il ruolo reale e blocca date invertite", () => {
    draw(); fireEvent.click(screen.getByRole("button", { name: "Assegna accesso app Campo" })); choose("Luca Bianchi");
    expect(screen.getByRole("combobox", { name: "Ruolo nell'app" })).toHaveTextContent("Subappaltatore");
    expect(screen.getByRole("combobox", { name: "Ruolo nell'app" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Data inizio"), { target: { value: "2026-10-12" } });
    fireEvent.change(screen.getByLabelText("Data fine prevista"), { target: { value: "2026-10-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("fine prevista");
    expect(screen.getAllByRole("button", { name: "Assegna" }).at(-1)).toBeDisabled();
    expect(state.from).not.toHaveBeenCalled();
  });
  it("non crea una riga dipendente quando assegna un subappaltatore", async () => {
    const q = builder(); state.from.mockReturnValue(q); draw();
    fireEvent.click(screen.getByRole("button", { name: "Assegna accesso app Campo" })); choose("Luca Bianchi");
    fireEvent.click(screen.getAllByRole("button", { name: "Assegna" }).at(-1)!);
    await waitFor(() => expect(q.insert).toHaveBeenCalled());
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "sub", role_type: "subcontractor" }));
    expect(state.from).not.toHaveBeenCalledWith("employees");
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["campo-squadra", "order"] }));
  });
  it("nomina un dipendente già presente aggiornando la stessa assegnazione", async () => {
    state.assignments = [assignment]; const access = builder({ id: "a" }); const emp = builder({ id: "e", costo_orario: 20 }); const labor = builder({ id: "labor" });
    state.from.mockImplementation(t => t === "employees" ? emp : t === "order_employees" ? labor : access); draw();
    fireEvent.click(screen.getByRole("button", { name: "Assegna" })); choose("Mario Rossi");
    expect(screen.getByLabelText("Note (opzionale)")).toHaveValue("Preservare");
    fireEvent.click(screen.getAllByRole("button", { name: "Assegna" }).at(-1)!);
    await waitFor(() => expect(access.update).toHaveBeenCalledWith(expect.objectContaining({ user_id: "worker", is_capocantiere: true, note: "Preservare" })));
    expect(access.insert).not.toHaveBeenCalled(); expect(labor.insert).not.toHaveBeenCalled();
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["order_work_phases", "order"] }));
  });
  it("non scambia un errore di lettura per zero accessi", () => {
    state.assignmentsError = true; draw();
    expect(screen.getByRole("alert")).toHaveTextContent("Impossibile verificare gli accessi");
    expect(screen.queryByText("Nessun altro accesso esplicito registrato.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assegna accesso app Campo" })).toBeDisabled();
  });
  it("richiede conferma e spiega che rimuovere una riga non revoca ogni accesso", () => {
    state.assignments = [assignment]; draw();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi assegnazione esplicita Mario Rossi" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("non è una revoca completa");
    expect(state.from).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(state.from).not.toHaveBeenCalled();
  });
  it("dopo la rimozione confermata aggiorna anche ruolo e squadra", async () => {
    state.assignments = [assignment]; const q = builder({ id: "a" }); state.from.mockReturnValue(q); draw();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi assegnazione esplicita Mario Rossi" }));
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi assegnazione" }));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["campo-ruolo", "order"] }));
    expect(q.eq).toHaveBeenCalledWith("id", "a"); expect(q.eq).toHaveBeenCalledWith("order_id", "order");
  });
  it("conserva il dialog e segnala l'errore se la rimozione fallisce", async () => {
    state.assignments = [assignment]; state.from.mockReturnValue(builder(null, new Error("RLS"))); draw();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi assegnazione esplicita Mario Rossi" }));
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi assegnazione" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled()); expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(state.success).not.toHaveBeenCalled();
  });
  it("non offre azioni senza permesso di modifica", () => {
    state.canEdit = false; state.assignments = [assignment]; draw();
    expect(screen.queryByRole("button", { name: /Rimuovi assegnazione/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assegna accesso app Campo" })).not.toBeInTheDocument();
  });
  it("non comunica successo se la policy non ha rimosso nessuna riga", async () => {
    state.assignments = [assignment]; draw();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi assegnazione esplicita Mario Rossi" }));
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi assegnazione" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.success).not.toHaveBeenCalled(); expect(state.invalidate).not.toHaveBeenCalled();
  });
});

describe("Rapportini: permessi e aggiornamento del consuntivo", () => {
  const report = { id: "r", stato: "inviato", data_lavoro: "2026-09-24", ore_lavorate: 8, autore: { first_name: "Mario", last_name: "Rossi" }, costo_manodopera: 160 };
  it("non consente approvazione a staff senza modifica commesse", () => {
    state.canEdit = false; state.reports = [report]; render(<OrdineRapportiniCampo orderId="order" />);
    fireEvent.click(screen.getByText(/Mario Rossi/));
    expect(screen.queryByRole("button", { name: /Approva/ })).not.toBeInTheDocument();
  });
  it("aggiorna costi e semaforo dopo approvazione", async () => {
    state.reports = [report]; state.from.mockReturnValue(builder({ id: "r", fasi_lavorate: [] })); render(<OrdineRapportiniCampo orderId="order" />);
    fireEvent.click(screen.getByText(/Mario Rossi/));
    fireEvent.click(screen.getByRole("button", { name: /Approva/ }));
    expect(state.from).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name:"Conferma approvazione"}));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["oes-employees", "order"] }));
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["order-schedule-health", "order"] });
    expect(state.notifyPdf).toHaveBeenCalledWith("r", "order", expect.objectContaining({ invalidateQueries: state.invalidate }));
  });
  it("nasconde il costo registrato a chi non può vedere i costi", () => {
    state.canViewCosts = false; state.reports = [{ ...report, stato: "approvato" }]; render(<OrdineRapportiniCampo orderId="order" />);
    fireEvent.click(screen.getByText(/Mario Rossi/));
    expect(screen.queryByText(/Costo manodopera registrato/)).not.toBeInTheDocument();
  });
  it("non comunica approvazione se il database non ha aggiornato righe", async () => {
    state.reports = [report]; render(<OrdineRapportiniCampo orderId="order" />);
    fireEvent.click(screen.getByText(/Mario Rossi/)); fireEvent.click(screen.getByRole("button", { name: /Approva/ }));
    fireEvent.click(screen.getByRole("button", {name:"Conferma approvazione"}));
    await waitFor(() => expect(state.error).toHaveBeenCalled()); expect(state.success).not.toHaveBeenCalled(); expect(state.invalidate).not.toHaveBeenCalled();
    expect(state.notifyPdf).not.toHaveBeenCalled();
  });
  it("non scrive se il controllo fresco rileva altri dati o tariffe", async () => {
    state.reports=[report]; state.recheck.mockRejectedValue(new Error("Ore, tariffe o altri rapportini sono cambiati"));
    render(<OrdineRapportiniCampo orderId="order"/>);
    fireEvent.click(screen.getByText(/Mario Rossi/)); fireEvent.click(screen.getByRole("button",{name:/Approva/}));
    fireEvent.click(screen.getByRole("button",{name:"Conferma approvazione"}));
    await waitFor(()=>expect(state.error).toHaveBeenCalledWith(expect.stringContaining("sono cambiati")));
    expect(state.from).not.toHaveBeenCalled();expect(state.success).not.toHaveBeenCalled();
  });
  it("limita l'approvazione alla versione e all'azienda controllate", async () => {
    state.reports=[report];const q=builder({id:"r",fasi_lavorate:[]});state.from.mockReturnValue(q);
    render(<OrdineRapportiniCampo orderId="order"/>);
    fireEvent.click(screen.getByText(/Mario Rossi/));fireEvent.click(screen.getByRole("button",{name:/Approva/}));
    fireEvent.click(screen.getByRole("button",{name:"Conferma approvazione"}));
    await waitFor(()=>expect(q.update).toHaveBeenCalled());
    expect(q.eq).toHaveBeenCalledWith("company_id","company");expect(q.eq).toHaveBeenCalledWith("updated_at","version");expect(q.eq).toHaveBeenCalledWith("stato","inviato");
  });
  it("espone lo zero registrato senza dichiararlo lavoro gratuito", () => {
    state.reports=[{...report,stato:"approvato",costo_manodopera:0}];render(<OrdineRapportiniCampo orderId="order"/>);
    fireEvent.click(screen.getByText(/Mario Rossi/));expect(screen.getByText(/Zero registrato/)).toBeInTheDocument();
  });
});
