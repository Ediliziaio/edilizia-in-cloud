/**
 * «Non riesco a leggere il segreto» non è «il segreto non c'è» (06/11/2026).
 *
 * openwa-webhook ha rifiutato 25 webhook WhatsApp in ingresso con
 * «openwa_webhook_secret non configurato», mentre il segreto c'era: 64
 * caratteri nel Vault. La RPC `impostazione_piattaforma` era fallita per motivi
 * transitori — 17 volte PostgREST ha risposto una pagina HTML di errore, 8
 * volte «Could not query the database for the schema cache» — e il ripiego su
 * platform_settings ha letto la riga vuota che dal 19/09/2026 ogni segreto ha
 * nella tabella. Un intoppo di un istante diventava un 401: al mittente
 * «messaggio rifiutato», definitivo, invece di «riprova».
 *
 * Peggio in openwa-gateway, che il segreto lo passa a OpenWA al momento di
 * registrare il webhook: senza segreto registrava il webhook comunque, e da
 * quel momento OpenWA manda messaggi non firmati che openwa-webhook rifiuta
 * tutti. Un guasto permanente da un errore di un istante.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ATTESE_RITENTATIVO_MS,
  eChiaveSegreta,
  eErroreTransitorio,
} from "../../../supabase/functions/_shared/segretiPiattaforma";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(RADICE, p), "utf8");

describe("la regola sulle chiavi segrete è quella del database", () => {
  // public.e_segreto_piattaforma: ~ '(_key|_secret|_token|_pass|_password)(_|$)'
  // and !~ '_(set|configured|configurata|missing|status|at|id)$'
  // and not in ('posthog_api_key', 'stripe_publishable_key')
  it("riconosce i segreti veri", () => {
    for (const k of [
      "openwa_webhook_secret",
      "openwa_api_key",
      "stripe_secret_key",
      "meta_access_token",
      "smtp_password",
      "imap_pass",
    ]) {
      expect(eChiaveSegreta(k), k).toBe(true);
    }
  });

  it("non tratta da segreti gli indicatori e le chiavi pubbliche", () => {
    for (const k of [
      "openrouter_api_key_set",
      "stripe_publishable_key",
      "posthog_api_key",
      "whatsapp_token_configured",
      "openwa_base_url",
      "internal_alert_email",
    ]) {
      expect(eChiaveSegreta(k), k).toBe(false);
    }
  });

  it("vale anche col marcatore in mezzo, come nel database", () => {
    // Il regex del database chiude con (_|$), non solo con $.
    expect(eChiaveSegreta("stripe_secret_key")).toBe(true);
    expect(eChiaveSegreta("meta_token_prod")).toBe(true);
  });
});

describe("per una chiave segreta non si ripiega sulla tabella", () => {
  const condiviso = leggi("supabase/functions/_shared/getPlatformSetting.ts");
  const regole = leggi("supabase/functions/_shared/segretiPiattaforma.ts");

  it("esiste la lettura che distingue «non lo so» da «non impostata»", () => {
    expect(condiviso).toContain("export async function leggiImpostazionePiattaformaEsito");
    expect(condiviso).toContain("letturaRiuscita");
  });

  it("la RPC viene ritentata sugli errori transitori", () => {
    expect(regole).toContain("schema cache");
    expect(regole).toContain("<!doctype html");
    expect(condiviso).toContain("ATTESE_RITENTATIVO_MS");
    expect(condiviso).toContain("eErroreTransitorio(ultimoErrore)");
  });

  it("le regole stanno in un modulo senza import di rete, così si provano", () => {
    expect(regole).not.toContain("https://");
    expect(regole).not.toContain("import ");
  });

  it("se la chiave è segreta e la RPC fallisce, la tabella non viene interrogata", () => {
    // Il ramo `if (segreta)` deve chiudersi con un return prima della select.
    const i = condiviso.indexOf("if (segreta) {");
    expect(i).toBeGreaterThan(-1);
    const ramo = condiviso.slice(i, condiviso.indexOf("}", condiviso.indexOf("return { valore:", i)));
    expect(ramo).not.toContain('.from("platform_settings")');
    expect(ramo).toContain("letturaRiuscita: false");
  });

  it("leggiImpostazionePiattaforma resta compatibile: ritorna la stringa", () => {
    expect(condiviso).toContain(
      "return (await leggiImpostazionePiattaformaEsito(chiave)).valore;",
    );
  });
});

describe("openwa-webhook: un errore di lettura è 503, non 401", () => {
  const webhook = leggi("supabase/functions/openwa-webhook/index.ts");

  it("risponde 503 con Retry-After quando il segreto non è leggibile", () => {
    expect(webhook).toContain("esitoSegreto.letturaRiuscita");
    expect(webhook).toContain("status: 503");
    expect(webhook).toContain('"Retry-After"');
  });

  it("il 401 resta per il caso vero: segreto assente", () => {
    expect(webhook).toContain("openwa_webhook_secret non configurato: webhook rifiutato");
    expect(webhook).toContain("status: 401");
  });

  it("la firma resta obbligatoria: nessun ramo che la salta", () => {
    expect(webhook).toContain("verifyHmac(secret, rawBody, sig)");
  });
});

describe("openwa-gateway: niente webhook senza segreto", () => {
  const gateway = leggi("supabase/functions/openwa-gateway/index.ts");

  it("se il segreto non è leggibile non registra il webhook", () => {
    const i = gateway.indexOf("esitoSegreto.letturaRiuscita");
    expect(i).toBeGreaterThan(-1);
    // Il controllo deve venire PRIMA della POST che registra il webhook
    // (riga 59: owaFetch con method POST), non prima della GET che elenca.
    expect(i).toBeLessThan(gateway.indexOf('OWA_PATHS.createWebhook(sessionId), {'));
    expect(gateway.slice(i, i + 600)).toContain("return;");
  });
});

describe("quali errori meritano un altro tentativo", () => {
  it("i due visti in produzione il 06/11/2026", () => {
    expect(eErroreTransitorio("Could not query the database for the schema cache. Retrying.")).toBe(true);
    expect(eErroreTransitorio('<!DOCTYPE html>\n<html class="no-js" lang="en-US">')).toBe(true);
  });

  it("e gli altri intoppi di rete e gateway", () => {
    for (const m of ["fetch failed", "connection reset by peer", "502 Bad Gateway", "operation timed out"]) {
      expect(eErroreTransitorio(m), m).toBe(true);
    }
  });

  it("non un errore che resterebbe tale a riprovare", () => {
    for (const m of [
      "permission denied for function impostazione_piattaforma",
      "function public.impostazione_piattaforma(p_chiave => text) does not exist",
      "",
    ]) {
      expect(eErroreTransitorio(m), m).toBe(false);
    }
  });

  it("i tentativi sono pochi e brevi: non si tiene occupato il worker", () => {
    expect(ATTESE_RITENTATIVO_MS.length).toBeLessThanOrEqual(3);
    expect(ATTESE_RITENTATIVO_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1500);
  });
});

describe("la lettura a più chiavi segue le stesse regole (07/11/2026)", () => {
  // Da leggiImpostazioniPiattaforma passa getMetaCredentials, cioè la firma
  // dei webhook di WhatsApp Cloud API e di Messenger/Instagram.
  const condiviso = leggi("supabase/functions/_shared/getPlatformSetting.ts");
  const ramo = condiviso.slice(condiviso.indexOf("export async function leggiImpostazioniPiattaformaEsito"));

  it("esiste la versione che dice quali chiavi non si sono lette", () => {
    expect(ramo).toContain("nonLette");
  });

  it("ritenta la RPC sugli intoppi transitori", () => {
    expect(ramo).toContain("eErroreTransitorio(ultimoErrore)");
    expect(ramo).toContain("ATTESE_RITENTATIVO_MS");
  });

  it("dalla tabella rilegge solo le chiavi pubbliche", () => {
    expect(ramo).toContain('.in("key", pubbliche)');
    expect(ramo).not.toContain('.in("key", chiavi)');
  });

  it("la versione di prima resta compatibile", () => {
    expect(condiviso).toContain("return (await leggiImpostazioniPiattaformaEsito(chiavi)).valori;");
  });

  it("getMetaCredentials passa davvero di qui", () => {
    expect(leggi("supabase/functions/_shared/getMetaCredentials.ts")).toContain("leggiImpostazioniPiattaforma(");
  });
});

describe("email-provider-webhook: un segreto illeggibile non spegne la verifica della firma", () => {
  const webhook = leggi("supabase/functions/email-provider-webhook/index.ts");

  it("Resend: firma presente e segreto non leggibile → 503", () => {
    expect(webhook).toContain("!esitoResend.letturaRiuscita && svixSignature");
  });

  it("la risposta chiede di riprovare", () => {
    expect(webhook).toContain('"Retry-After": "30"');
  });

  it("Mailgun non c'è più (07/11/2026: mai configurato)", () => {
    expect(webhook).not.toMatch(/esitoMailgun|verifyMailgunWebhookSignature|MAILGUN_WEBHOOK_SIGNING_KEY/);
  });

  it("la variabile d'ambiente, se c'è, vale prima del database", () => {
    expect(webhook).toContain('Deno.env.get("RESEND_WEBHOOK_SECRET")');
  });
});

describe("la correzione arriva a tutte le funzioni che leggono le impostazioni", () => {
  // La CI risale la catena degli import (scripts/funzioni-da-ripubblicare.mjs):
  // una modifica a _shared/getPlatformSetting.ts ripubblica anche chi lo
  // importa di seconda mano (getMetaCredentials, openwaSend, emailProvider…).
  it("i webhook in ingresso importano il modulo, direttamente o no", () => {
    for (const f of ["whatsapp-webhook", "meta-webhook", "openwa-webhook", "email-provider-webhook", "stripe-webhook"]) {
      const t = leggi(`supabase/functions/${f}/index.ts`);
      expect(/getPlatformSetting|getMetaCredentials/.test(t), f).toBe(true);
    }
  });
});
