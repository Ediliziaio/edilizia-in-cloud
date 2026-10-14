import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MieAttivita, TeamTaskPulse } from "@/pages/azienda/AttivitaStaff";
import { DEFAULT_TASK_STATUS_DEFINITIONS } from "@/lib/taskStatuses";
import type { DashboardTask } from "@/lib/attivita/dashboardTasks";

const state = vi.hoisted(() => ({
  tasks: [] as import("@/lib/attivita/dashboardTasks").DashboardTask[], role: "company_admin", readonly: false, teamPermission: true, permissionsLoading: false,
  fail: false, calls: [] as { method: string; args: unknown[] }[],
  success: vi.fn(), error: vi.fn(), extraStatuses: [] as import("@/lib/taskStatuses").TaskStatusDefinition[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" }, effectiveCompany: { id: "company" }, role: state.role }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: state.role === "company_admin", canViewTeamTasks: state.teamPermission, canViewAllTeamCalendar: true, isLoading: state.permissionsLoading, canViewOrders: true, solaLettura: state.readonly, canViewMarketingContacts: false, canViewMarketingOpportunities: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as { id: string; first_name: string; last_name: string }[] }) }));
vi.mock("@/hooks/useDashboardTasks", () => ({ useDashboardTasks: () => ({ data: state.tasks, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/useTaskStatuses", () => ({ useTaskStatuses: () => ({ statuses: [...DEFAULT_TASK_STATUS_DEFINITIONS, ...state.extraStatuses] }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/components/tasks/CollegaAttivitaPicker", () => ({ CollegaAttivitaPicker: () => <div>Collegamento attività</div>, etichettaCollegamento: () => null as null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["insert", "update", "delete", "eq", "in", "select"]) builder[method] = (...args: unknown[]) => { state.calls.push({ method, args }); return builder; };
  const reply = () => state.fail ? { data: null as null, error: { message: "Salvataggio rifiutato" } } : { data: { id: "task" }, error: null as null };
  builder.single = () => Promise.resolve(reply());
  builder.then = (ok: (value: unknown) => unknown) => Promise.resolve(reply()).then(ok);
  return builder;
} } }));

Object.assign(Element.prototype, { hasPointerCapture: () => false, releasePointerCapture: () => {}, setPointerCapture: () => {}, scrollIntoView: () => {} });
function task(id: string, extra: Partial<DashboardTask> = {}): DashboardTask {
  return { id, title: `Attività ${id}`, notes: null, category: "altro", status: "da_fare", priority: "normale", assigned_to: "me", due_date: "2026-10-14", created_by: "me", order_id: null, stock_item_id: null, contact_id: null, opportunity_id: null, completed_at: null, order: null, stock_item: null, contatto: null, opportunita: null, assignee: null, ...extra };
}
function Page({ date = null, request = null }: { date?: string | null; request?: { id: string; requestId: number } | null }) {
  const [selected, setSelected] = useState(date);
  return <MieAttivita calendarDate={selected} onCalendarDateClear={() => setSelected(null)} openTaskRequest={request} />;
}
function page(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><Page {...props} /></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 14, 12));
  state.tasks = [task("today"), task("old", { due_date: "2026-10-13" }), task("other", { assigned_to: "other" })];
  state.role = "company_admin"; state.readonly = false; state.teamPermission = true; state.permissionsLoading = false; state.fail = false; state.calls = []; state.extraStatuses = []; state.success.mockClear(); state.error.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Task manager della Dashboard", () => {
  it("Oggi non comprende le scadute e la vista iniziale resta Aperte", () => {
    page(); expect(screen.getByRole("button", { name: /^Aperte/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Oggi/ }));
    expect(screen.getByRole("button", { name: "Attività today" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Attività old" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Attività other" })).toBeNull();
  });
  it("la data scelta non scavalca assegnatario e ricerca", () => {
    page({ date: "2026-10-14" });
    expect(screen.queryByRole("button", { name: "Attività other" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca attività" }), { target: { value: "other" } });
    expect(screen.queryByRole("button", { name: "Attività today" })).toBeNull();
  });
  it("cambiare un filtro temporale rimuove la selezione del calendario", () => {
    page({ date: "2026-10-14" }); fireEvent.click(screen.getByRole("button", { name: /^Scadute/ }));
    expect(screen.getByRole("button", { name: "Attività old" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Attività today" })).toBeNull();
  });
  it("la lista è paginata senza falsificare il totale", () => {
    state.tasks = Array.from({ length: 25 }, (_, i) => task(`${i}`)); page();
    expect(screen.getByText("1–20 di 25 attività")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Attività \d+$/ })).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "Successive" }));
    expect(screen.getByText("21–25 di 25 attività")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Attività \d+$/ })).toHaveLength(5);
  });
  it("una nuova ricerca riparte dalla prima pagina", () => {
    state.tasks = Array.from({ length: 25 }, (_, i) => task(`${i}`)); page();
    fireEvent.click(screen.getByRole("button", { name: "Successive" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca attività" }), { target: { value: "Attività" } });
    expect(screen.getByText("1–20 di 25 attività")).toBeTruthy();
  });
  it("la riga apre il dettaglio corretto e le commesse hanno identificativi reali", () => {
    state.tasks = [task("linked", { order_id: "order", order: { order_code: "ORD-1" } })]; page();
    expect(screen.getByRole("link", { name: /ORD-1/ }).getAttribute("href")).toBe("/azienda/ordini/order");
    fireEvent.click(screen.getByRole("button", { name: "Attività linked" }));
    expect((within(screen.getByRole("dialog")).getByLabelText("Titolo *") as HTMLInputElement).value).toBe("Attività linked");
    expect(screen.getByRole("link", { name: "Gestione completa" }).getAttribute("href")).toBe("/azienda/attivita?tab=regia&attivita=linked");
  });
  it("un evento dell'agenda apre la stessa attività nel modulo", async () => {
    page({ request: { id: "today", requestId: 1 } });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect((screen.getByLabelText("Titolo *") as HTMLInputElement).value).toBe("Attività today");
  });
  it.each(["company_admin", "company_staff"])("la lista personale di %s esclude le attività altrui anche con permesso team", role => {
    state.role = role; page();
    expect(screen.queryByRole("button", { name: "Attività other" })).toBeNull();
    expect(screen.getByRole("heading", { name: /^Le mie attività/ })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Di chi" })).toBeNull();
  });
  it("un collegamento ad attività altrui non apre il modulo personale", async () => {
    page({ request: { id: "other", requestId: 1 } });
    await Promise.resolve();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("la sola lettura disabilita la creazione e l’avanzamento degli stati", () => {
    state.readonly = true; page();
    expect(screen.getAllByRole("button", { name: "Nuova" }).every(b => (b as HTMLButtonElement).disabled)).toBe(true);
    expect((screen.getByRole("button", { name: /Passa a .*: Attività today/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("rispetta il passaggio di revisione della Regia e conferma la riga salvata", async () => {
    page(); fireEvent.click(screen.getByRole("button", { name: /Passa a .*: Attività today/ }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Attività aggiornata"));
    expect(state.calls.find(c => c.method === "update")?.args[0]).toEqual({ status: "in_revisione", completed_at: null });
    expect(state.calls).toContainEqual({ method: "eq", args: ["company_id", "company"] });
    expect(state.calls).toContainEqual({ method: "select", args: ["id"] });
  });
  it("le attività in attesa non si avanzano manualmente e non diventano scadute", () => {
    state.tasks = [task("waiting", { status: "in_attesa", due_date: "2026-10-01" })]; page();
    expect((screen.getByRole("button", { name: "Attività in attesa: Attività waiting" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Scadute/ }));
    expect(screen.queryByRole("button", { name: "Attività waiting" })).toBeNull();
  });
  it("un errore di salvataggio conserva modulo e titolo senza una falsa conferma", async () => {
    state.fail = true; page(); fireEvent.click(screen.getAllByRole("button", { name: "Nuova" })[0]);
    fireEvent.change(screen.getByLabelText("Titolo *"), { target: { value: "Bozza da conservare" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect((screen.getByLabelText("Titolo *") as HTMLInputElement).value).toBe("Bozza da conservare");
    expect(state.success).not.toHaveBeenCalled();
  });
  it("l'aggiunta rapida usa la data del calendario e conserva il testo in caso di errore", async () => {
    state.fail = true; page({ date: "2026-10-15" });
    fireEvent.change(screen.getByPlaceholderText("Aggiungi attività…"), { target: { value: "Consegna" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi attività rapida" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.calls.find(c => c.method === "insert")?.args[0]).toMatchObject({ due_date: "2026-10-15", assigned_to: "me", company_id: "company" });
    expect((screen.getByPlaceholderText("Aggiungi attività…") as HTMLInputElement).value).toBe("Consegna");
  });
  it("l’admin crea una nuova attività per la persona selezionata", async () => {
    page({ date: "2026-10-15" });
    fireEvent.change(screen.getByPlaceholderText("Aggiungi attività…"), { target: { value: "Consegna squadra" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi attività rapida" }));
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect(state.calls.find(c => c.method === "insert")?.args[0]).toMatchObject({ assigned_to: "me", due_date: "2026-10-15", company_id: "company" });
  });
  it("un non-admin aggiorna solo la propria attività nella propria azienda", async () => {
    state.role = "company_staff"; page(); fireEvent.click(screen.getByRole("button", { name: /Passa a .*: Attività today/ }));
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect(state.calls).toContainEqual({ method: "eq", args: ["company_id", "company"] });
    expect(state.calls).toContainEqual({ method: "eq", args: ["assigned_to", "me"] });
  });
});

describe("Priorità team e visibilità", () => {
  it.each([false, true])("lo staff senza permesso team non vede dati cached (caricamento permessi: %s)", loading => {
    state.role = "company_staff"; state.teamPermission = false; state.permissionsLoading = loading;
    render(<MemoryRouter><TeamTaskPulse compact /></MemoryRouter>);
    expect(screen.queryByRole("region", { name: "Priorità del team" })).toBeNull();
    expect(screen.queryByText("Attività other")).toBeNull();
  });
  it("il permesso calendario team non concede le priorità del team", () => {
    state.role = "company_staff"; state.teamPermission = false;
    render(<MemoryRouter><TeamTaskPulse compact /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Apri regia" })).toBeNull();
  });
  it("lo staff col permesso dedicato vede il riepilogo team separato", () => {
    state.role = "company_staff"; state.teamPermission = true;
    render(<MemoryRouter><TeamTaskPulse compact /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Priorità del team" })).toBeTruthy();
    expect(screen.getByText(/La tua agenda resta personale/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Apri regia" }).getAttribute("href")).toBe("/azienda/attivita?tab=regia");
    expect(screen.queryByRole("button", { name: /Passa a/ })).toBeNull();
  });
});
