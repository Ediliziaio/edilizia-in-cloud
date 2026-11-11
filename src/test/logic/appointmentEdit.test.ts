/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { appointmentEditPatch, rollbackAppointmentTiming } from "@/lib/marketing/appointmentEdit";

const original = { title: "Sopralluogo", description: "Nota", appointment_date: "2026-11-12", appointment_time: "10:00:00", appointment_type: "sopralluogo", status: "confermato", calendar_id: "cal-1", assigned_to: "u1", order_id: "order-1" };
const form: Parameters<typeof appointmentEditPatch>[1] = { ...original, company_id: "company-a", order_id: null, appointment_type: "generico", appointment_end_time: "10:30:00", is_blocked_slot: false, address_country: "IT", meeting_provider: "none", meeting_url: null, meeting_status: "none", meeting_created_at: null };
describe("modifica parziale appuntamento", () => {
  it("un errore vecchio non riporta indietro uno spostamento più recente o le nuove note", () => {
    const previous = [{ id: "a", appointment_date: "2026-11-12", description: "prima" }];
    const current = [{ id: "a", appointment_date: "2026-11-14", description: "nuova" }];
    expect(rollbackAppointmentTiming(current, previous, "a", { appointment_date: "2026-11-13" })).toEqual(current);
    expect(rollbackAppointmentTiming([{ ...current[0], appointment_date: "2026-11-13" }], previous, "a", { appointment_date: "2026-11-13" }))
      .toEqual([{ ...current[0], appointment_date: "2026-11-12" }]);
  });
  it("non modifica nulla aprendo e salvando un vecchio sopralluogo", () => {
    expect(appointmentEditPatch(original, form)).toEqual({});
  });
  it("conserva la commessa e gli altri campi quando cambia una sola nota", () => {
    expect(appointmentEditPatch(original, { ...form, description: "Nuova nota" })).toEqual({ description: "Nuova nota" });
  });
  it("permette la rimozione esplicita di una nota e di un responsabile", () => {
    expect(appointmentEditPatch(original, { ...form, description: null, assigned_to: null })).toEqual({ description: null, assigned_to: null });
  });
  it("mantiene gli annullamenti espliciti e il nuovo orario", () => {
    expect(appointmentEditPatch(original, { ...form, status: "annullato", appointment_time: "11:00:00", appointment_end_time: "11:30:00" })).toEqual({ status: "annullato", appointment_time: "11:00:00", appointment_end_time: "11:30:00" });
  });
  it("non rigenera metadati o link Meet modificando le note", () => {
    const video = { ...original, appointment_type: "videocall", meeting_provider: "google_meet", meeting_url: "https://meet.google.com/demo", meeting_status: "ready", meeting_created_at: "2026-11-01T00:00:00Z" };
    expect(appointmentEditPatch(video, { ...form, ...video, description: "Nuova nota", meeting_created_at: "2026-11-12T00:00:00Z" })).toEqual({ description: "Nuova nota" });
  });
  it("permette il cambio esplicito di modalità incontro", () => {
    expect(appointmentEditPatch(original, { ...form, appointment_type: "videocall", meeting_provider: "google_meet", meeting_status: "pending" })).toEqual({ appointment_type: "videocall", meeting_provider: "google_meet", meeting_status: "pending" });
  });
});

describe("calendario CRM: visibilità dopo il trasferimento", () => {
  it.each([false, true])("il callback reale aggiorna i filtri rispettando Solo i propri=%s", onlyAssigned => {
    const source = ts.createSourceFile("MarketingCalendar.tsx", readFileSync("src/pages/azienda/marketing/MarketingCalendar.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let callback: ts.Expression | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "MarketingAppointmentDialog") {
        const attribute = node.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText(source) === "onSaved");
        if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer)) callback = attribute.initializer.expression;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(callback).toBeDefined();
    let calendars = ["cal-1"], users = ["u1"], refreshed = false;
    const context = vm.createContext({
      permissions: { onlyAssigned },
      setSelectedCalendarIds: (apply: (ids: string[]) => string[]) => { calendars = apply(calendars); },
      setSelectedUserIds: (apply: (ids: string[]) => string[]) => { users = apply(users); },
      refetchAppointments: () => { refreshed = true; },
      queryClient: { invalidateQueries: (): void => {} }, queryKeys: { marketing: { all: [] as string[] } },
    });
    const code = ts.transpileModule(`(${callback!.getText(source)})({calendar_id:'cal-2',assigned_to:'u2',appointment_date:'2026-11-12'})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext(code, context);
    expect(refreshed).toBe(true);
    expect(calendars).toEqual(onlyAssigned ? ["cal-1"] : ["cal-1", "cal-2"]);
    expect(users).toEqual(onlyAssigned ? ["u1"] : ["u1", "u2"]);
  });
});
