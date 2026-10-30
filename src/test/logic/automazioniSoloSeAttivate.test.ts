// src/test/logic/automazioniSoloSeAttivate.test.ts
/**
 * Le automazioni AI e i messaggi automatici ai clienti partono solo se
 * l'azienda li accende (19/10/2026): niente più valori di base accesi.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leggi = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");

describe("solo se l'azienda le accende", () => {
  it("brief di Silvio nell'app: solo con «Report del mattino» attivo, alle persone scelte", () => {
    const codice = leggi("supabase/functions/silvio-morning-brief/index.ts");
    expect(codice).toContain('.eq("tipo", "report_mattino").eq("attiva", true)');
    expect(codice).toContain("return !!s && (s.tutti || s.utenti.has(c.user_id));");
  });

  it("brief di Silvio: interruttore dell'azienda anche senza WhatsApp, spento di base (31/10/2026)", () => {
    const codice = leggi("supabase/functions/silvio-morning-brief/index.ts");
    expect(codice).toContain('.neq("silvio_brief_mattino", "spento")');
    expect(codice).toContain('if (m === "tutti" || (m === "responsabili" && amministratori.has(c.user_id))) return true;');
    const sql = leggi("supabase/migrations/20281031237000_brief_silvio_interruttore.sql");
    expect(sql).toContain("silvio_brief_mattino text not null default 'spento'");
    const ui = leggi("src/components/impostazioni/AutomazioniCheParteDaSole.tsx");
    expect(ui).toContain("Brief di Silvio del mattino");
  });

  it("giornale di cantiere e brief ai capisquadra: spenti di base e spenti per tutti", () => {
    const sql = leggi("supabase/migrations/20281019235500_automazioni_solo_se_attivate.sql");
    expect(sql).toContain("alter column morning_briefing_enabled set default false");
    expect(sql).toContain("alter column giornale_auto_enabled set default false");
    expect(sql).toContain("update public.companies set morning_briefing_enabled = false where morning_briefing_enabled;");
    expect(sql).toContain("update public.companies set giornale_auto_enabled = false where giornale_auto_enabled;");
    expect(sql).toContain("set local lock_timeout = '3s';");
  });

  it("promemoria al cliente per l'offerta in scadenza: solo se acceso", () => {
    const codice = leggi("supabase/functions/quote-expiry-reminder/index.ts");
    expect(codice).toContain("promemoria_preventivo_cliente === true");
    expect(codice).toContain("if (promemoriaAccesi && quote.client_email");
  });

  it("promemoria operativi WhatsApp spenti di base, nel server e nell'app", () => {
    expect(leggi("supabase/functions/whatsapp-ai-processor/settings.ts")).toContain("daily_rapportino_enabled: false,");
    expect(leggi("src/hooks/whatsapp/useWhatsAppNumbers.ts")).toContain("daily_rapportino_enabled: false,");
  });

  it("i messaggi al cliente dell'area clienti partono solo con l'area clienti accesa", () => {
    expect(leggi("supabase/functions/cliente-notifica/index.ts")).toContain("customer_portal_enabled !== true) return null;");
  });

  it("gli interruttori stanno in Impostazioni → Automazioni AI", () => {
    const pagina = leggi("src/pages/azienda/impostazioni/SettingsAIAutomazioni.tsx");
    expect(pagina).toContain("<AutomazioniCheParteDaSole companyId={companyId} canEdit={canEdit} />");
    const sezione = leggi("src/components/impostazioni/AutomazioniCheParteDaSole.tsx");
    for (const c of ["giornale_auto_enabled", "morning_briefing_enabled", "promemoria_preventivo_cliente"]) expect(sezione).toContain(`chiave: "${c}"`);
  });
});
