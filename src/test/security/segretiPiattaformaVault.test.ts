/**
 * Segreti di platform_settings nel Vault (19/09/2026).
 *
 * platform_settings teneva in chiaro 10 chiavi API, token e segreti dei webhook
 * (WhatsApp Locale, Meta, email transazionale, openapi.it, render). Ora il
 * valore sta nel Vault («platform_settings.<chiave>») e le edge function lo
 * leggono da impostazione_piattaforma(), eseguibile solo dal service role.
 *
 * Si prova che:
 * - la regola che dice quali chiavi sono segrete è la stessa nel test e nel
 *   database, e classifica bene le chiavi vere;
 * - nessuna edge function legge un segreto direttamente dalla tabella;
 * - il browser non scarica mai il valore di un segreto;
 * - le funzioni di lettura non sono aperte a utenti né ad anon;
 * - il trigger porta nel Vault ogni segreto scritto nella tabella, e dal
 *   secondo tempo nella tabella resta solo la riga, col valore vuoto;
 * - la migrazione del secondo tempo si ferma se resta un segreto in chiaro.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const RADICE = resolve(__dirname, "../../..");
const MIGRAZIONI = join(RADICE, "supabase/migrations");
const FUNZIONI = join(RADICE, "supabase/functions");

// La stessa regola di public.e_segreto_piattaforma, nell'ultima migrazione che la definisce.
const SEGRETO = /(_key|_secret|_token|_pass|_password)(_|$)/;
// Gli indicatori («openrouter_api_key_set» = "true") non sono segreti.
const INDICATORE = /_(set|configured|configurata|missing|status|at|id)$/;
const PUBBLICHE = new Set(["posthog_api_key", "stripe_publishable_key"]);
const eSegreto = (chiave: string) => SEGRETO.test(chiave) && !INDICATORE.test(chiave) && !PUBBLICHE.has(chiave);

function ultimaMigrazioneCon(testo: string): string {
  const file = readdirSync(MIGRAZIONI)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(join(MIGRAZIONI, f), "utf8").includes(testo))
    .pop();
  expect(file, `nessuna migrazione contiene ${testo}`).toBeDefined();
  return readFileSync(join(MIGRAZIONI, file!), "utf8");
}

function fileTs(cartella: string): string[] {
  const risultato: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      if (voce === "node_modules" || voce === "test") continue;
      risultato.push(...fileTs(percorso));
    } else if (/\.(ts|tsx)$/.test(voce) && !voce.endsWith(".d.ts")) {
      risultato.push(percorso);
    }
  }
  return risultato;
}

// Ogni lettura che parte da .from("platform_settings"): fino al punto e virgola,
// o fino alla lettura successiva (due query nello stesso Promise.all).
function lettureDellaTabella(sorgente: string): string[] {
  const letture: string[] = [];
  const INIZIO = 'from("platform_settings"';
  let i = sorgente.indexOf(INIZIO);
  while (i >= 0) {
    const prossima = sorgente.indexOf(INIZIO, i + 1);
    const puntoEVirgola = sorgente.indexOf(";", i);
    const fine = Math.min(...[prossima, puntoEVirgola, sorgente.length].filter((n) => n >= 0));
    letture.push(sorgente.slice(i, fine));
    i = prossima;
  }
  return letture;
}

const chiaviLetterali = (testo: string) => [...testo.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);

describe("quali chiavi sono segrete", () => {
  it("la regola del test è quella del database", () => {
    const sql = ultimaMigrazioneCon("function public.e_segreto_piattaforma(");
    expect(sql).toContain(`~ '${SEGRETO.source}'`);
    expect(sql).toContain(`!~ '${INDICATORE.source}'`);
    for (const chiave of PUBBLICHE) expect(sql).toContain(`'${chiave}'`);
  });

  it("le chiavi segrete di oggi, e quelle che il codice conosce", () => {
    for (const chiave of [
      "email_transactional_api_key", "email_transactional_api_key_resend", "meta_app_secret",
      "meta_webhook_verify_token", "openapi_api_key", "openapi_downloads_key", "openapi_it_token",
      "openapi_it_token_sandbox", "openwa_api_key", "openwa_webhook_secret", "render_openai_api_key",
      "whatsapp_verify_token", "smtp_pass", "stripe_secret_key", "google_calendar_client_secret",
      "email_mailgun_webhook_signing_key", "telnyx_setup_token",
    ]) {
      expect(eSegreto(chiave), chiave).toBe(true);
    }
  });

  it("le chiavi pubbliche e le impostazioni normali no", () => {
    for (const chiave of [
      "posthog_api_key", "stripe_publishable_key", "meta_app_id", "whatsapp_config_id",
      "openwa_base_url", "openwa_quiet_start", "ai_max_tokens", "google_calendar_client_id",
      "outreach_alert:poll-risposte", "email_transactional_from_address", "openrouter_api_key_set",
    ]) {
      expect(eSegreto(chiave), chiave).toBe(false);
    }
  });
});

describe("chi legge i segreti", () => {
  it("nessuna edge function legge un segreto direttamente dalla tabella", () => {
    const trovate: string[] = [];
    for (const file of fileTs(FUNZIONI)) {
      for (const lettura of lettureDellaTabella(readFileSync(file, "utf8"))) {
        for (const chiave of chiaviLetterali(lettura)) {
          if (eSegreto(chiave)) trovate.push(`${file.replace(RADICE + "/", "")}: ${chiave}`);
        }
      }
    }
    expect(trovate).toEqual([]);
  });

  it("il lettore comune passa dalla funzione del database, con la tabella come riserva", () => {
    const lettore = readFileSync(join(FUNZIONI, "_shared/getPlatformSetting.ts"), "utf8");
    expect(lettore).toMatch(/rpc\("impostazione_piattaforma", \{ p_chiave: chiave \}\)/);
    expect(lettore).toMatch(/rpc\("impostazioni_piattaforma", \{ p_chiavi: chiavi \}\)/);
    expect(lettore).toMatch(/const valore = await leggiImpostazionePiattaforma\(key\);/);
  });

  it("il browser non scarica mai il valore di un segreto", () => {
    const trovate: string[] = [];
    for (const file of fileTs(join(RADICE, "src"))) {
      for (const lettura of lettureDellaTabella(readFileSync(file, "utf8"))) {
        if (!/select\("key, value"\)|select\("value"\)|select\("\*"\)/.test(lettura)) continue;
        for (const chiave of chiaviLetterali(lettura)) {
          if (eSegreto(chiave)) trovate.push(`${file.replace(RADICE + "/", "")}: ${chiave}`);
        }
      }
    }
    expect(trovate).toEqual([]);
  });

  it("l'avviso del battito legge la chiave email dal Vault", () => {
    const sql = ultimaMigrazioneCon("function public.battito_invia_email(");
    expect(sql).toMatch(/v_chiave := public\.impostazione_piattaforma\('email_transactional_api_key'\);/);
  });
});

describe("le funzioni nel database", () => {
  const sql = ultimaMigrazioneCon("function public.impostazione_piattaforma(");

  it("leggono dal Vault, e solo il service role le esegue", () => {
    expect(sql).toMatch(/from vault\.decrypted_secrets s\s+where s\.name = 'platform_settings\.' \|\| p_chiave/);
    expect(sql).toMatch(/revoke all on function public\.impostazione_piattaforma\(text\) from public, anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.impostazioni_piattaforma\(text\[\]\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.impostazione_piattaforma\(text\) to service_role;/);
    expect(sql).toMatch(/revoke all on function public\.salva_segreto_piattaforma\(text, text\) from public, anon, authenticated, service_role;/);
  });

  it("un trigger porta nel Vault ogni segreto scritto nella tabella", () => {
    expect(sql).toMatch(/create trigger platform_settings_segreto_nel_vault\s+before insert or update of value on public\.platform_settings/);
    expect(sql).toMatch(/perform public\.salva_segreto_piattaforma\(new\.key, new\.value\);/);
  });

  it("dal secondo tempo il trigger sposta: nella tabella resta la riga, vuota", () => {
    const trigger = ultimaMigrazioneCon("function public.platform_settings_segreto_nel_vault(");
    expect(trigger).toMatch(/perform public\.salva_segreto_piattaforma\(new\.key, new\.value\);\s+new\.value := '';/);
  });

  it("il secondo tempo svuota solo dove il Vault ha lo stesso valore, e si ferma se resta un segreto", () => {
    const vuota = ultimaMigrazioneCon("Restano segreti in chiaro in platform_settings");
    expect(vuota).toMatch(/set value = ''[\s\S]*?and s\.decrypted_secret = p\.value/);
    expect(vuota).toMatch(/raise exception 'Restano segreti in chiaro in platform_settings'/);
  });
});
