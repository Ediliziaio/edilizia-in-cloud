import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { comeUguaglianzaIlike, ultimeNoveCifre } from "../../../supabase/functions/_shared/contattoPrenotazione";
import { romaVersoUtc } from "../../../supabase/functions/_shared/appuntamentiPubblici";
import { indirizzoModuloPrenotazione } from "@/lib/calendar/indirizzoModuloPrenotazione";

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

/**
 * Prenotazione collegata al CRM (22/09/2026): prima una prenotazione dalla
 * pagina pubblica nasceva senza contatto, e nessuna automazione la vedeva.
 */
describe("il contatto di una prenotazione", () => {
  it("il telefono si confronta sulle ultime nove cifre, in qualunque forma sia scritto", () => {
    expect(ultimeNoveCifre("+39 351 307 1326")).toBe("513071326");
    expect(ultimeNoveCifre("3513071326")).toBe("513071326");
    expect(ultimeNoveCifre("0039-351-3071326")).toBe("513071326");
    expect(ultimeNoveCifre("12345")).toBe("");
    expect(ultimeNoveCifre(null)).toBe("");
  });

  it("l'email cercata con ILIKE è un'uguaglianza: _ e % non fanno da jolly", () => {
    expect(comeUguaglianzaIlike("mario_rossi@esempio.it")).toBe("mario\\_rossi@esempio.it");
    expect(comeUguaglianzaIlike("100%@esempio.it")).toBe("100\\%@esempio.it");
    expect(comeUguaglianzaIlike("semplice@esempio.it")).toBe("semplice@esempio.it");
  });

  it("la prenotazione scrive il contatto sull'appuntamento, così il database avvisa le automazioni", () => {
    const src = leggi("supabase/functions/public-booking-crea/index.ts");
    expect(src).toContain("contattoDellaPrenotazione(admin, {");
    expect(src).toContain("contact_id: contactId,");
  });
});

describe("il link personale dei messaggi", () => {
  it("dentro il calendario incorporato passano il contatto e i campi precompilati, e nient'altro", () => {
    expect(indirizzoModuloPrenotazione("demo-edilizia-in-cloud", "?c=abc&first_name=Mario&utm_source=fb"))
      .toBe("/prenota/demo-edilizia-in-cloud?embed=1&c=abc&first_name=Mario");
  });

  it("senza parametri resta l'indirizzo di prima", () => {
    expect(indirizzoModuloPrenotazione("demo-edilizia-in-cloud", "")).toBe("/prenota/demo-edilizia-in-cloud?embed=1");
  });
});

describe("il motore delle automazioni e gli appuntamenti", () => {
  const motore = leggi("supabase/functions/process-automation/index.ts");

  it("l'attesa «prima dell'appuntamento» legge l'ora italiana, non UTC", () => {
    // 22 settembre, ora legale: le 10:00 italiane sono le 08:00 UTC.
    expect(romaVersoUtc("2026-09-22", "10:00").toISOString()).toBe("2026-09-22T08:00:00.000Z");
    // 15 dicembre, ora solare: le 10:00 italiane sono le 09:00 UTC.
    expect(romaVersoUtc("2026-12-15", "10:00").toISOString()).toBe("2026-12-15T09:00:00.000Z");
    expect(motore).toContain("const quando = romaVersoUtc(String(app.appointment_date)");
    expect(motore).not.toContain("const quando = new Date(`${app.appointment_date}T");
  });

  it("«sposta opportunità» resta nella pipeline della fase scelta", () => {
    expect(motore).toContain('.eq("pipeline_id", fase.pipeline_id).is("deleted_at", null)');
  });

  it("i trigger degli appuntamenti si filtrano per calendario, quelli delle opportunità per pipeline", () => {
    expect(motore).toContain('String(ep?.calendar_id ?? "") !== tcfg.calendario_id');
    expect(motore).toContain('String(ep.pipeline_id ?? "") !== tcfg.pipeline_id');
  });

  it("{{link_riprogramma}} e {{link_sposta}} portano alla pagina per spostare, {{link_call}} alla videochiamata", () => {
    expect(motore).toContain("link_sposta: app.manage_token ? urlGestione(APP_ORIGINE_PUBBLICA, app.manage_token)");
    expect(motore).toContain("link_call: app.meeting_url");
    expect(motore).not.toContain("link_riprogramma: app.meeting_url");
  });
});
