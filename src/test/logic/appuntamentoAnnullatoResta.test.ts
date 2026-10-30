/**
 * Un appuntamento annullato resta (Il Bagno Group, 18/09/2026).
 *
 * Un cliente ha tolto l'evento dal calendario: l'appuntamento spariva del tutto
 * da EiC e di quella fascia non restava traccia. Ora chi annulla — dall'app o
 * togliendo l'evento da Google — lo lascia nello storico segnato «annullato»,
 * barrato nel calendario, e i calendari collegati vengono comunque puliti.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appuntamentoAnnullato } from "@/lib/calendarUtils";
import { mayCancelMissingGoogleAppointment } from "../../../supabase/functions/_shared/googleAppointmentReconcile";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

describe("appuntamento annullato", () => {
  it("riconosce gli stati annullati, non gli altri", () => {
    for (const stato of ["annullato", "Annullato", "cancelled", "canceled"]) {
      expect(appuntamentoAnnullato(stato)).toBe(true);
    }
    for (const stato of ["confermato", "completato", "da_preventivare", null, undefined, ""]) {
      expect(appuntamentoAnnullato(stato)).toBe(false);
    }
  });

  it("dall'app si annulla, non si elimina più la riga", () => {
    for (const pagina of [
      "src/components/appointments/AppointmentDialog.tsx",
      "src/components/marketing/MarketingAppointmentDialog.tsx",
    ]) {
      const testo = leggi(pagina);
      expect(testo).toContain('status: "annullato"');
      expect(testo).toContain("cancelled_at: new Date().toISOString()");
      expect(testo).not.toContain('from("appointments").delete()');
    }
  });

  it("evento tolto da Google: l'appuntamento diventa annullato, non sparisce", () => {
    // Dal 14/10 la riconciliazione sta in _shared/googleAppointmentReconcile
    // (provata per esteso in googleAppointmentReconcile.test.ts): annulla solo
    // dopo che Google ha confermato la cancellazione dell'evento.
    const sync = leggi("supabase/functions/google-calendar-sync/index.ts");
    const riconcilia = leggi("supabase/functions/_shared/googleAppointmentReconcile.ts");
    expect(sync).toContain("reconcileMissingGoogleAppointments(");
    expect(riconcilia).toContain('status: "annullato", cancelled_at: now.toISOString()');
    expect(riconcilia).not.toMatch(/from\("appointments"\)\.delete\(/);
    const apt = { id: "a", appointment_date: "2026-11-10", appointment_time: "10:00", status: "confermato", is_completed: false, updated_at: "x", internal_notes: null };
    const ora = new Date("2026-11-01T09:00:00Z");
    expect(mayCancelMissingGoogleAppointment(apt, ora, "2026-12-01T00:00:00Z")).toBe(true);
    // Solo dentro la finestra letta: fuori non è "sparito", non è stato chiesto.
    expect(mayCancelMissingGoogleAppointment(apt, ora, "2026-11-05T00:00:00Z")).toBe(false);
    // Chi è già annullato o completato non si tocca.
    expect(mayCancelMissingGoogleAppointment({ ...apt, status: "annullato" }, ora, "2026-12-01T00:00:00Z")).toBe(false);
    expect(mayCancelMissingGoogleAppointment({ ...apt, is_completed: true }, ora, "2026-12-01T00:00:00Z")).toBe(false);
  });

  it("nel calendario si vede barrato", () => {
    for (const vista of [
      "src/components/calendar/CalendarDayView.tsx",
      "src/components/calendar/CalendarWeekView.tsx",
      "src/components/calendar/CalendarMonthView.tsx",
    ]) {
      expect(leggi(vista), vista).toMatch(/appuntamentoAnnullato\((?:apt|event\.appointment)\.status\)[\s\S]{0,120}"line-through opacity-70"/);
    }
  });
});

describe("importa gli eventi Google nel CRM", () => {
  it("la sincronizzazione legge l'interruttore che la scheda salva davvero", () => {
    const sync = leggi("supabase/functions/google-calendar-sync/index.ts");
    const scheda = leggi("src/components/settings/GoogleCalendarSyncPrefsDialog.tsx");
    // Stessa colonna da una parte e dall'altra: prima la sync guardava
    // «import_all_google_events», che nel database non esiste.
    expect(scheda).toContain("import_google_events_to_crm");
    expect(sync).toContain("import_google_events_to_crm");
    expect(sync).not.toContain("import_all_google_events?");
  });
});

describe("eventi Google importati", () => {
  it("nascono assegnati a chi possiede l'agenda", () => {
    const sync = leggi("supabase/functions/google-calendar-sync/index.ts");
    // Senza assegnatario chi vede «solo i propri» non vedrebbe nemmeno i
    // propri eventi importati.
    expect(sync).toMatch(/created_by: userId,[\s\S]{0,260}assigned_to: userId,/);
  });
});

