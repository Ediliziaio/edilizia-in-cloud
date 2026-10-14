import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardAgenda } from "@/components/attivita/DashboardAgenda";
import { DEFAULT_TASK_STATUS_DEFINITIONS } from "@/lib/taskStatuses";
import type { DashboardTask } from "@/lib/attivita/dashboardTasks";

const state = vi.hoisted(() => ({
  mobile: false, canViewOrders: true, canViewScadenzario: true, canViewMarketingAppointments: true, solaLettura: false,
  calls: [] as [string, string][], orderError: false, retry: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" }, effectiveCompany: { id: "company" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ ...state, canViewCalendar: true, isLoading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/hooks/useDashboardAgenda", () => ({ useDashboardAgenda: (from: string, to: string) => {
  state.calls.push([from, to]);
  const result = (data: unknown[], isError = false) => ({ data, isError, isLoading: false, refetch: state.retry });
  return {
    orders: result([{ id: "order", order_code: "ORD-1", description: "Casa", work_start_date: "2026-10-14", work_end_date: "2026-10-15", expected_date: null, warehouse_arrival_date: null }], state.orderError),
    deadlines: result([{ id: "deadline", description: "Fornitore", due_date: "2026-10-14", tipo: "uscita", status: "da_pagare" }]),
    appointments: result([{ id: "appointment", title: "Sopralluogo", appointment_date: "2026-10-14", appointment_time: "06:15", status: "confermato", assigned_to: "me" }, { id: "foreign-appointment", title: "Appuntamento privato altrui", appointment_date: "2026-10-14", appointment_time: "08:00", status: "confermato", assigned_to: "other" }]),
    leaves: result([
      { id: "foreign-leave", tipo: "ferie", data_inizio: "2026-10-14", data_fine: "2026-10-14", profilo: { nome: "Collega", cognome: "Privato", user_id: "other" } },
      { id: "own-field-leave", tipo: "permesso", data_inizio: "2026-10-14", data_fine: "2026-10-14", user_id: "me", profilo: null },
    ]), holidays: result([]),
  };
} }));
const task = { id: "task", title: "Verifica capitolato", due_date: "2026-10-14", status: "da_fare", assigned_to: "me" } as DashboardTask;
const handlers = { onTasksRetry: vi.fn(), onDateSelect: vi.fn(), onAddTask: vi.fn(), onTaskOpen: vi.fn() };
function page(extra = {}) {
  return render(<MemoryRouter><DashboardAgenda tasks={[task]} statuses={DEFAULT_TASK_STATUS_DEFINITIONS} selectedDate="2026-10-14" {...handlers} {...extra} /></MemoryRouter>);
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 14, 12));
  localStorage.clear(); state.mobile = false; state.solaLettura = false; state.orderError = false;
  state.canViewOrders = true; state.canViewScadenzario = true; state.canViewMarketingAppointments = true; state.calls = [];
  Object.values(handlers).forEach(fn => fn.mockClear()); state.retry.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Agenda della Dashboard", () => {
  it("spiega la visibilità personale e separa lo scadenzario aziendale", () => {
    page();
    expect(screen.getByRole("heading", { name: "Agenda personale" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Attività aperte" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Incassi e pagamenti" })).toBeNull();
    expect(screen.getByRole("link", { name: "scadenzario aziendale" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Calendario lavori" }).getAttribute("href")).toBe("/azienda/calendario");
    expect(screen.getByText(/Qui vedi le attività/).textContent).toContain("anche se sei amministratore");
  });
  it("selezionare un giorno filtra la lista con una data precisa", () => {
    page(); fireEvent.click(screen.getByRole("button", { name: /^giovedì 15 ottobre 2026:/ }));
    expect(handlers.onDateSelect).toHaveBeenCalledWith("2026-10-15");
  });
  it("gli eventi aprono l'attività corretta e i record di provenienza", () => {
    page(); const day = within(screen.getByRole("region", { name: "Eventi del giorno selezionato" }));
    fireEvent.click(day.getByRole("button", { name: "Apri attività: Verifica capitolato" }));
    expect(handlers.onTaskOpen).toHaveBeenCalledWith("task");
    expect(day.getByRole("link", { name: /Inizio posa/ }).getAttribute("href")).toBe("/azienda/ordini/order");
    expect(day.queryByRole("link", { name: /Pagamento/ })).toBeNull();
    expect(day.getByRole("link", { name: /Sopralluogo/ }).textContent).toContain("06:15");
  });
  it("crea per la data selezionata, anche se è passata", () => {
    page({ selectedDate: "2026-10-13" });
    fireEvent.click(screen.getByRole("button", { name: "Nuova attività" }));
    expect(handlers.onAddTask).toHaveBeenCalledWith("2026-10-13");
  });
  it("Giorno mantiene la selezione invece di saltare a oggi", () => {
    page({ selectedDate: "2026-10-31" }); fireEvent.click(screen.getByRole("button", { name: "giorno" }));
    expect(state.calls.at(-1)).toEqual(["2026-10-31", "2026-10-31"]);
    expect(screen.getByRole("button", { name: "sabato 31 ottobre" })).toBeTruthy();
  });
  it("Settimana carica anche la domenica del mese successivo", () => {
    page({ selectedDate: "2026-10-31" }); fireEvent.click(screen.getByRole("button", { name: "settimana" }));
    expect(state.calls.at(-1)).toEqual(["2026-10-26", "2026-11-01"]);
    expect(screen.getByRole("button", { name: "domenica 1 novembre" })).toBeTruthy();
  });
  it("nessun salto automatico al mese dell'ultima attività; Oggi è esplicito", () => {
    page({ tasks: [{ ...task, due_date: "2027-02-20" }] });
    expect(state.calls[0]).toEqual(["2026-09-28", "2026-11-01"]);
    fireEvent.click(screen.getByRole("button", { name: "Oggi" }));
    expect(handlers.onDateSelect).toHaveBeenCalledWith("2026-10-14");
  });
  it("i permessi nascondono fonti e dati già presenti in cache", () => {
    state.canViewOrders = false; state.canViewScadenzario = false; state.canViewMarketingAppointments = false;
    page(); expect(screen.queryByRole("button", { name: "Le mie commesse" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Pagamento|Inizio posa|Sopralluogo/ })).toBeNull();
  });
  it("spegnere una fonte nasconde anche i dati cached e salva una preferenza personale", () => {
    page(); fireEvent.click(screen.getByRole("button", { name: "Le mie commesse" }));
    expect(screen.queryByRole("link", { name: /Inizio posa/ })).toBeNull();
    expect(localStorage.getItem("agenda-dashboard-personal-v3:company:me")).not.toContain('"order"');
  });
  it("un errore è visibile e riprovabile senza nascondere le altre fonti", () => {
    state.orderError = true; page();
    expect(screen.getByRole("alert").textContent).toContain("Le mie commesse non disponibili");
    fireEvent.click(screen.getByRole("button", { name: "Riprova le mie commesse" })); expect(state.retry).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apri attività: Verifica capitolato" })).toBeTruthy();
  });
  it("l'agenda non espone attività altrui anche se le ricevesse dalla cache", () => {
    page({ tasks: [task, { ...task, id: "foreign", title: "Attività privata altrui", assigned_to: "other" }] });
    expect(screen.queryByText("Attività privata altrui")).toBeNull();
    expect(screen.getByRole("button", { name: "Apri attività: Verifica capitolato" })).toBeTruthy();
  });
  it("appuntamenti e assenze altrui non compaiono neppure se presenti in cache", () => {
    page();
    expect(screen.queryByText("Appuntamento privato altrui")).toBeNull();
    expect(screen.queryByText(/Collega Privato/)).toBeNull();
    expect(within(screen.getByRole("region", { name: "Eventi del giorno selezionato" })).getByText("Permesso")).toBeTruthy();
  });
  it("mobile parte dal giorno e sola lettura non offre creazione", () => {
    state.mobile = true; state.solaLettura = true; page();
    expect(screen.getByRole("button", { name: "giorno" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Attività" })).toBeNull();
  });
});
