/**
 * Campagne email pianificate e statistiche (24/09/2026).
 *
 * Le campagne pianificate non erano mai partite: il cron di luglio usava
 * app.supabase_url e app.cron_secret, che su questo database non esistono. E
 * il riquadro Statistiche contava le aperture su stati che nessuno scrive
 * (sempre 0%). Questi controlli leggono i file: se qualcuno riapplica la
 * vecchia migrazione o toglie la regola del ritardo, se ne accorge qui.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const funzione = leggi("supabase/functions/process-scheduled-campaigns/index.ts");
const migrazione = leggi("supabase/migrations/20280924213000_email_campagne_pianificate_e_statistiche.sql");

describe("process-scheduled-campaigns", () => {
  it("risponde subito al cron e controlla chi chiama col sistema comune", () => {
    expect(funzione).toContain('serveConMetricheRapida("process-scheduled-campaigns"');
    expect(funzione).toContain("chiamataInternaValida(req)");
    expect(funzione).not.toContain('Deno.env.get("CRON_SECRET")');
  });

  it("una campagna in ritardo di oltre un giorno torna in bozza invece di partire", () => {
    expect(funzione).toMatch(/RITARDO_MASSIMO_ORE\s*=\s*24/);
    expect(funzione).toMatch(/update\(\{ status: "draft" \}\)[\s\S]{0,80}\.eq\("status", "scheduled"\)[\s\S]{0,80}\.lt\("scheduled_at", limiteRitardo\)/);
  });

  it("prende in carico una campagna solo se è ancora pianificata", () => {
    expect(funzione).toMatch(/update\(\{ status: "sending"[\s\S]{0,160}\.eq\("status", "scheduled"\)/);
  });
});

describe("migrazione del 24/09", () => {
  it("il cron usa l'indirizzo scritto, il segreto dal Vault e al massimo 15 secondi", () => {
    expect(migrazione).toContain("https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/process-scheduled-campaigns");
    expect(migrazione).toContain("vault.decrypted_secrets where name = 'proactive_cron_secret'");
    expect(migrazione).toContain("timeout_milliseconds := 15000");
    expect(migrazione).not.toMatch(/current_setting\('app\./);
  });

  it("prima del cron, le pianificate in ritardo tornano in bozza", () => {
    const pulizia = migrazione.indexOf("SET status = 'draft'");
    const cron = migrazione.indexOf("cron.schedule(");
    expect(pulizia).toBeGreaterThan(-1);
    expect(pulizia).toBeLessThan(cron);
  });

  it("le statistiche contano aperture e clic dai timestamp, e il controllo d'accesso resta", () => {
    expect(migrazione).toContain("PERFORM public.assert_company_access(p_company_id)");
    expect(migrazione).toContain("FILTER (WHERE el.opened_at IS NOT NULL)::bigint AS opened");
    expect(migrazione).toContain("FILTER (WHERE el.clicked_at IS NOT NULL)::bigint AS clicked");
    expect(migrazione).not.toMatch(/status IN \('opened','clicked'\)\)::bigint AS opened/);
  });

  it("resend-to-unopened resta senza cron finché non scala i crediti", () => {
    expect(migrazione).not.toMatch(/cron\.schedule\(\s*'resend-to-unopened/);
  });
});
