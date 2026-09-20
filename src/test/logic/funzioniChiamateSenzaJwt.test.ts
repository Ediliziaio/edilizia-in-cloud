/**
 * Una funzione chiamata senza JWT deve avere verify_jwt = false in config.toml.
 *
 * La CI pubblica ogni funzione leggendo verify_jwt da supabase/config.toml; se
 * la voce manca vale «true». Il nostro cron manda il segreto interno, non un
 * JWT; Google, Meta e le pagine pubbliche nemmeno quello. Senza la voce, la
 * funzione lavora finché nessuno la ripubblica, poi il gateway risponde 401 e
 * nessuno lo vede: pg_cron segna «succeeded» appena la richiesta è partita.
 *
 * Successo due volte: nove job il 19/09/2026, e silvio-chief-of-staff, che ha
 * preso 401 ogni mattina fino al 20/09. Il censimento del 20/09 ha trovato
 * altre dieci funzioni del cron e una dozzina di chiamate esterne aperte solo
 * a mano in produzione, quindi a una pubblicazione dal chiudersi.
 *
 * Gli elenchi vengono da cron.job in produzione (comandi senza intestazione
 * Authorization) il 20/09/2026. Un job nuovo che chiama una funzione col solo
 * segreto va aggiunto qui e in config.toml.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const config = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");

/** Le funzioni con verify_jwt = false, lette come le legge la CI. */
const aperte = new Set<string>();
for (const m of config.matchAll(/^\[functions\.([^\]]+)\]\s*\n([\s\S]*?)(?=\n\[|$(?![\s\S]))/gm)) {
  if (/^\s*verify_jwt\s*=\s*false/m.test(m[2])) aperte.add(m[1]);
}

const DAL_CRON_COL_SOLO_SEGRETO = [
  "ai-conversations-sweeper", "ai-proactive-proposals-daily", "ai-voice-outbound-leads",
  "appuntamenti-notifiche", "appuntamenti-promemoria", "auto-genera-giornale-cantiere",
  "automation-bulk-scheduler-runner", "bank-auto-reconcile", "bank-eb-cron", "beatrice-cfo-daily",
  "billing-import", "check-api-health", "check-scheduled-triggers", "cleanup-capture-orphans",
  "cliente-notifica", "company-backup", "compute-health-scores", "credit-low-balance-alert",
  "elena-cs-health-daily", "email-ai-embed-backfill", "email-ai-estrai-allegato", "email-ai-l1-classify",
  "email-ai-l3-batch", "email-ai-opportunita", "email-poll-inbox", "email-sequenze-tick",
  "geocodifica-cantieri", "hr-check-scadenze", "kb-sync-external-sources", "lifecycle-email-tick",
  "meta-ads-spend-check", "meta-ads-sync-insights", "meta-crm-conversion-sync", "meta-health-check",
  "meta-leads-backfill", "meta-process-leads", "meta-token-refresh", "morning-briefing-capomastri",
  "openwa-campagna-dispatch", "openwa-riconcilia-stati", "ops-canarino", "ops-riepilogo",
  "outreach-dispatch", "outreach-imap-poll", "outreach-prova-caselle", "outreach-riepilogo",
  "outreach-warmup", "platform-lifecycle-cron", "process-automation", "process-dunning",
  "purge-gdpr-exports", "quote-expiry-reminder", "referral-monthly-cycle", "referral-payout-executor",
  "sa-conversation-intel-daily", "sdi-stato-tick", "silvio-action-runner", "silvio-admin-briefing", "silvio-chief-of-staff",
  "silvio-daily-briefing", "silvio-generation-worker", "silvio-memory-extract", "silvio-morning-brief",
  "silvio-outbound-worker", "silvio-trigger-tick", "siti-metriche-sync", "sms-rinnovo-numeri",
  "social-publish-scheduler", "sofia-onboarding", "sync-meta-templates", "sync-stripe-mrr",
  "system-emails-tick", "tommaso-insight-daily", "whatsapp-ai-recovery", "whatsapp-operational-reminders",
];

// Chi chiama da fuori non ha un JWT nostro: Meta, Google, Stripe, Telnyx, il
// gateway di WhatsApp Locale, Supabase Auth, il ritorno degli OAuth, le pagine
// pubbliche di prenotazione e di firma.
const DA_FUORI = [
  "meta-webhook", "meta-data-deletion-callback", "meta-oauth-callback", "stripe-webhook",
  "telnyx-webhook", "openwa-webhook", "google-calendar-webhook", "auth-email-hook",
  "email-oauth-callback", "public-booking-crea", "public-booking-gestisci",
  "fea-documento-pubblico", "sr-firma-cliente", "platform-mcp",
];

describe("verify_jwt = false per chi viene chiamato senza JWT", () => {
  it("config.toml si legge, e non ha voci doppie", () => {
    const voci = [...config.matchAll(/^\[functions\.([^\]]+)\]/gm)].map((m) => m[1]);
    expect(voci.length).toBeGreaterThan(250);
    expect(voci.filter((v, i) => voci.indexOf(v) !== i)).toEqual([]);
  });

  it.each(DAL_CRON_COL_SOLO_SEGRETO)("%s — dal cron col solo segreto", (funzione) => {
    expect(existsSync(join(ROOT, "supabase/functions", funzione, "index.ts"))).toBe(true);
    expect(aperte.has(funzione)).toBe(true);
  });

  it.each(DA_FUORI)("%s — chiamata da fuori", (funzione) => {
    expect(existsSync(join(ROOT, "supabase/functions", funzione, "index.ts"))).toBe(true);
    expect(aperte.has(funzione)).toBe(true);
  });

  it("silvio-chief-of-staff controlla il segreto da sé, prima di qualunque lavoro", () => {
    const testo = readFileSync(join(ROOT, "supabase/functions/silvio-chief-of-staff/index.ts"), "utf8");
    expect(testo).toContain("async function requireCronOrSuperAdmin(");
    expect(testo).toMatch(/INTERNAL_CRON_SECRET && cronSecret === INTERNAL_CRON_SECRET/);
  });
});
