import { describe, expect, it } from "vitest";
import { appointmentEditPatch } from "@/lib/marketing/appointmentEdit";

const original = { title: "Sopralluogo", description: "Nota", appointment_date: "2026-11-12", appointment_time: "10:00:00", appointment_type: "sopralluogo", status: "confermato", calendar_id: "cal-1", assigned_to: "u1", order_id: "order-1" };
const form = { ...original, company_id: "company-a", order_id: null, appointment_type: "generico", appointment_end_time: "10:30:00", is_blocked_slot: false, address_country: "IT", meeting_provider: "none", meeting_url: null, meeting_status: "none", meeting_created_at: null };
describe("modifica parziale appuntamento", () => {
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
