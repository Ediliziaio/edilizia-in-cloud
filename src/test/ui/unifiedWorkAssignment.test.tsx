import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddAssignmentDialog } from "@/components/orders/AddAssignmentDialog";
import { assignment } from "../fixtures/workPlanning";
const m = vi.hoisted(() => ({
  editOrders: true, editCrew: true, readOnly: false, costs: true, crewError: false, crewLoading: false,
  assignments: [] as Array<{squadra_id: string; phase_id: string | null}>, reads: [] as boolean[],
  add: vi.fn(), crew: vi.fn(), close: vi.fn(), refetch: vi.fn(),
  costReads: [] as boolean[],
  rate: 26 as number | null, rateError: false, rateLoading: false,
}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({canEditOrders: m.editOrders, canEditOperai: m.editCrew, solaLettura: m.readOnly, canViewCosts: m.costs})}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: "company"}})}));
vi.mock("@/hooks/useAssignmentHourlyCost", () => ({useAssignmentHourlyCost: () => ({allowed: m.costs, data: {amount: m.rate}, isError: m.rateError, isLoading: m.rateLoading, refetch: m.refetch})}));
vi.mock("@tanstack/react-query", () => ({useQuery: ({enabled}: {enabled: boolean}) => {m.costReads.push(enabled); return {data: [] as unknown[]};}}));
vi.mock("@/hooks/useOperai", () => ({
  oggiRoma: () => "2026-10-14", messaggioErroreOperai: () => "Salvataggio non riuscito",
  useSquadre: (enabled: boolean) => {m.reads.push(enabled); return {isError: m.crewError, isLoading: m.crewLoading, refetch: m.refetch, data: [{id: "crew1", nome: "Muratori", responsabile: {nome: "Mario", cognome: "Rossi"}, componenti: [{id: "worker", nome: "Luca", cognome: "Bianchi"}]}]};},
  useSquadreCommessa: () => ({data: m.assignments, isError: false, isLoading: false, refetch: m.refetch}),
  useSquadraSuCommessa: () => ({mutate: m.crew}),
}));
beforeEach(() => {vi.clearAllMocks(); Object.assign(m, {editOrders: true, editCrew: true, readOnly: false, costs: true, crewError: false, crewLoading: false, assignments: [], reads: [], costReads: [], rate: 26, rateError: false, rateLoading: false}); HTMLElement.prototype.scrollIntoView = vi.fn();});
afterEach(cleanup);
const draw = (extra = {}) => render(<AddAssignmentDialog orderId="order" phaseId={null} employees={[{id: "worker", label: "Luca Bianchi", campoUserId: "user"}]} externalTeams={[{id: "supplier", label: "Edil Alfa", kind: "esterna"}, {id: "legacy", label: "Squadra legacy", kind: "interna"}]} phases={[{id: "p1", name: "Demolizioni"}, {id: "p2", name: "Posa"}]} aperto onAperto={m.close} onAdd={m.add} {...extra} />);
const select = (name: string) => {fireEvent.keyDown(screen.getByRole("combobox", {name: "Scegli chi"}), {key: "ArrowDown"}); fireEvent.click(screen.getByRole("option", {name}));};
const chooseCrew = () => {fireEvent.click(screen.getByRole("button", {name: "Squadra interna"})); select("Muratori · 1 componenti");};
const confirm = () => fireEvent.click(screen.getByRole("button", {name: "Conferma assegnazione"}));

it("una sola finestra permette tutte le tre scelte, senza scrivere all'apertura", () => {
  draw(); expect(screen.getAllByRole("dialog")).toHaveLength(1);
  for (const name of ["Persona", "Squadra interna", "Ditta"]) expect(screen.getByRole("button", {name})).toBeInTheDocument();
  expect(m.add).not.toHaveBeenCalled(); expect(m.crew).not.toHaveBeenCalled(); expect(m.reads.at(-1)).toBe(false);
});
it("esplicita incarico generale e aggiunta alla fase senza sostituzioni implicite", () => {
  draw(); expect(screen.getByText(/Incarico generale della commessa/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Fase"), {target: {value: "p1"}});
  expect(screen.getByText(/Incarico aggiuntivo su questa lavorazione/)).toHaveTextContent(/non rimuove la squadra generale/);
  expect(m.add).not.toHaveBeenCalled(); expect(m.crew).not.toHaveBeenCalled();
});
it("i listini si caricano soltanto aprendo i costi, non scegliendo una squadra", () => {
  draw(); expect(m.costReads.every(enabled => !enabled)).toBe(true);
  fireEvent.click(screen.getByRole("button", {name: "Ditta"}));
  const detail = screen.getByText("Budget ditta e listino (facoltativo)").closest("details")!;
  act(() => {detail.open = true; fireEvent(detail, new Event("toggle", {bubbles: true}));});
  expect(m.costReads.slice(-2)).toEqual([true, true]);
  fireEvent.click(screen.getByRole("button", {name: "Squadra interna"}));
  expect(m.costReads.slice(-2)).toEqual([false, false]); expect(m.crew).not.toHaveBeenCalled();
});
it("le ore previste generano solo un budget, senza ore o costi consuntivi", () => {
  draw(); select("Luca Bianchi"); fireEvent.click(screen.getByText("Prevedi le ore (facoltativo)"));
  fireEvent.change(screen.getByLabelText("Ore previste"), {target: {value: "16"}}); confirm();
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({cost_preventivo: 416, cost_consuntivo: 0, hours: null}), expect.any(Object));
  expect(screen.queryByLabelText(/Ore già registrate/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Costo consuntivo/)).not.toBeInTheDocument();
});
it("un budget fuori intervallo non rompe il dialog né viene salvato", () => {
  draw(); select("Luca Bianchi"); fireEvent.click(screen.getByText("Prevedi le ore (facoltativo)"));
  fireEvent.change(screen.getByLabelText("Ore previste"), {target: {value: "1e100"}}); confirm();
  expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(m.add).not.toHaveBeenCalled();
});
it.each(["rateError", "rateLoading"] as const)("%s non diventa una tariffa a zero, assegnazione senza budget consentita", key => {
  m[key] = true; draw(); select("Luca Bianchi"); fireEvent.click(screen.getByText("Prevedi le ore (facoltativo)"));
  expect(screen.getByLabelText("Ore previste")).toBeDisabled(); confirm();
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({cost_preventivo: 0, cost_consuntivo: 0, hours: null}), expect.any(Object));
});
it("tariffa mancante non impedisce l'assegnazione ma non inventa un costo", () => {
  m.rate = null; draw(); select("Luca Bianchi"); expect(screen.getByText("da impostare")).toBeInTheDocument(); confirm();
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({cost_preventivo: 0, cost_consuntivo: 0}), expect.any(Object));
});
it("cambiando persona o tipo il budget in ore non viene trascinato", () => {
  draw(); select("Luca Bianchi"); fireEvent.click(screen.getByText("Prevedi le ore (facoltativo)"));
  fireEvent.change(screen.getByLabelText("Ore previste"), {target: {value: "8"}});
  fireEvent.click(screen.getByRole("button", {name: "Ditta"})); select("Edil Alfa"); confirm();
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({cost_preventivo: 0, hours: null}), expect.any(Object));
});
it("la squadra sulla fase usa la RPC esistente e segue le date, senza duplicare ore o costi", () => {
  draw({phaseId: "p1"}); chooseCrew();
  expect(screen.queryByLabelText("Dal")).not.toBeInTheDocument();
  expect(screen.getByText(/La squadra segue le date/)).toBeInTheDocument();
  expect(screen.getByText("Caposquadra: Mario Rossi")).toBeInTheDocument();
  expect(screen.queryByLabelText("Costo previsto manodopera €")).not.toBeInTheDocument();
  confirm(); expect(m.crew).toHaveBeenCalledWith({orderId: "order", squadraId: "crew1", phaseId: "p1", dal: null, al: null, capocantiere: false}, expect.any(Object));
  expect(m.add).not.toHaveBeenCalled();
});
it("la squadra sulla commessa salva il periodo e la richiesta capocantiere", () => {
  draw(); chooseCrew(); fireEvent.change(screen.getByLabelText("Al"), {target: {value: "2026-10-20"}});
  fireEvent.click(screen.getByRole("checkbox", {name: /Usa il caposquadra/})); confirm();
  expect(m.crew).toHaveBeenCalledWith(expect.objectContaining({phaseId: null, dal: "2026-10-14", al: "2026-10-20", capocantiere: true}), expect.any(Object));
});
it("le date invertite non raggiungono la mutation", () => {
  draw(); chooseCrew(); fireEvent.change(screen.getByLabelText("Al"), {target: {value: "2026-10-01"}}); confirm();
  expect(m.crew).not.toHaveBeenCalled();
});
it("una squadra già presente nello stesso ambito non viene sovrascritta dal nuovo inserimento", () => {
  m.assignments = [{squadra_id: "crew1", phase_id: "p1"}]; draw({phaseId: "p1"}); chooseCrew(); confirm();
  expect(m.crew).not.toHaveBeenCalled();
});
it("la stessa squadra può lavorare su una fase diversa", () => {
  m.assignments = [{squadra_id: "crew1", phase_id: "p1"}]; draw({phaseId: "p2"}); chooseCrew(); confirm();
  expect(m.crew).toHaveBeenCalledWith(expect.objectContaining({phaseId: "p2"}), expect.any(Object));
});
it("cambiando tipo non trascina persona, costi o capocantiere nella nuova scelta", () => {
  draw(); chooseCrew(); fireEvent.click(screen.getByRole("checkbox", {name: /Usa il caposquadra/}));
  fireEvent.click(screen.getByRole("button", {name: "Persona"}));
  expect(screen.getByRole("button", {name: "Conferma assegnazione"})).toBeDisabled(); select("Luca Bianchi"); confirm();
  expect(m.crew).not.toHaveBeenCalled(); expect(m.add).toHaveBeenCalledWith(expect.objectContaining({executor_type: "interno", employee_id: "worker", external_team_id: null, hours: null, cost_consuntivo: 0}), expect.any(Object));
});
it("una ditta non offre squadre interne legacy e non registra ore da dipendente", () => {
  draw(); fireEvent.click(screen.getByRole("button", {name: "Ditta"}));
  fireEvent.keyDown(screen.getByRole("combobox", {name: "Scegli chi"}), {key: "ArrowDown"});
  expect(screen.queryByRole("option", {name: "Squadra legacy"})).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("option", {name: "Edil Alfa"})); confirm();
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({executor_type: "esterno", employee_id: null, external_team_id: "supplier", hours: null}), expect.any(Object)); expect(m.crew).not.toHaveBeenCalled();
});
it("un dipendente già assegnato alla fase non crea un secondo costo", () => {
  draw({phaseId: "p1", existingAssignments: [assignment({employee_id: "worker", phase_id: "p1"})]}); select("Luca Bianchi"); confirm(); expect(m.add).not.toHaveBeenCalled();
});
it.each(["crewError", "crewLoading"] as const)("con %s le squadre non vengono considerate vuote o salvate", key => {
  m[key] = true; draw(); fireEvent.click(screen.getByRole("button", {name: "Squadra interna"}));
  expect(screen.getByRole("button", {name: "Conferma assegnazione"})).toBeDisabled(); expect(m.crew).not.toHaveBeenCalled();
  if (key === "crewError") {fireEvent.click(screen.getByRole("button", {name: "Riprova squadre"})); expect(m.refetch).toHaveBeenCalled();}
});
it("chi gestisce solo gli operai può assegnare squadre ma non singoli costi o ditte", () => {
  m.editOrders = false; draw(); expect(screen.queryByRole("button", {name: "Persona"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Ditta"})).not.toBeInTheDocument(); select("Muratori · 1 componenti"); confirm(); expect(m.crew).toHaveBeenCalled(); expect(m.add).not.toHaveBeenCalled();
});
it("sola lettura rimane tale anche con un dialog aperto da fuori", () => {
  m.readOnly = true; draw(); expect(screen.getByRole("button", {name: "Conferma assegnazione"})).toBeDisabled(); expect(m.crew).not.toHaveBeenCalled(); expect(m.add).not.toHaveBeenCalled();
});
it("dopo errore di salvataggio consente il tentativo successivo senza bloccarsi", async () => {
  draw(); chooseCrew(); confirm(); expect(screen.getByRole("button", {name: "Annulla"})).toBeDisabled();
  const options = m.crew.mock.calls[0][1]; act(() => options.onError(new Error("errore")));
  await waitFor(() => expect(screen.getByRole("button", {name: "Conferma assegnazione"})).not.toBeDisabled());
  confirm(); expect(m.crew).toHaveBeenCalledTimes(2);
});
it("annullare non crea né rimuove dati", () => {
  draw(); chooseCrew(); fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Annulla"}));
  expect(m.close).toHaveBeenCalledWith(false); expect(m.crew).not.toHaveBeenCalled(); expect(m.add).not.toHaveBeenCalled();
});
