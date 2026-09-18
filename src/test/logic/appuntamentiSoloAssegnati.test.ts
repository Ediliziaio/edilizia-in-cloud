/**
 * «Solo i propri» e gli appuntamenti (Il Bagno Group, 17/09/2026).
 *
 * Undici venditori non riuscivano a fissare appuntamenti: l'app salva e
 * rilegge la riga, e un appuntamento senza assegnatario non è visibile a chi
 * vede solo i propri → 42501, tradotto in «Non hai i permessi per questa
 * operazione». Qui si tiene fermo il rimedio, database e pagine.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

describe("appuntamenti con «Solo i propri»", () => {
  const migrazione = leggi("supabase/migrations/20280918200000_appuntamenti_solo_assegnati.sql");

  it("chi fissa l'appuntamento diventa l'assegnatario, se vede solo i propri", () => {
    expect(migrazione).toContain("solo_assegnati_attivo()");
    expect(migrazione).toContain("new.assigned_to := v_uid");
    expect(migrazione).toMatch(/create trigger trg_assegna_appuntamento_a_chi_crea\s+before insert on public\.appointments/);
  });

  it("vale anche per le attività", () => {
    expect(migrazione).toMatch(/create trigger trg_assegna_attivita_a_chi_crea\s+before insert on public\.tasks/);
  });

  it("chi ha creato la riga la vede e la modifica anche senza assegnatario", () => {
    for (const tabella of ["public.appointments", "public.tasks"]) {
      expect(migrazione).toContain(`on ${tabella}\n  for all to authenticated`);
    }
    expect(migrazione).toContain("created_by = (select auth.uid())");
    // Solo nell'azienda attiva: un collega non deve vedere quelle degli altri.
    expect(migrazione).toContain("company_id = (select public.get_effective_company_id())");
  });

  it("le tre pagine che fissano appuntamenti non lasciano l'assegnatario vuoto", () => {
    const pagine = [
      "src/components/appointments/AppointmentDialog.tsx",
      "src/components/marketing/MarketingAppointmentDialog.tsx",
      "src/components/opportunities/OpportunityAppointmentTab.tsx",
    ];
    for (const pagina of pagine) {
      const testo = leggi(pagina);
      expect(testo).toMatch(/assigned_to:[^\n]*onlyAssigned/);
    }
  });
});
