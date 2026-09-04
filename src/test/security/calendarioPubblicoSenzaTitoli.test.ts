import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Il calendario pubblico non racconta cosa fai.
 *
 * Misurato su produzione prima e dopo la migrazione.
 *
 * Prima — con la sola chiave pubblicabile (ruolo anon):
 *   google_calendar_busy_slots ... 29 righe, 2 persone, 29 titoli leggibili,
 *   fra cui nomi e cellulari di potenziali clienti e fatti privati.
 *
 * Dopo:
 *   anon sulla tabella .................. permission denied
 *   anon su slot_occupati_pubblici ...... 4 intervalli, solo inizio/fine
 *   proprietario ........................ 17 righe (invariato)
 *   collega stessa azienda .............. 17 righe (invariato)
 *   admin di un'altra azienda ........... 0 righe (prima ne vedeva 17)
 *
 * Rifiuti espliciti, tutti verificati da anon:
 *   calendario inesistente / intervallo invertito / finestra oltre 62 giorni.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("calendario_pubblico_senza_titoli"));
if (!nome) throw new Error("migrazione calendario_pubblico_senza_titoli non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

const funzione = sql.slice(sql.indexOf("create or replace function public.slot_occupati_pubblici"),
                           sql.indexOf("drop policy if exists \"google"));

describe("la fascia occupata esce senza il perché", () => {
  it("la funzione restituisce solo inizio e fine", () => {
    expect(funzione).toMatch(/returns table \(inizio timestamptz, fine timestamptz\)/);
  });

  it("il titolo dell'evento non compare mai fra le colonne restituite", () => {
    const select = funzione.slice(funzione.indexOf("return query"));
    expect(select).not.toMatch(/summary/);
    expect(select).toMatch(/select g\.start_at, g\.end_at/);
    expect(select).toMatch(/select a\.start_at, a\.end_at/);
  });

  it("unisce Google e Apple, così la pagina non deve saperlo", () => {
    expect(funzione).toMatch(/google_calendar_busy_slots g[\s\S]*union all[\s\S]*apple_calendar_busy_slots a/);
  });
});

describe("quando non può rispondere lo dice", () => {
  it("calendario inesistente: errore, non lista vuota", () => {
    expect(funzione).toMatch(/if not found then\s*\n\s*raise exception 'slot_occupati_pubblici: calendario inesistente'/);
  });

  it("calendario non pubblicato: rifiuta invece di inventare disponibilità", () => {
    expect(funzione).toMatch(/v_slug is null or coalesce\(v_attivo, false\) = false or v_owner is null/);
    expect(funzione).toMatch(/il calendario non e'' pubblico/);
  });

  it("intervallo invertito o troppo ampio: rifiuta", () => {
    expect(funzione).toMatch(/p_a <= p_da/);
    expect(funzione).toMatch(/p_a - p_da > interval '62 days'/);
  });

  it("nessun blocco richiesto è zero righe, non un errore", () => {
    expect(funzione).toMatch(/if coalesce\(v_blocca, false\) = false then\s*\n\s*return;/);
  });
});

describe("la preferenza dell'utente la legge il server", () => {
  it("block_busy_slots viene risolto dentro la funzione", () => {
    expect(funzione).toMatch(/from public\.user_calendar_preferences ucp\s*\n\s*where ucp\.user_id = v_owner/);
  });

  it("gira come definer, perché ad anon quella tabella resta invisibile", () => {
    expect(funzione).toMatch(/security definer/);
    expect(funzione).toMatch(/set search_path = public/);
  });

  it("solo anon e authenticated possono chiamarla", () => {
    expect(sql).toMatch(/revoke all on function public\.slot_occupati_pubblici\(uuid, timestamptz, timestamptz\) from public/);
    expect(sql).toMatch(/grant execute on function public\.slot_occupati_pubblici\(uuid, timestamptz, timestamptz\) to anon, authenticated/);
  });
});

describe("le tabelle non sono più raggiungibili dalla rete", () => {
  it("il ramo che apriva a chiunque è stato tolto da entrambe", () => {
    expect(sql).toMatch(/drop policy if exists "google_calendar_busy_slots_lettura_public"/);
    expect(sql).toMatch(/drop policy if exists "apple_calendar_busy_slots_lettura_public"/);
    expect(sql).not.toMatch(/marketing_calendars\.owner_id/);
  });

  it("nessuna delle due nuove policy nomina il calendario pubblico", () => {
    const policy = sql.slice(sql.indexOf('create policy "google_calendar_busy_slots_lettura_interna"'));
    expect(policy).not.toMatch(/booking_slug/);
  });

  it("resta il proprietario e resta il personale interno", () => {
    for (const t of ["google", "apple"]) {
      const p = sql.slice(sql.indexOf(`create policy "${t}_calendar_busy_slots_lettura_interna"`));
      expect(p).toMatch(/user_id = \(select auth\.uid\(\)\)/);
      expect(p).toMatch(/'super_admin','company_admin','company_staff','salesperson','call_center'/);
    }
  });

  it("il ruolo cliente non è fra quelli ammessi", () => {
    const p = sql.slice(sql.indexOf('create policy "google_calendar_busy_slots_lettura_interna"'));
    expect(p).not.toMatch(/'customer'/);
  });

  it("ad anon viene tolto anche il permesso, non solo la policy", () => {
    expect(sql).toMatch(/revoke select on public\.google_calendar_busy_slots from anon/);
    expect(sql).toMatch(/revoke select on public\.apple_calendar_busy_slots from anon/);
  });
});
