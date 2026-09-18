/**
 * «Solo i propri» in tutte le aree (18/09/2026).
 *
 * Dopo appuntamenti e attività, la stessa trappola era aperta su preventivi,
 * ticket, reclami, chiamate, messaggi, interazioni, schede progetto e
 * calendari: l'app salva la riga e poi la RLS non la fa rileggere a chi vede
 * solo i propri. Un'unica funzione, con il nome della colonna come argomento.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrazione = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20280918210000_solo_assegnati_in_tutte_le_aree.sql"),
  "utf8",
);

describe("«Solo i propri» in tutte le aree", () => {
  it("una sola funzione, con la colonna come argomento del trigger", () => {
    expect(migrazione).toContain("v_colonna text := tg_argv[0]");
    expect(migrazione).toContain("jsonb_populate_record(new, jsonb_build_object(v_colonna, v_uid))");
  });

  it("tocca solo chi vede i propri, e mai le righe senza utente (cron, webhook, import)", () => {
    expect(migrazione).toContain("if v_uid is null or not public.solo_assegnati_attivo() then");
  });

  it("copre le aree con l'assegnatario e quelle con altri nomi di colonna", () => {
    for (const riga of [
      "('quotes', 'assigned_to')",
      "('tickets', 'assigned_to')",
      "('support_tickets', 'assigned_to')",
      "('customer_complaints', 'assigned_to')",
      "('call_logs', 'user_id')",
      "('contact_messages', 'sent_by')",
      "('customer_messages', 'sender_id')",
      "('customer_interactions', 'staff_user_id')",
      "('marketing_calendars', 'owner_id')",
      "('fv_progetti', 'created_by')",
    ]) {
      expect(migrazione).toContain(riga);
    }
  });

  it("appuntamenti e attività usano la stessa funzione", () => {
    expect(migrazione).toMatch(/on public\.appointments\s+for each row execute function public\.assegna_colonna_a_chi_crea\('assigned_to'\)/);
    expect(migrazione).toMatch(/on public\.tasks\s+for each row execute function public\.assegna_colonna_a_chi_crea\('assigned_to'\)/);
    expect(migrazione).toContain("drop function if exists public.assegna_a_chi_crea_solo_assegnatario()");
  });

  it("salta tabelle o colonne che non esistono", () => {
    expect(migrazione).toContain("from information_schema.columns");
    expect(migrazione).toContain("continue;");
  });
});
