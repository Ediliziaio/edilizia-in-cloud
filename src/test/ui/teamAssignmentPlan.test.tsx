import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {TeamAssignmentPlan} from "@/components/orders/TeamAssignmentPlan";
import {assignment, phase} from "../fixtures/workPlanning";
const m = vi.hoisted(() => ({edit: true, update: vi.fn(), remove: vi.fn()}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({canEditOrders: m.edit, canViewCosts: true, canManagePayments: true})}));
vi.mock("@/components/manodopera/SquadreCommessa", () => ({SquadreFase: () => <p>Gestione squadra della lavorazione</p>}));
beforeEach(() => {vi.clearAllMocks(); m.edit = true; m.update.mockResolvedValue(undefined);});
afterEach(cleanup);
const draw = (extra = {}) => render(<TeamAssignmentPlan orderId="o" phases={[phase()]} unassigned={[]} crews={[]} equipment={[]} employees={[{id: "e1", label: "Mario Rossi", campoUserId: "u"}]} externalTeams={[]} canManageCrews={m.edit} renderAddAssignment={() => m.edit ? <button>Assegna alla lavorazione</button> : null} onUpdate={m.update} onDelete={m.remove} {...extra} />);
it("mostra subito il collegamento fase/persona ma non una seconda tabella dei costi", () => {
  draw(); expect(screen.getByRole("button", {name: "Risorse per Opere murarie"})).toHaveTextContent("Mario Rossi");
  expect(screen.queryByText("Costo previsto")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Gestisci Mario Rossi"})).not.toBeInTheDocument(); expect(m.update).not.toHaveBeenCalled();
});
it("aprire una lavorazione permette di gestire la stessa riga, non di duplicarla", async () => {
  draw({phases: [phase(), phase({id: "p2", name: "Collaudo", assignments: []})]});
  fireEvent.click(screen.getByRole("button", {name: "Risorse per Opere murarie"}));
  fireEvent.click(screen.getByRole("button", {name: "Gestisci Mario Rossi"}));
  fireEvent.change(screen.getByLabelText("Lavorazione assegnata"), {target: {value: "p2"}});
  fireEvent.click(screen.getByRole("button", {name: "Salva modifiche"}));
  await waitFor(() => expect(m.update).toHaveBeenCalledWith("a1", "employee", {phase_id: "p2"})); expect(m.remove).not.toHaveBeenCalled();
});
it("una fase completata non perde lo storico delle persone", () => {
  draw({phases: [phase({status: "completata"})]});
  expect(screen.getByRole("button", {name: "Risorse per Opere murarie"})).toHaveTextContent("Completata");
  expect(screen.getByRole("button", {name: "Risorse per Opere murarie"})).toHaveTextContent("Mario Rossi");
});
it("conserva note e costi nell'editor a richiesta, senza riempire il riepilogo", () => {
  draw({unassigned: [assignment({id: "g", notes: "Nota lunga della commessa"})], phases: []});
  expect(screen.getByText("Note assegnazione").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", {name: "Gestisci Mario Rossi"}));
  expect(screen.getByLabelText("Attività e accordi")).toHaveValue("Nota lunga della commessa");
  expect(screen.getByText("Costi e registrazione pagamento").closest("details")).not.toHaveAttribute("open");
});
it("le risorse restano consultabili in sola lettura, senza azioni di modifica", () => {
  m.edit = false; draw(); fireEvent.click(screen.getByRole("button", {name: "Risorse per Opere murarie"}));
  expect(screen.getByText("Mario Rossi", {selector: "p"})).toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Gestisci Mario Rossi"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Assegna alla lavorazione"})).not.toBeInTheDocument();
});
it("le fasi prive di assegnazioni non fanno sparire le assegnazioni generali", () => {
  draw({phases: [phase({assignments: []})], unassigned: [assignment({id: "general"})]});
  expect(screen.getByRole("region", {name: "Risorse per tutta la commessa"})).toHaveTextContent("Mario Rossi");
  expect(screen.getByRole("button", {name: "Risorse per Opere murarie"})).toHaveTextContent("Nessuna assegnazione specifica");
});
it("aprire e richiudere una lavorazione non modifica né cancella nulla", () => {
  draw(); const button = screen.getByRole("button", {name: "Risorse per Opere murarie"});
  fireEvent.click(button); expect(button).toHaveAttribute("aria-expanded", "true"); fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "false"); expect(m.update).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled();
});
