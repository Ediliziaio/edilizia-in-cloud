/**
 * La salute delle integrazioni deve dire il vero (20/09/2026).
 *
 * Due controlli mentivano da mesi:
 *   · Cloudflare «HTTP 403» a ogni giro, mai verde: si interrogava una risorsa
 *     per cui il token non ha (e non deve avere) il permesso. Un'email di
 *     allarme al giorno per un guasto che non c'era.
 *   · Email marketing verde con il piano Elastic Email scaduto dal 25/07: la
 *     sonda manda un corpo vuoto e prende per buono il 400 di validazione,
 *     mentre 177 notifiche in venti giorni uscivano dal canale di riserva.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  erroreProviderLeggibile,
  esitoCloudflare,
  esitoEmailConProve,
  type EsitoSalute,
  type ProveInvii,
  type RispostaCloudflare,
} from "../../../supabase/functions/_shared/saluteIntegrazioni";

const ROOT = join(__dirname, "../../..");
const attivo: RispostaCloudflare = { http: 200, success: true, statoToken: "active" };
const rifiutato: RispostaCloudflare = { http: 401, success: false, statoToken: null };
const pagineOk: RispostaCloudflare = { http: 200, success: true };

describe("Cloudflare: il token è valido, e fa il suo mestiere?", () => {
  it("token attivo e domini di Pages leggibili → sano", () => {
    expect(esitoCloudflare({ verificaUtente: attivo, pages: pagineOk, progetto: "edilizia-in-cloud" }))
      .toEqual({ status: "healthy", error: null });
  });

  it("un token dell'account non passa da /user/tokens/verify ma da quello dell'account", () => {
    const esito = esitoCloudflare({ verificaUtente: rifiutato, verificaAccount: attivo, pages: pagineOk, progetto: "p" });
    expect(esito.status).toBe("healthy");
  });

  it("token rifiutato ovunque → giù, e dice di rigenerarlo", () => {
    const esito = esitoCloudflare({ verificaUtente: rifiutato, verificaAccount: { http: 403 }, pages: { http: 403 }, progetto: "p" });
    expect(esito.status).toBe("down");
    expect(esito.error).toMatch(/non è valido \(HTTP 401\).*rigenerato/);
  });

  it("token scaduto o disattivato → giù, con lo stato che dà Cloudflare", () => {
    const esito = esitoCloudflare({ verificaUtente: { http: 200, success: true, statoToken: "expired" }, pages: null, progetto: "p" });
    expect(esito.status).toBe("down");
    expect(esito.error).toContain("«expired»");
  });

  it("token buono ma senza il permesso su Pages → degradato, e dice cosa non si può fare", () => {
    const esito = esitoCloudflare({ verificaUtente: attivo, pages: { http: 403, success: false }, progetto: "p" });
    expect(esito.status).toBe("degraded");
    expect(esito.error).toMatch(/Token valido.*permesso «Cloudflare Pages».*domini personalizzati/);
  });

  it("progetto Pages inesistente → degradato, con il nome del progetto cercato", () => {
    const esito = esitoCloudflare({ verificaUtente: attivo, pages: { http: 404 }, progetto: "edilizia-in-cloud" });
    expect(esito.status).toBe("degraded");
    expect(esito.error).toContain("«edilizia-in-cloud»");
  });

  it("manca l'id dell'account → degradato: i domini vanno a mano", () => {
    const esito = esitoCloudflare({ verificaUtente: attivo, pages: null, progetto: "p" });
    expect(esito.status).toBe("degraded");
    expect(esito.error).toContain("CLOUDFLARE_ACCOUNT_ID");
  });

  it("Cloudflare non risponde → giù, senza dare la colpa al token", () => {
    const esito = esitoCloudflare({ verificaUtente: { http: 0, erroreRete: "timeout" }, pages: null, progetto: "p" });
    expect(esito.status).toBe("down");
    expect(esito.error).toBe("Cloudflare non raggiungibile: timeout");
  });

  it("il vecchio 403 sulla scheda dell'account non conta più: non la si chiede", () => {
    const funzione = readFileSync(join(ROOT, "supabase/functions/check-api-health/index.ts"), "utf8");
    expect(funzione).toContain('chiamaCloudflare("/user/tokens/verify"');
    expect(funzione).toMatch(/\/pages\/projects\/\$\{progetto\}\/domains/);
    // GET /accounts/{id} da solo era la sonda sbagliata.
    expect(funzione).not.toMatch(/client\/v4\/accounts\/\$\{cloudflareAccountId\}`/);
  });
});

describe("Email marketing: la sonda contro le prove degli invii veri", () => {
  const sano: EsitoSalute = { status: "healthy", error: null };
  const prove = (p: Partial<ProveInvii>): ProveInvii => ({
    ripieghi24h: 0, riuscite24h: 0, ultimoRiuscito: null, ultimoErrore: null, ultimoErroreIl: null, ...p,
  });

  it("il caso vero: sonda verde, 37 email dal canale di riserva, zero da questo → giù", () => {
    const esito = esitoEmailConProve(sano, prove({
      ripieghi24h: 37,
      ultimoRiuscito: "2026-08-15T15:25:00Z",
      ultimoErrore: '{"Error":"Your plan expired. Renew your account\'s plan to continue sending email.","MessageID":"plan_expired_for_campaign"}',
      ultimoErroreIl: "2026-08-29T17:40:00Z",
    }));
    expect(esito.status).toBe("down");
    expect(esito.error).toContain("37 email sono uscite dal canale di riserva");
    expect(esito.error).toContain("«Your plan expired. Renew your account's plan to continue sending email.»");
    expect(esito.error).toContain("(29/08)");
    expect(esito.error).toContain("Ultimo invio riuscito: 15/08.");
  });

  it("nessun ripiego → resta quello che dice la sonda", () => {
    expect(esitoEmailConProve(sano, prove({ ripieghi24h: 0 }))).toEqual(sano);
  });

  it("qualche ripiego ma il canale consegna → resta sano (un rifiuto singolo non è un guasto)", () => {
    expect(esitoEmailConProve(sano, prove({ ripieghi24h: 2, riuscite24h: 40 }))).toEqual(sano);
  });

  it("piano rinnovato: al primo invio riuscito torna verde da solo", () => {
    expect(esitoEmailConProve(sano, prove({ ripieghi24h: 5, riuscite24h: 1 })).status).toBe("healthy");
  });

  it("se la sonda dice già che la chiave è rifiutata, vale la sonda", () => {
    const degradato: EsitoSalute = { status: "degraded", error: "HTTP 401" };
    expect(esitoEmailConProve(degradato, prove({ ripieghi24h: 37 }))).toEqual(degradato);
  });

  it("prove non leggibili → non si inventa niente", () => {
    expect(esitoEmailConProve(sano, null)).toEqual(sano);
  });

  it("mai stato un invio riuscito → lo dice", () => {
    expect(esitoEmailConProve(sano, prove({ ripieghi24h: 3 })).error).toContain("Nessun invio riuscito in archivio.");
  });

  it("l'errore del provider si legge senza il JSON attorno, e non straripa", () => {
    expect(erroreProviderLeggibile('{"Error":"Your plan expired."}')).toBe("Your plan expired.");
    expect(erroreProviderLeggibile('{"message":"Domain not verified"}')).toBe("Domain not verified");
    expect(erroreProviderLeggibile("smtp_unexpected: 550 Spam Rejected")).toBe("smtp_unexpected: 550 Spam Rejected");
    expect(erroreProviderLeggibile("x".repeat(500))?.length).toBe(140);
    expect(erroreProviderLeggibile(null)).toBe(null);
  });
});

describe("L'avviso «integrazione in errore»", () => {
  const migrazione = readFileSync(
    join(ROOT, "supabase/migrations/20280920200000_integrazioni_avviso_solo_controlli_vivi.sql"), "utf8",
  );

  it("guarda solo i controlli ancora vivi: «elastic_email», fermo da aprile, non è un guasto", () => {
    expect(migrazione).toMatch(/u\.checked_at > now\(\) - interval '48 hours'/);
  });

  it("resta chiuso a chi non è il servizio", () => {
    expect(migrazione).toMatch(/REVOKE ALL ON FUNCTION public\.integrazioni_avvisa\(\) FROM PUBLIC, anon, authenticated/);
  });
});

describe("Versioni delle API di terzi", () => {
  it("Meta: il controllo salute usa la versione delle altre funzioni, non la v18.0 spenta", () => {
    const funzione = readFileSync(join(ROOT, "supabase/functions/check-api-health/index.ts"), "utf8");
    expect(funzione).not.toContain("graph.facebook.com/v18.0");
    expect(funzione).toContain('Deno.env.get("META_API_VERSION") || "v21.0"');
  });

  it("Google Ads: nessuna versione scritta a mano nell'indirizzo (la v17 è spenta da giugno 2025)", () => {
    for (const f of ["google-ads-oauth", "google-ads-sync-campaigns"]) {
      const testo = readFileSync(join(ROOT, `supabase/functions/${f}/index.ts`), "utf8");
      expect(testo).not.toMatch(/googleads\.googleapis\.com\/v\d+/);
      expect(testo).toContain('Deno.env.get("GOOGLE_ADS_API_VERSION") || "v25"');
    }
  });
});
