import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InternalTeamShiftEditor } from "@/components/orders/InternalTeamShiftEditor";
import type { CrewSnapshot } from "@/lib/orders/internalTeamRoster";

const snapshot: CrewSnapshot = { teamId: "t", teamName: "Squadra", teamActive: true, canManage: false,
  roster: { version: "v1", employeeIds: ["a", "b"], leaderEmployeeId: "a", effectiveFrom: "2026-09-24" },
  employees: [{ id: "a", name: "Anna Bianchi", active: true, userId: "ua" }, { id: "b", name: "Bruno Rossi", active: true, userId: null as null }, { id: "c", name: "Carlo Verdi", active: true, userId: "uc" }] };
afterEach(cleanup);
const draw = (save = vi.fn().mockResolvedValue(undefined), canPlan = true) => {
  const props = { snapshot, phases: [{ id: "p", name: "Posa" }], workDate: "2026-09-24", shifts: [] as never[], canPlan, onSave: save, onReload: vi.fn() };
  return { save, props, ...render(<InternalTeamShiftEditor {...props} />) };
};
describe("Turno squadra · UI", () => {
  it("squadra precompilata, assenti esclusi e sostituti senza cambiare il roster", async () => {
    const { save } = draw();
    fireEvent.click(screen.getByRole("checkbox", { name: /Anna Bianchi/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Carlo Verdi/ }));
    expect(screen.getByLabelText("Referente del turno")).toHaveValue("");
    expect(screen.getByText(/1 non previsti · 1 sostituti/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pianifica turno" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({ employeeIds: ["b", "c"], leaderEmployeeId: null as null, rosterVersion: "v1", startTime: "08:00", endTime: "12:00" });
    expect(snapshot.roster.employeeIds).toEqual(["a", "b"]);
  });
  it("mantiene selezioni attraverso la ricerca", () => {
    draw(); fireEvent.change(screen.getByLabelText("Cerca persona nel turno"), { target: { value: "carlo" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Carlo/ }));
    expect(screen.getByText(/Chi sarà presente · 3 persone/)).toBeInTheDocument();
  });
  it("errori mantengono bozza e chiave della richiesta", async () => {
    const { save } = draw(vi.fn().mockRejectedValueOnce(new Error("Risposta persa")).mockResolvedValue(undefined));
    fireEvent.click(screen.getByRole("button", { name: "Pianifica turno" })); await screen.findByText("Risposta persa");
    fireEvent.click(screen.getByRole("button", { name: "Pianifica turno" })); await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[0][0].operationId).toBe(save.mock.calls[1][0].operationId);
    expect(save.mock.calls[0][0].shiftId).toBe(save.mock.calls[1][0].shiftId);
  });
  it("la bozza non viene sovrascritta da un aggiornamento in background", () => {
    const { rerender, props } = draw(); fireEvent.click(screen.getByRole("checkbox", { name: /Carlo/ }));
    rerender(<InternalTeamShiftEditor {...props} snapshot={{ ...snapshot, roster: { ...snapshot.roster, version: "v2" } }} />);
    expect(screen.getByRole("checkbox", { name: /Carlo/ })).toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent(/altra sessione/);
    expect(screen.getByRole("button", { name: "Pianifica turno" })).toBeDisabled();
  });
  it("blocca intervalli invalidi e sola lettura", () => {
    draw(); fireEvent.change(screen.getByLabelText("Alle"), { target: { value: "07:00" } });
    expect(screen.getByRole("button", { name: "Pianifica turno" })).toBeDisabled();
    cleanup(); draw(undefined, false); expect(screen.getByRole("checkbox", { name: /Anna/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pianifica turno" })).toBeDisabled();
  });
  it("non invia due volte e blocca input durante il salvataggio", async () => {
    let done!: () => void; const save = vi.fn(() => new Promise<void>(r => { done = r; })); draw(save);
    fireEvent.click(screen.getByRole("button", { name: "Pianifica turno" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvataggio…" }));
    expect(save).toHaveBeenCalledOnce(); expect(screen.getByLabelText("Giorno")).toBeDisabled();
    done(); await waitFor(() => expect(screen.getByRole("button", { name: "Pianifica turno" })).toBeEnabled());
  });
});
