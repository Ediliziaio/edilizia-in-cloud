import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderResourceStatistics } from "@/components/orders/OrderResourceStatistics";
import { assignment, phase } from "../fixtures/workPlanning";
const m = vi.hoisted(() => ({costs: true, error: false, loading: false, crewError: false, accessError: false, refetch: vi.fn(), manage: vi.fn()}));
vi.mock("@/hooks/useOrderWorkPhases", () => ({useOrderWorkPhases: () => ({
  phases: [phase()], allAssignments: [assignment({phase_id: "p1", executor_label: "Mario Rossi"}), assignment({id: "a2", phase_id: "p2", executor_label: "Mario Rossi"})],
  employees: [] as unknown[], externalTeams: [] as unknown[], isError: m.error, isLoading: m.loading, refetch: m.refetch,
})}));
vi.mock("@/hooks/useOperai", () => ({useSquadreCommessa: () => ({data: [] as unknown[], isError: m.crewError, isLoading: false, refetch: m.refetch})}));
vi.mock("@/hooks/useAccessiCommessa", () => ({useAccessiCommessa: () => ({data: [] as unknown[], isError: m.accessError, isLoading: false, refetch: m.refetch}), nomeAccesso: () => "Capo"}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({canViewCosts: m.costs})}));
vi.mock("@/hooks/useOrderSubcontractStatistics", () => ({useOrderSubcontractStatistics: () => ({data: {count: 1, contracted: 6160, verified: 1000, paid: 900, drafts: 0, pending: 0, disputed: 0, unresolved: 0}, isLoading: false, isError: false})}));
beforeEach(() => {vi.clearAllMocks(); Object.assign(m, {costs: true, error: false, loading: false, crewError: false, accessError: false});});
afterEach(cleanup);
const draw = () => render(<OrderResourceStatistics orderId="o" onManage={m.manage} />);
it("mostra una persona, le ore sommate e nessun editor di assegnazione", () => {
  draw(); expect(screen.getAllByText("Mario Rossi")).toHaveLength(1); expect(screen.getByText("8 h registrate")).toBeInTheDocument();
  expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["Apri Lavorazioni"]);
  fireEvent.click(screen.getByRole("button", {name: "Apri Lavorazioni"})); expect(m.manage).toHaveBeenCalledOnce();
});
it("non mostra né budget né consuntivo senza permesso costi", () => {
  m.costs = false; draw(); expect(screen.queryByText(/costo previsto/)).not.toBeInTheDocument();
  expect(screen.queryByText(/costo registrato/)).not.toBeInTheDocument(); expect(screen.getByText("8 h registrate")).toBeInTheDocument();
  expect(screen.queryByLabelText("Contratti e SAL")).not.toBeInTheDocument();
});
it("distingue costi operai, costi ditte e contratti/SAL senza un totale misto", () => {
  draw(); expect(screen.getByLabelText("Costi operai interni")).toBeInTheDocument();
  expect(screen.getByLabelText("Costi ditte esterne")).toBeInTheDocument();
  expect(screen.getByLabelText("Contratti e SAL")).toHaveTextContent("6.160,00");
  expect(screen.getByText(/non vengono sommati ai costi/)).toBeInTheDocument();
});
it.each(["error", "crewError"] as const)("un errore %s non diventa un riepilogo a zero", key => {
  m[key] = true; draw(); expect(screen.getByRole("alert")).toHaveTextContent("Statistiche non disponibili");
  expect(screen.queryByText("Dipendenti assegnati")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Riprova statistiche"})); expect(m.refetch).toHaveBeenCalled();
});
it("durante il caricamento non mostra totali parziali", () => {
  m.loading = true; draw(); expect(screen.getByRole("status")).toHaveTextContent("Caricamento statistiche");
  expect(screen.queryByText("Mario Rossi")).not.toBeInTheDocument();
});
it("accessi non leggibili non significa nessun capocantiere", () => {
  m.accessError = true; draw(); expect(screen.queryByText("non assegnato")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Riprova accessi"})); expect(m.refetch).toHaveBeenCalledOnce();
});
