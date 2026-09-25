import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InternalTeamRosterEditor } from "@/components/employees/InternalTeamRosterEditor";
import type { CrewSnapshot } from "@/lib/orders/internalTeamRoster";

const snapshot: CrewSnapshot = {
  teamId: "team", teamName: "Squadra A", teamActive: true, canManage: true,
  roster: { version: "v1", employeeIds: ["a"], leaderEmployeeId: "a", effectiveFrom: "2026-09-24" },
  employees: [
    { id: "a", name: "Anna Bianchi", active: true, userId: "account" },
    { id: "b", name: "Bruno Rossi", active: true, userId: null },
    { id: "c", name: "Carlo Verdi", active: false, userId: null },
  ],
};
afterEach(cleanup);
const draw = (s = snapshot, save = vi.fn().mockResolvedValue(undefined), reload = vi.fn()) => ({
  save, reload, ...render(<InternalTeamRosterEditor snapshot={s} onSave={save} onReload={reload} />),
});

describe("Composizione dipendenti · UI", () => {
  it("cerca senza perdere le selezioni e accetta persone senza login", async () => {
    const { save } = draw();
    expect(screen.getByRole("button", { name: "Salva composizione" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca dipendente" }), { target: { value: "bruno" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Bruno Rossi/ }));
    expect(screen.getByText("2 dipendenti selezionati")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva composizione" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({ employeeIds: ["a", "b"], leaderEmployeeId: "a", expectedVersion: "v1" });
  });
  it("rimuove il referente quando viene escluso dai membri", () => {
    draw(); fireEvent.click(screen.getByRole("checkbox", { name: /Anna Bianchi/ }));
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salva composizione" })).toBeDisabled();
  });
  it("inattivi non selezionabili, ma un membro diventato inattivo si può rimuovere", () => {
    draw({ ...snapshot, roster: { ...snapshot.roster, employeeIds: ["a", "c"] } });
    expect(screen.getByRole("checkbox", { name: /Carlo Verdi/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Salva composizione" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Carlo Verdi/ }));
    expect(screen.queryByRole("checkbox", { name: /Carlo Verdi/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva composizione" })).toBeEnabled();
  });
  it("non sovrascrive la bozza se arriva una nuova versione in background", () => {
    const { rerender, save, reload } = draw(); fireEvent.click(screen.getByRole("checkbox", { name: /Bruno Rossi/ }));
    rerender(<InternalTeamRosterEditor snapshot={{ ...snapshot, roster: { ...snapshot.roster, version: "v2" } }} onSave={save} onReload={reload} />);
    expect(screen.getByRole("checkbox", { name: /Bruno Rossi/ })).toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent("altra sessione");
    expect(screen.getByRole("button", { name: "Salva composizione" })).toBeDisabled();
  });
  it("riusa ID operazione dopo risposta incerta e conserva input", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Risposta persa")).mockResolvedValue(undefined);
    draw(snapshot, save); fireEvent.click(screen.getByRole("checkbox", { name: /Bruno Rossi/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva composizione" }));
    await screen.findByText("Risposta persa");
    fireEvent.click(screen.getByRole("button", { name: "Salva composizione" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0].operationId).toBe(save.mock.calls[0][0].operationId);
    expect(save.mock.calls[1][0].employeeIds).toEqual(["a", "b"]);
  });
  it("sola lettura impedisce le modifiche anche con selezioni valide", () => {
    draw({ ...snapshot, canManage: false });
    expect(screen.getByRole("checkbox", { name: /Anna Bianchi/ })).toBeDisabled();
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salva composizione" })).toBeDisabled();
  });
  it("blocca doppio invio durante il salvataggio", async () => {
    let complete!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
    draw(snapshot, save); fireEvent.click(screen.getByRole("checkbox", { name: /Bruno Rossi/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva composizione" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvataggio…" }));
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByRole("checkbox", { name: /Bruno Rossi/ })).toBeDisabled();
    complete(); await waitFor(() => expect(screen.getByRole("button", { name: "Salva composizione" })).toBeEnabled());
  });
});
