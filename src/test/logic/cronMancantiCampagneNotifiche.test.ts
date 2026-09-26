/**
 * Cron che mancavano (25/09/2026): vincitore A/B, reinvio a chi non ha aperto,
 * notifiche WhatsApp automatiche, pulizia delle sessioni.
 *
 * Tutte e quattro si configuravano nell'app ma non erano mai partite: nessun
 * cron le chiamava. Le prime tre funzioni del server sono state sostituite da
 * funzioni del database; check-wa-notifiche resta e ora ha il suo cron. Questi
 * controlli leggono i file: se qualcuno torna a contare stati che nessuno
 * scrive, o fa partire il reinvio senza passare dai crediti, se ne accorge qui.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const migrazione = leggi("supabase/migrations/20280925190000_cron_mancanti_campagne_notifiche_sessioni.sql");
const invio = leggi("supabase/functions/send-email-campaign/index.ts");
const notifiche = leggi("supabase/functions/check-wa-notifiche/index.ts");
const config = leggi("supabase/config.toml");

/** Il corpo di una funzione SQL della migrazione, fino al REVOKE che la chiude. */
function corpo(nome: string): string {
  const inizio = migrazione.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  expect(inizio).toBeGreaterThan(-1);
  return migrazione.slice(inizio, migrazione.indexOf("REVOKE ALL", inizio));
}

describe("vincitore A/B", () => {
  const ab = corpo("email_ab_scegli_vincitori");

  it("conta aperture e clic dagli orari, non dagli stati 'opened'/'clicked' che nessuno scrive", () => {
    expect(ab).toContain("l.opened_at IS NOT NULL OR l.clicked_at IS NOT NULL");
    expect(ab).toContain("l.clicked_at IS NOT NULL");
    expect(ab).not.toMatch(/status\s*(=|IN)\s*\(?'opened'/);
    expect(ab).not.toMatch(/status\s*(=|IN)\s*\(?'clicked'/);
  });

  it("aspetta la durata del test e sceglie una volta sola", () => {
    expect(ab).toContain("make_interval(hours => coalesce(c.ab_test_duration_hours, 4)) <= now()");
    expect(ab).toContain("c.ab_winner IS NULL");
    expect(ab).toContain("criterio = 'click_rate'");
  });
});

describe("reinvio a chi non ha aperto", () => {
  const prepara = corpo("email_prepara_reinvii");
  const destinatari = corpo("email_destinatari_reinvio");

  it("parte 48 ore dopo l'invio, una volta, e non oltre la settimana", () => {
    expect(prepara).toContain("o.completed_at <= now() - interval '48 hours'");
    expect(prepara).toContain("o.completed_at > now() - interval '7 days'");
    expect(prepara).toContain("ON CONFLICT (reinvio_di) WHERE reinvio_di IS NOT NULL DO NOTHING");
    expect(migrazione).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_email_campaigns_reinvio_di[\s\S]{0,120}WHERE reinvio_di IS NOT NULL/);
  });

  it("la copia è una campagna pianificata: la spedisce send-email-campaign, che scala i crediti", () => {
    expect(prepara).toMatch(/'scheduled', c\.type, now\(\)/);
    expect(prepara).toContain("resend_to_unopened");
    // Un reinvio non chiede a sua volta un reinvio.
    expect(prepara).toMatch(/c\.utm_tracking, c\.auto_tag, false,/);
  });

  it("se la copia finisse in un invio che non conosce reinvio_di, partirebbe verso nessuno", () => {
    expect(prepara).toContain("jsonb_build_object('tags', jsonb_build_array('__solo_reinvio_non_aperti__'))");
  });

  it("destinatari: chi l'ha ricevuta, è ancora iscritto e non ha aperto, cliccato, rimbalzato o reclamato", () => {
    expect(destinatari).toContain("l.status = 'delivered'");
    expect(destinatari).toContain("mc.unsubscribed = false");
    expect(destinatari).toContain("mc.optout_email IS NOT TRUE");
    for (const campo of ["opened_at", "clicked_at", "unsubscribed_at", "bounced_at", "complaint_at"]) {
      expect(destinatari).toContain(`x.${campo} IS NOT NULL`);
    }
    // Stessa azienda della campagna: mai contatti di un altro cliente.
    expect(destinatari).toContain("mc.company_id = c.company_id");
    // Ordine fisso: send-email-campaign legge a pagine da mille.
    expect(destinatari).toContain("ORDER BY mc.id");
  });

  it("send-email-campaign prende i destinatari del reinvio, non il segmento", () => {
    expect(invio).toMatch(/campaign\.reinvio_di\s*\?\s*await fetchDestinatariReinvio\(adminClient, campaign\.reinvio_di\)/);
    expect(invio).toContain('.rpc("email_destinatari_reinvio", { p_campagna: campagnaOriginale })');
    expect(invio).toContain(".range(from, from + PAGE_SIZE - 1)");
  });

  it("le vecchie funzioni del server non ci sono più", () => {
    for (const vecchia of ["determine-ab-winner", "resend-to-unopened", "cleanup-sessions"]) {
      expect(existsSync(resolve(process.cwd(), `supabase/functions/${vecchia}/index.ts`))).toBe(false);
      expect(config).not.toContain(`[functions.${vecchia}]`);
    }
  });
});

describe("sessioni", () => {
  it("via quelle ferme da 90 giorni, mai l'ultima di un utente (da lì si legge l'ultima attività)", () => {
    const pulizia = corpo("pulisci_sessioni_utente");
    expect(pulizia).toContain("s.last_active_at < now() - interval '90 days'");
    expect(pulizia).toMatch(/EXISTS \(SELECT 1 FROM public\.user_sessions n\s+WHERE n\.user_id = s\.user_id AND n\.last_active_at > s\.last_active_at\)/);
  });
});

describe("funzioni nuove chiuse al pubblico", () => {
  it("nessuna è eseguibile da anon o dagli utenti", () => {
    for (const nome of ["email_destinatari_reinvio(uuid)", "email_prepara_reinvii()", "email_ab_scegli_vincitori()", "pulisci_sessioni_utente()"]) {
      expect(migrazione).toContain(`REVOKE ALL ON FUNCTION public.${nome} FROM PUBLIC, anon, authenticated;`);
    }
  });
});

describe("i cron", () => {
  it("le tre funzioni del database girano senza pg_net, mai al minuto 0", () => {
    expect(migrazione).toContain("cron.schedule('email-ab-vincitori', '17 * * * *'");
    expect(migrazione).toContain("cron.schedule('email-reinvii-non-aperti', '23,53 * * * *'");
    expect(migrazione).toContain("cron.schedule('sessioni-utente-pulizia', '47 3 * * *'");
  });

  it("check-wa-notifiche: indirizzo scritto, segreto dal Vault, al massimo 15 secondi", () => {
    expect(migrazione).toContain("cron.schedule('check-wa-notifiche', '7-59/15 * * * *'");
    expect(migrazione).toContain("https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/check-wa-notifiche");
    expect(migrazione).toContain("vault.decrypted_secrets where name = 'proactive_cron_secret'");
    expect(migrazione).toContain("timeout_milliseconds := 15000");
    expect(migrazione).not.toMatch(/current_setting\('app\./);
  });

  it("si possono riapplicare: prima tolgono i job con lo stesso nome", () => {
    const togli = migrazione.indexOf("PERFORM cron.unschedule(jobid)");
    expect(togli).toBeGreaterThan(-1);
    expect(togli).toBeLessThan(migrazione.indexOf("cron.schedule("));
  });
});

describe("check-wa-notifiche", () => {
  it("risponde subito al cron e controlla chi chiama col sistema comune", () => {
    expect(notifiche).toContain('serveConMetricheRapida("check-wa-notifiche"');
    expect(notifiche).toContain("chiamataInternaValida(req)");
    expect(notifiche).not.toContain("extractJwtRole");
    expect(config).toMatch(/\[functions\.check-wa-notifiche\]\nverify_jwt = false/);
  });

  it("fattura scaduta: colonne vere, esterne e interne, e la cifra è il residuo", () => {
    // Colonne che non esistono: la query falliva e la notifica non partiva mai.
    expect(notifiche).not.toMatch(/select\([^)]*total_amount/);
    expect(notifiche).not.toContain('"payment_status"');
    expect(notifiche).toContain('.select("id, invoice_number, total, paid_amount, client_company_name, due_date")');
    expect(notifiche).toContain('.from("documenti_fiscali")');
    expect(notifiche).toContain("Number(f.total ?? 0) - Number(f.paid_amount ?? 0)");
    expect(notifiche).toContain("Number(d.totale_da_pagare ?? 0) - Number(d.importo_pagato ?? 0)");
  });

  it("il titolare è quello dell'azienda, non un super admin della piattaforma", () => {
    expect(notifiche).toContain('.select("titolare_user_id")');
    expect(notifiche).toContain('.eq("role", "company_admin")');
    expect(notifiche).not.toMatch(/\["titolare", "admin", "super_admin"\]/);
  });

  it("gli eventi vecchi si chiudono senza inviare, anche nella migrazione", () => {
    expect(notifiche).toMatch(/EVENTI_VALIDI_GIORNI\s*=\s*3/);
    expect(notifiche).toMatch(/\.not\("processed", "is", true\)\s*\.lt\("created_at", limiteEventi\)/);
    expect(migrazione).toMatch(/UPDATE public\.wa_notifiche_event_queue[\s\S]{0,160}created_at < now\(\) - interval '3 days'/);
  });

  it("senza telefono la notifica non brucia il cooldown", () => {
    const destinatario = notifiche.indexOf("const destinatario = await resolveDestinatario(");
    const cooldown = notifiche.indexOf("await checkAndSetCooldown(");
    expect(destinatario).toBeGreaterThan(-1);
    expect(destinatario).toBeLessThan(cooldown);
  });
});
