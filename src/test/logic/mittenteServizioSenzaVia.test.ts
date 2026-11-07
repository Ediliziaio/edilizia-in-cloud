/**
 * Il mittente delle email di servizio senza «via EdiliziaInCloud» e le email
 * degli appuntamenti da Elastic Email (07/11/2026).
 *
 * Senza un dominio proprio le email di servizio arrivavano come «Innovasol srl
 * via EdiliziaInCloud <no-reply@notifiche.ediliziaincloud.it>»: ora col solo
 * nome dell'azienda. Il «via» resta sulle campagne. Promemoria, conferme,
 * spostamenti e disdette degli appuntamenti escono da Elastic Email anche
 * quando il calendario non ha un mittente suo: il mittente sta allora sul
 * dominio verificato lì (quello marketing dell'azienda o mkt.eic-mail.com).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  impostazioni: {} as Record<string, string>,
  invii: [] as Array<{ stream: string; from: string; replyTo?: string; opzioni: Record<string, unknown> }>,
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => ({}) }));
vi.mock("../../../supabase/functions/_shared/getPlatformSetting.ts", () => ({
  getPlatformSetting: async (k: string) => stato.impostazioni[k] ?? "",
}));
vi.mock("../../../supabase/functions/_shared/emailProvider.ts", () => ({
  loadProviderSettings: async (stream: string) => ({
    provider: stream === "marketing" ? "elastic_email" : "resend",
    apiKey: "chiave",
    fromDefault: "EdiliziaInCloud <noreply@notifiche.ediliziaincloud.it>",
    domain: null as string | null,
  }),
  sendViaProvider: async () => ({ ok: true, status: 200, body: {} }),
  sendViaProviderWithFailover: async (stream: string, _s: unknown, req: { from: string; replyTo?: string }, opzioni: Record<string, unknown>) => {
    stato.invii.push({ stream, from: req.from, replyTo: req.replyTo, opzioni });
    return { ok: true, status: 200, body: {}, providerUsed: stream === "marketing" ? "elastic_email" : "resend" };
  },
}));
vi.mock("../../../supabase/functions/_shared/emailCredits.ts", () => ({
  addEmailCredits: async () => ({}),
  deductEmailCredits: async () => ({}),
}));
vi.mock("../../../supabase/functions/_shared/email-log.ts", () => ({ logEmailDelivery: async () => ({ id: "log-1" }) }));
vi.mock("../../../supabase/functions/_shared/emailSuppression.ts", async (originale) => ({
  ...(await originale<typeof import("../../../supabase/functions/_shared/emailSuppression")>()),
  getSuppressedEmailMap: async () => new Map(),
}));

import { nomeMittenteDiRiserva } from "../../../supabase/functions/_shared/nomeMittenteRiserva";
import { resolveSender } from "../../../supabase/functions/_shared/resolveSender";
import { sendEmailUnified } from "../../../supabase/functions/_shared/sendEmailUnified";
import { opzioniMittenteCalendario } from "../../../supabase/functions/_shared/mittenteCalendario";

const AZ = "00000000-0000-0000-0000-000000000001";

/** Un database finto: ogni tabella restituisce la sua riga a maybeSingle, o la lista a fine catena. */
function dbFinto(righe: Record<string, unknown>) {
  const catena = (tabella: string) => {
    const valore = righe[tabella];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit", "in"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: Array.isArray(valore) ? valore[0] ?? null : valore ?? null, error: null as unknown });
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: valore ?? [], error: null as unknown }).then(ok);
    return q;
  };
  return {
    from: (t: string) => catena(t),
    rpc: async () => ({ data: null as unknown, error: null as unknown }),
  } as never;
}

const PREFERENZE = {
  sender_name: "Innovasol srl",
  sender_prefix: "no-reply",
  reply_to_email: "info@esempio.it",
  transactional_domain_id: null as string | null,
  marketing_domain_id: null as string | null,
};

beforeEach(() => {
  stato.impostazioni = { email_marketing_fallback_subdomain: "mkt.eic-mail.com" };
  stato.invii = [];
});

describe("nomeMittenteDiRiserva", () => {
  it("messaggi di servizio: il solo nome dell'azienda", () => {
    expect(nomeMittenteDiRiserva({ nome: "Innovasol srl", canale: "transactional" })).toBe("Innovasol srl");
    // Anche con un suffisso impostato in platform_settings.
    expect(nomeMittenteDiRiserva({ nome: "Innovasol srl", canale: "transactional", suffisso: " via EiC" })).toBe("Innovasol srl");
  });

  it("campagne: il «via EdiliziaInCloud» resta, senza ripetere la piattaforma", () => {
    expect(nomeMittenteDiRiserva({ nome: "Innovasol srl", canale: "marketing" })).toBe("Innovasol srl via EdiliziaInCloud");
    expect(nomeMittenteDiRiserva({ nome: "Innovasol srl", canale: "marketing", suffisso: "" })).toBe("Innovasol srl via EdiliziaInCloud");
    expect(nomeMittenteDiRiserva({ nome: "EdiliziaInCloud", canale: "marketing" })).toBe("EdiliziaInCloud");
  });

  it("email di servizio dal provider del marketing: niente suffisso", () => {
    expect(nomeMittenteDiRiserva({ nome: "Innovasol srl", canale: "marketing", senzaSuffisso: true })).toBe("Innovasol srl");
  });
});

describe("resolveSender sul dominio della piattaforma", () => {
  it("transazionale: «Innovasol srl <no-reply@notifiche.ediliziaincloud.it>», risposte all'azienda", async () => {
    const m = await resolveSender(AZ, "transactional", dbFinto({ company_email_preferences: PREFERENZE }));
    expect(m.from).toBe("Innovasol srl <no-reply@notifiche.ediliziaincloud.it>");
    expect(m.replyTo).toBe("info@esempio.it");
    expect(m.source).toBe("fallback_subdomain");
  });

  it("marketing: il «via EdiliziaInCloud» resta", async () => {
    const m = await resolveSender(AZ, "marketing", dbFinto({ company_email_preferences: PREFERENZE }));
    expect(m.from).toBe("Innovasol srl via EdiliziaInCloud <no-reply@mkt.eic-mail.com>");
  });

  it("marketing senzaSuffisso: dominio del marketing, solo nome", async () => {
    const m = await resolveSender(AZ, "marketing", dbFinto({ company_email_preferences: PREFERENZE }), { senzaSuffisso: true });
    expect(m.from).toBe("Innovasol srl <no-reply@mkt.eic-mail.com>");
  });

  it("senza azienda resta il mittente della piattaforma", async () => {
    const m = await resolveSender(null, "transactional", dbFinto({}));
    expect(m.from).toBe("EdiliziaInCloud <noreply@notifiche.ediliziaincloud.it>");
    expect(m.source).toBe("platform_default");
  });
});

describe("sendEmailUnified con viaMarketingProvider", () => {
  const base = {
    companyId: AZ,
    stream: "transactional" as const,
    to: "cliente@esempio.it",
    subject: "Promemoria appuntamento",
    html: "<p>ciao</p>",
  };

  it("senza senderOverride: esce da Elastic sul dominio marketing verificato dell'azienda, senza «via»", async () => {
    const db = dbFinto({
      company_email_preferences: { ...PREFERENZE, marketing_domain_id: "d1" },
      company_email_domains: { id: "d1", domain: "mkt.innovasol.it", is_active: true, ee_spf_verified: true, ee_dkim_verified: true },
    });
    const r = await sendEmailUnified({ ...base, adminClient: db, viaMarketingProvider: true });
    expect(r.ok).toBe(true);
    expect(stato.invii).toHaveLength(1);
    expect(stato.invii[0].stream).toBe("marketing");
    expect(stato.invii[0].from).toBe("Innovasol srl <no-reply@mkt.innovasol.it>");
    expect(stato.invii[0].replyTo).toBe("info@esempio.it");
    expect(stato.invii[0].opzioni.elasticTransactionalClass).toBe(true);
  });

  it("senza dominio dell'azienda: il dominio di riserva del marketing (verificato su Elastic), non notifiche.…", async () => {
    await sendEmailUnified({ ...base, adminClient: dbFinto({ company_email_preferences: PREFERENZE }), viaMarketingProvider: true });
    expect(stato.invii[0].from).toBe("Innovasol srl <no-reply@mkt.eic-mail.com>");
    expect(stato.invii[0].from).not.toContain("notifiche.ediliziaincloud.it");
    expect(stato.invii[0].from).not.toContain("via EdiliziaInCloud");
  });

  it("senza viaMarketingProvider il transazionale resta sul suo provider, col solo nome", async () => {
    await sendEmailUnified({ ...base, adminClient: dbFinto({ company_email_preferences: PREFERENZE }) });
    expect(stato.invii[0].stream).toBe("transactional");
    expect(stato.invii[0].from).toBe("Innovasol srl <no-reply@notifiche.ediliziaincloud.it>");
  });
});

describe("opzioniMittenteCalendario: sempre Elastic", () => {
  const verificato = { domain: "mkt.ediliziaincloud.com", is_active: true, ee_spf_verified: true, ee_dkim_verified: true };

  it("calendario senza mittente, o nessun calendario: viaMarketingProvider senza senderOverride", async () => {
    expect(await opzioniMittenteCalendario(dbFinto({}), null, "c1")).toEqual({ viaMarketingProvider: true });
    expect(await opzioniMittenteCalendario(dbFinto({}), { company_id: AZ, mittente_email: null }, "c1")).toEqual({ viaMarketingProvider: true });
  });

  it("mittente su un dominio non verificato: Elastic col mittente dell'azienda", async () => {
    const db = dbFinto({ company_email_domains: [{ ...verificato, ee_dkim_verified: false }] });
    const o = await opzioniMittenteCalendario(db, { company_id: AZ, mittente_email: "flo@mkt.ediliziaincloud.com" }, null, false);
    expect(o).toEqual({ viaMarketingProvider: true });
  });

  it("errore nel leggere i domini: non blocca, resta Elastic", async () => {
    const rotto = { from: () => { throw new Error("db giù"); } } as never;
    expect(await opzioniMittenteCalendario(rotto, { company_id: AZ, mittente_email: "flo@mkt.ediliziaincloud.com" }, null)).toEqual({ viaMarketingProvider: true });
  });

  it("mittente del calendario verificato: il suo senderOverride, sempre su Elastic", async () => {
    const db = dbFinto({ company_email_domains: [verificato] });
    const o = await opzioniMittenteCalendario(db, { company_id: AZ, mittente_nome: "Filippo", mittente_email: "flo@mkt.ediliziaincloud.com" }, null, false);
    expect(o.viaMarketingProvider).toBe(true);
    expect((o.senderOverride as { from: string }).from).toBe("Filippo <flo@mkt.ediliziaincloud.com>");
  });
});

describe("ogni email degli appuntamenti passa da Elastic", () => {
  const ROOT = join(__dirname, "../../..");
  for (const nome of ["appuntamenti-promemoria", "appuntamenti-notifiche", "public-booking-crea", "public-booking-gestisci"]) {
    it(nome, () => {
      const codice = readFileSync(join(ROOT, `supabase/functions/${nome}/index.ts`), "utf8");
      const invii = codice.split("await sendEmailUnified({").slice(1);
      expect(invii.length).toBeGreaterThan(0);
      for (const invio of invii) {
        const chiamata = invio.slice(0, invio.indexOf("});"));
        expect(chiamata).toMatch(/opzioniMittenteCalendario\(|viaMarketingProvider: true/);
      }
    });
  }
});
