import { describe, expect, it } from "vitest";
import {
  orderControlTasksToAutoComplete,
  orderControlsToCreate,
  resolveOrderControls,
  type OrderControlCheck,
} from "@/lib/orders/controlWorkflow";

const checks: OrderControlCheck[] = [
  { key: "revenue", label: "Contratto valorizzato", taskLabel: "Valorizza il contratto", done: true, priority: "alta", fixTo: "/modifica" },
  { key: "costs", label: "Costi registrati", taskLabel: "Registra i costi diretti", done: false, priority: "alta", fixTo: "/articoli" },
  { key: "dates", label: "Data impostata", taskLabel: "Imposta la data di inizio lavori", done: false, priority: "normale", fixTo: "/date" },
];

describe("order control workflow", () => {
  it("distingue automatico, in agenda e verificato", () => {
    const controls = resolveOrderControls(checks, [
      { id: "t-costs", title: "Controllo commessa · Registra i costi diretti", status: "da_fare", due_date: null },
      { id: "t-dates", title: "Controllo commessa · Imposta la data di inizio lavori", status: "completata", due_date: null },
    ]);

    expect(controls.map((control) => control.state)).toEqual(["automatic", "scheduled", "verified"]);
    expect(controls.map((control) => control.resolved)).toEqual([true, false, true]);
  });

  it("crea solo le attività mancanti e non duplica quelle esistenti", () => {
    const controls = resolveOrderControls(checks, [
      { id: "t-costs", title: "Controllo commessa · Registra i costi diretti", status: "da_fare", due_date: null },
    ]);

    expect(orderControlsToCreate(controls).map((control) => control.key)).toEqual(["dates"]);
  });

  it("chiude automaticamente l'attività quando il dato diventa disponibile", () => {
    const controls = resolveOrderControls(checks, [
      { id: "t-revenue", title: "Controllo commessa · Valorizza il contratto", status: "da_fare", due_date: null },
    ]);

    expect(orderControlTasksToAutoComplete(controls)).toEqual(["t-revenue"]);
  });
});
