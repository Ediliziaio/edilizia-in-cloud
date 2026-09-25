import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderCommessaSummary } from "@/components/orders/OrderCommessaSummary";
import { OrdineStatusStrip } from "@/components/orders/OrdineStatusStrip";
import type { ComponentProps } from "react";

afterEach(cleanup);
const actions = () => ({ onOpenWork: vi.fn(), onOpenPlanning: vi.fn(), onOpenTasks: vi.fn() });
function mount(props: Partial<ComponentProps<typeof OrderCommessaSummary>> = {}) {
  const callbacks = actions();
  render(<OrderCommessaSummary {...callbacks} {...props}><p>Storico verificato</p></OrderCommessaSummary>);
  return callbacks;
}

describe("Riepilogo commessa condiviso", () => {
  it("mostra lo stato senza aprire lo storico", () => {
    mount({ statusName: "In lavorazione" });
    expect(screen.getByText("In lavorazione")).toBeVisible();
    expect(screen.getByText("Storico verificato")).not.toBeVisible();
    fireEvent.click(screen.getByText("Stato e storico"));
    expect(screen.getByText("Storico verificato")).toBeVisible();
  });
  it("non inventa avanzamento o date se non ci sono dati", () => {
    mount();
    expect(screen.getByText("Stato non impostato")).toBeVisible();
    expect(screen.getByText("Senza fasi")).toBeVisible();
    expect(screen.getByText("Da pianificare")).toBeVisible();
    expect(screen.getByText("Nessuna attività aperta")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it("distingue l'avanzamento medio dal numero di fasi completate", () => {
    mount({ progress: { total: 10, done: 0, inCorso: 10, avgPct: 90 } });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "90");
    expect(screen.getByText("0/10 completate · 10 in corso")).toBeVisible();
  });
  it.each([
    [{ workStartDate: "2026-09-01", workEndDate: "2026-10-01" }, "Fine 1 ott 2026", "Inizio 1 set 2026"],
    [{ workStartDate: "2026-09-01" }, "Inizio 1 set 2026", "Fine non impostata"],
    [{ expectedDate: "2026-10-03" }, "Posa 3 ott 2026", "Inizio non impostato"],
    [{ workEndDate: "invalid" }, "Da pianificare", "Nessuna data impostata"],
  ])("rende le date senza confondere posa e fine lavori: %j", (dates, main, secondary) => {
    mount(dates);
    expect(screen.getByText(main)).toBeVisible();
    expect(screen.getByText(secondary)).toBeVisible();
  });
  it("evidenzia attività scaduta e assegnatario", () => {
    mount({ nextTask: { title: "Verifica misure", due_date: "2020-01-01", assigned: { first_name: "Mario", last_name: "Rossi" } } });
    expect(screen.getByText("Verifica misure")).toBeVisible();
    expect(screen.getByText("Scaduta il 1 gen 2020 · Mario Rossi")).toBeVisible();
  });
  it("accetta un'attività senza scadenza", () => {
    mount({ nextTask: { title: "Sopralluogo", due_date: null } });
    expect(screen.getByText("Senza scadenza")).toBeVisible();
  });
  it.each([
    [{ taskLoading: true, progressLoading: true }, "Caricamento…"],
    [{ taskError: true, progressError: true }, "Dati non disponibili"],
  ])("distingue caricamento ed errore dallo stato vuoto", (state, label) => {
    mount(state);
    expect(screen.getAllByText(label)).toHaveLength(2);
    expect(screen.queryByText("Nessuna attività aperta")).not.toBeInTheDocument();
    expect(screen.queryByText("Senza fasi")).not.toBeInTheDocument();
  });
  it("le scorciatoie invocano solo la navigazione corrispondente", () => {
    const callbacks = mount();
    expect(callbacks.onOpenWork).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apri lavorazioni e squadra" }));
    fireEvent.click(screen.getByRole("button", { name: "Apri date e pianificazione" }));
    fireEvent.click(screen.getByRole("button", { name: "Apri attività della commessa" }));
    Object.values(callbacks).forEach(callback => expect(callback).toHaveBeenCalledTimes(1));
  });
});

const statuses = [{ id: "1", name: "Aperta", color: "#64748b", position: 0 }, { id: "2", name: "In corso", color: "#123456", position: 1 }];
describe("Stato in testata", () => {
  it("espone pulsanti accessibili e non ripete il cambio allo stato attuale", () => {
    const change = vi.fn();
    render(<OrdineStatusStrip statuses={statuses} currentStatusId="1" onStatusChange={change} />);
    expect(screen.getByRole("button", { name: "Stato attuale: Aperta" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: 'Imposta stato "In corso"' }));
    expect(change).toHaveBeenCalledWith("2");
  });
  it("resta in sola lettura senza autorizzazione al cambio", () => {
    render(<OrdineStatusStrip statuses={statuses} currentStatusId="1" />);
    screen.getAllByRole("button").forEach(button => expect(button).toBeDisabled());
  });
});
