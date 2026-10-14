import { describe, expect, it } from "vitest";
import { dashboardTasksForAssignee, dashboardTaskStats, dashboardTaskDateGroup, isDashboardTaskOverdue, filterDashboardTasks, loadDashboardRows } from "@/lib/attivita/dashboardTasks";
import { buildDashboardAgenda, readAgendaLayers } from "@/lib/attivita/dashboardAgenda";
import { DEFAULT_TASK_STATUS_DEFINITIONS } from "@/lib/taskStatuses";

const today = new Date(2026, 9, 14, 12);
const task = (id: string, due_date: string | null, extra = {}) => ({ id, title: `Attività ${id}`, notes: null as null, category: "altro", status: "da_fare", priority: "normale", assigned_to: "me", due_date, ...extra });
const rows = [task("old", "2026-10-13"), task("today", "2026-10-14"), task("end", "2026-10-20"), task("later", "2026-10-21"), task("undated", null), task("done", "2026-10-14", { status: "completata" }), task("blocked", "2026-10-13", { status: "in_attesa" })];
const ids = (r: { id: string }[]) => r.map(t => t.id);

describe("Dashboard: persona, data e conteggi coerenti", () => {
  it("Oggi conta solo oggi; scadute e prossimi sette giorni hanno ambiti distinti", () => {
    expect(dashboardTaskStats(rows, today)).toEqual({ total: 6, today: 1, overdue: 1, week: 2, undated: 1, completed: 1 });
    expect(ids(filterDashboardTasks(rows, "oggi", today))).toEqual(["today"]);
    expect(ids(filterDashboardTasks(rows, "scadute", today))).toEqual(["old"]);
    expect(ids(filterDashboardTasks(rows, "settimana", today))).toEqual(["today", "end"]);
  });
  it("la Regia e la Dashboard usano lo stesso confine: oggi non è scaduta, neppure a fine giornata", () => {
    const late = new Date(2026, 9, 14, 23, 59);
    expect(isDashboardTaskOverdue(task("today", "2026-10-14"), late)).toBe(false);
    expect(isDashboardTaskOverdue(task("old", "2026-10-13"), late)).toBe(true);
    expect(isDashboardTaskOverdue(task("blocked", "2026-10-13", { status: "in_attesa" }), late)).toBe(false);
  });
  it("la data mantiene sia persona sia ricerca e non include completate", () => {
    const tasks = [...rows, task("other", "2026-10-14", { assigned_to: "other" })];
    const mine = dashboardTasksForAssignee(tasks, "me", "me", true);
    expect(ids(filterDashboardTasks(mine, "scadute", today, "today", "2026-10-14"))).toEqual(["today"]);
    expect(filterDashboardTasks(mine, "tutte", today, "other", "2026-10-14")).toEqual([]);
  });
  it("senza permesso team nessun filtro può ampliare le attività personali", () => {
    expect(dashboardTasksForAssignee([...rows, task("other", null, { assigned_to: "other" })], "all", "me", false)).toHaveLength(rows.length);
    expect(dashboardTasksForAssignee(rows, "all", undefined, false)).toEqual([]);
  });
  it("team, persona e attività senza assegnatario sono distinti", () => {
    const tasks = [task("mine", null), task("other", null, { assigned_to: "other" }), task("none", null, { assigned_to: null })];
    expect(ids(dashboardTasksForAssignee(tasks, "all", "me", true))).toEqual(["mine", "other", "none"]);
    expect(ids(dashboardTasksForAssignee(tasks, "other", "me", true))).toEqual(["other"]);
  });
  it("gli stati finali personalizzati sono completati; quelli in attesa non sono scaduti", () => {
    const statuses = [...DEFAULT_TASK_STATUS_DEFINITIONS, { value: "custom_chiusa", label: "Chiusa", stage: "done" as const, tone: "emerald" as const, order: 60 }];
    const tasks = [...rows, task("custom", "2026-10-13", { status: "custom_chiusa" })];
    expect(dashboardTaskStats(tasks, today, statuses).completed).toBe(2);
    expect(ids(filterDashboardTasks(tasks, "completate", today, "", null, statuses))).toEqual(["custom", "done"]);
  });
  it("le sezioni separano scadute, oggi, future e senza data", () => {
    expect(rows.slice(0, 5).map(t => dashboardTaskDateGroup(t, today))).toEqual(["Scadute", "Oggi", "Prossimi 7 giorni", "Più avanti", "Senza data"]);
  });
  it("completate e attività in attesa non sono raggruppate come scadute", () => {
    expect(dashboardTaskDateGroup(rows[5], today)).toBe("Completate");
    expect(dashboardTaskDateGroup(rows[6], today)).toBe("In attesa");
  });
  it("Senza data esclude attività in attesa e completate", () => {
    expect(ids(filterDashboardTasks([...rows, task("wait", null, { status: "in_attesa" })], "senza-data", today))).toEqual(["undated"]);
  });
  it("ordina scadute, priorità e data senza modificare la fonte", () => {
    const input = [task("normal", "2026-10-13"), task("future", "2026-10-15", { priority: "urgente" }), task("urgent", "2026-10-13", { priority: "urgente" })];
    expect(ids(filterDashboardTasks(input, "tutte", today))).toEqual(["urgent", "normal", "future"]);
    expect(ids(input)).toEqual(["normal", "future", "urgent"]);
  });
});

const agenda = (extra = {}) => buildDashboardAgenda({ tasks: rows, orders: [], deadlines: [], appointments: [], leaves: [], holidays: [], from: "2026-10-12", to: "2026-10-18", ...extra });
describe("Agenda: provenienza e intervalli reali", () => {
  it("le attività hanno identificativi apribili e non riportano le completate", () => {
    const a = agenda();
    expect(a.items.get("2026-10-14")?.map(e => e.taskId)).toEqual(["today"]);
    expect(a.items.has("2026-10-20")).toBe(false);
  });
  it("la posa è un intervallo separato dagli eventi e include entrambe le estremità", () => {
    const a = agenda({ orders: [{ id: "order", order_code: "ORD-1", description: "Casa", work_start_date: "2026-10-13", work_end_date: "2026-10-15", expected_date: null, warehouse_arrival_date: null }] });
    expect(a.poses).toEqual(new Map([["2026-10-13", 1], ["2026-10-14", 1], ["2026-10-15", 1]]));
    expect(a.items.get("2026-10-13")?.find(e => e.layer === "order")?.href).toBe("/azienda/ordini/order");
    expect(a.items.get("2026-10-14")?.some(e => e.layer === "order")).toBe(false);
  });
  it("carica settimane che attraversano due mesi senza omettere il secondo", () => {
    const a = agenda({ tasks: [task("next", "2026-11-01")], from: "2026-10-26", to: "2026-11-01" });
    expect(a.items.get("2026-11-01")?.[0].taskId).toBe("next");
  });
  it("esclude scadenze pagate e annullate, mantiene quelle parziali", () => {
    const a = agenda({ deadlines: ["pagata", "annullata", "parziale", "da_pagare"].map(status => ({ id: status, status, due_date: "2026-10-14", description: "Fornitore", tipo: "uscita" })) });
    expect(a.items.get("2026-10-14")?.filter(e => e.layer === "deadline").map(e => e.id)).toEqual(["deadline:da_pagare", "deadline:parziale"]);
  });
  it("non ripropone appuntamenti annullati o conclusi e conserva le ore fuori ufficio", () => {
    const a = agenda({ appointments: ["confermato", "annullato", "completato"].map(status => ({ id: status, status, title: "Appuntamento", appointment_date: "2026-10-14", appointment_time: "06:15:00" })) });
    expect(a.items.get("2026-10-14")?.filter(e => e.layer === "appointment")).toEqual([expect.objectContaining({ time: "06:15", id: "appointment:confermato" })]);
  });
  it("le assenze sono ritagliate sul periodo visibile e riportano il tipo", () => {
    const a = agenda({ leaves: [{ id: "leave", tipo: "permesso", data_inizio: "2026-10-01", data_fine: "2026-10-14", profilo: { nome: "Anna", cognome: "Rossi" } }] });
    expect(a.items.get("2026-10-12")?.some(e => e.title === "Permesso · Anna Rossi")).toBe(true);
    expect(a.items.has("2026-10-11")).toBe(false);
  });
  it("le chiusure ricorrenti attraversano l'anno e non creano un 29 febbraio inesistente", () => {
    const a = agenda({ tasks: [], from: "2026-12-28", to: "2027-01-03", holidays: [{ id: "year", data: "2024-01-01", descrizione: "Capodanno", ricorrente: true }] });
    expect(a.items.get("2027-01-01")?.[0].title).toBe("Capodanno");
    expect(agenda({ holidays: [{ id: "leap", data: "2024-02-29", descrizione: "Chiusura", ricorrente: true }], from: "2026-02-01", to: "2026-02-28", tasks: [] }).items.size).toBe(0);
  });
  it("gli intervalli invalidi non fanno fallire tutta l'agenda", () => {
    expect(() => agenda({ leaves: [{ id: "bad", tipo: "ferie", data_inizio: "invalid", data_fine: "2026-10-15", profilo: null }] })).not.toThrow();
  });
  it("valida le preferenze e conserva la scelta di spegnere tutte le fonti", () => {
    expect([...readAgendaLayers('[]')]).toEqual([]);
    expect([...readAgendaLayers('["task","unknown"]')]).toEqual(["task"]);
    expect(readAgendaLayers("not-json").size).toBe(4);
  });
});

describe("Letture complete della Dashboard", () => {
  it("legge 1.101 righe e mantiene l'ordine delle pagine", async () => {
    const data = Array.from({ length: 1101 }, (_, i) => ({ id: `row-${i}` }));
    const result = await loadDashboardRows((a, b) => Promise.resolve({ data: data.slice(a, b + 1), error: null }));
    expect(result).toEqual(data);
  });
  it("non pubblica dati parziali se una pagina fallisce", async () => {
    await expect(loadDashboardRows(a => Promise.resolve(a ? { data: null, error: { message: "Rete assente" } } : { data: Array.from({ length: 250 }, (_, i) => ({ id: `${i}` })), error: null }))).rejects.toThrow("Rete assente");
  });
  it("rileva dati mossi tra le pagine invece di duplicare attività", async () => {
    await expect(loadDashboardRows(a => Promise.resolve({ data: a ? [{ id: "0" }] : Array.from({ length: 250 }, (_, i) => ({ id: `${i}` })), error: null }))).rejects.toThrow("dati sono cambiati");
  });
});
