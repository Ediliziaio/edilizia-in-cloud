import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkAssignmentRow } from "@/components/orders/WorkAssignmentRow";
import { assignment } from "../fixtures/workPlanning";

const permissions = vi.hoisted(() => ({ canEditOrders: true, canViewCosts: true, canManagePayments: true }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permissions }));
const update = vi.fn();
const remove = vi.fn();
const props = () => ({ assignment: assignment(), employees: [{ id: "e1", label: "Mario Rossi" }], externalTeams: [{ id: "s1", label: "Edil Alfa" }],
  phases: [{ id: "p1", name: "Opere murarie" }], onUpdate: update, onDelete: remove });
const edit = () => fireEvent.click(screen.getByRole("button", { name: "Gestisci Mario Rossi" }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); Object.assign(permissions, { canEditOrders: true, canViewCosts: true, canManagePayments: true }); update.mockResolvedValue(undefined); remove.mockResolvedValue(undefined); });

describe("Assegnazione manodopera", () => {
  it("mostra identità e ore senza campi di costo in modifica immediata", () => {
    render(<WorkAssignmentRow {...props()} />);
    expect(screen.getByText("Dipendente")).toBeInTheDocument();
    expect(screen.getByText("4 h registrate")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
  it("sposta una riga esistente senza ricreare o riscrivere costi", async () => {
    render(<WorkAssignmentRow {...props()} />); edit();
    fireEvent.change(screen.getByLabelText("Lavorazione assegnata"), { target: { value: "p1" } }); save();
    await waitFor(() => expect(update).toHaveBeenCalledWith({ phase_id: "p1" }));
    expect(remove).not.toHaveBeenCalled();
  });
  it("annullare non salva note o costi", () => {
    render(<WorkAssignmentRow {...props()} />); edit();
    fireEvent.change(screen.getByLabelText("Attività e accordi"), { target: { value: "Bozza" } });
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(update).not.toHaveBeenCalled(); edit(); expect(screen.getByLabelText("Attività e accordi")).toHaveValue("Posa rivestimenti");
  });
  it("non riscrive costi aggiornati da un rapportino mentre il dialog è aperto", async () => {
    const p = props(); const { rerender } = render(<WorkAssignmentRow {...p} />); edit();
    rerender(<WorkAssignmentRow {...p} assignment={assignment({ cost_consuntivo: 300, hours: 10 })} />);
    fireEvent.change(screen.getByLabelText("Attività e accordi"), { target: { value: "Nuova nota" } }); save();
    await waitFor(() => expect(update).toHaveBeenCalledWith({ notes: "Nuova nota" }));
  });
  it("mantiene aperta la bozza dopo errore e consente il retry", async () => {
    update.mockRejectedValueOnce(new Error("offline"));
    render(<WorkAssignmentRow {...props()} />); edit();
    fireEvent.change(screen.getByLabelText("Attività e accordi"), { target: { value: "Nuova nota" } }); save();
    await screen.findByRole("alert"); expect(screen.getByLabelText("Attività e accordi")).toHaveValue("Nuova nota");
    save(); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(update).toHaveBeenCalledTimes(2);
  });
  it("rifiuta ore e costi negativi", () => {
    render(<WorkAssignmentRow {...props()} />); edit();
    fireEvent.change(screen.getByLabelText("Ore registrate"), { target: { value: "-2" } }); save();
    expect(screen.getByRole("alert")).toBeInTheDocument(); expect(update).not.toHaveBeenCalled();
  });
  it("rispetta la sola lettura", () => {
    permissions.canEditOrders = false; render(<WorkAssignmentRow {...props()} />);
    expect(screen.queryByRole("button", { name: /Gestisci/ })).not.toBeInTheDocument();
  });
  it("permette note senza mostrare o inviare costi riservati", async () => {
    permissions.canViewCosts = false; render(<WorkAssignmentRow {...props()} />); edit();
    expect(screen.queryByText("Costi e registrazione pagamento")).not.toBeInTheDocument();
    expect(screen.queryByText("Budget")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Attività e accordi"), { target: { value: "Nota operativa" } }); save();
    await waitFor(() => expect(update).toHaveBeenCalledWith({ notes: "Nota operativa" }));
  });
  it("non abilita il pagamento senza permesso", () => {
    permissions.canManagePayments = false; render(<WorkAssignmentRow {...props()} />); edit();
    expect(screen.queryByRole("switch", { hidden: true })).not.toBeInTheDocument();
  });
  it("distingue la squadra esterna e non espone ore che non sarebbero salvate", () => {
    render(<WorkAssignmentRow {...props()} assignment={assignment({ executor_type: "esterno", source: "team", employee_id: null as null, external_team_id: "s1" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Gestisci Edil Alfa" }));
    expect(screen.queryByLabelText("Ore registrate")).not.toBeInTheDocument();
  });
  it("richiede conferma prima di rimuovere la riga economica", () => {
    render(<WorkAssignmentRow {...props()} />); edit(); fireEvent.click(screen.getByRole("button", { name: "Rimuovi" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument(); expect(remove).not.toHaveBeenCalled();
  });
});
