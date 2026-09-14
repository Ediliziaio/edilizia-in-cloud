/**
 * Messaggi di Instagram e Messenger nella casella Conversazioni.
 *
 * Richiesta del titolare (14/09). Tutto dietro meta_messaggi_attivi: prima
 * dell'approvazione di Meta, chiedere i permessi dei messaggi o iscrivere la
 * pagina a `messages` non deve mai toccare l'ingresso dei lead.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CAMPI_LEAD_E_MESSAGGI,
  chiediPermessiMessaggi,
  leggiModalita,
  dentroFinestra24Ore,
  estraiMessaggiSocial,
  iscriviPaginaMeta,
} from "../../../supabase/functions/_shared/socialMessaggiMeta";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("estraiMessaggiSocial", () => {
  it("Instagram: messaggio in arrivo con testo e allegato", () => {
    const [m] = estraiMessaggiSocial({
      object: "instagram",
      entry: [{ id: "IG1", messaging: [{
        sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 1726300000000,
        message: { mid: "m1", text: "Quanto costa il divano?", attachments: [{ type: "image", payload: { url: "https://x/y.jpg" } }] },
      }] }],
    });
    expect(m).toMatchObject({ piattaforma: "instagram", accountId: "IG1", utenteId: "U1", direzione: "in", mid: "m1", testo: "Quanto costa il divano?", mediaUrl: "https://x/y.jpg" });
    expect(m.ts).toBe(new Date(1726300000000).toISOString());
  });

  it("l'eco di un messaggio dell'azienda è in uscita e la persona è il destinatario", () => {
    const [m] = estraiMessaggiSocial({
      object: "page",
      entry: [{ id: "P1", messaging: [{ sender: { id: "P1" }, recipient: { id: "U9" }, timestamp: 1, message: { mid: "m2", text: "Ciao!", is_echo: true } }] }],
    });
    expect(m).toMatchObject({ piattaforma: "messenger", utenteId: "U9", direzione: "out" });
  });

  it("ignora letture, reazioni, messaggi vuoti e i lead (changes)", () => {
    expect(estraiMessaggiSocial({
      object: "page",
      entry: [{ id: "P1", changes: [{ field: "leadgen", value: { leadgen_id: "1" } }], messaging: [
        { sender: { id: "U1" }, recipient: { id: "P1" }, read: { watermark: 1 } },
        { sender: { id: "U1" }, recipient: { id: "P1" }, reaction: { reaction: "love" } },
        { sender: { id: "U1" }, recipient: { id: "P1" }, message: { mid: "m3", text: "   " } },
      ] }],
    })).toEqual([]);
    expect(estraiMessaggiSocial({ object: "whatsapp_business_account", entry: [] })).toEqual([]);
  });
});

describe("modalità dell'interruttore", () => {
  it("spento di default, revisione e attivo riconosciuti", () => {
    expect(leggiModalita(null)).toBe("spento");
    expect(leggiModalita("false")).toBe("spento");
    expect(leggiModalita("revisione")).toBe("revisione");
    expect(leggiModalita(" TRUE ")).toBe("attivo");
  });

  it("in revisione i permessi dei messaggi li chiede solo il super admin", () => {
    expect(chiediPermessiMessaggi("spento", true)).toBe(false);
    expect(chiediPermessiMessaggi("revisione", true)).toBe(true);
    expect(chiediPermessiMessaggi("revisione", false)).toBe(false);
    expect(chiediPermessiMessaggi("attivo", false)).toBe(true);
  });
});

describe("dentroFinestra24Ore", () => {
  const ora = Date.parse("2026-09-14T12:00:00Z");
  it("aperta entro 24 ore, chiusa dopo o senza messaggi", () => {
    expect(dentroFinestra24Ore("2026-09-13T12:30:00Z", ora)).toBe(true);
    expect(dentroFinestra24Ore("2026-09-13T11:59:00Z", ora)).toBe(false);
    expect(dentroFinestra24Ore(null, ora)).toBe(false);
  });
});

describe("iscriviPaginaMeta", () => {
  const risposta = (body: unknown) => ({ json: async () => body });

  it("interruttore spento: una sola chiamata, solo lead", async () => {
    const f = vi.fn(async () => risposta({ success: true }));
    const r = await iscriviPaginaMeta("v21.0", "P1", "tok", false, f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls[0] as unknown[])[1] && ((f.mock.calls[0] as unknown[])[1] as { body: URLSearchParams }).body.get("subscribed_fields"))).toBe("leadgen");
    expect(r.campi).toEqual(["leadgen"]);
  });

  it("interruttore acceso ma Meta rifiuta i messaggi: ripiega sui lead", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(risposta({ error: { code: 200, message: "requires pages_messaging" } }))
      .mockResolvedValueOnce(risposta({ success: true }));
    const r = await iscriviPaginaMeta("v21.0", "P1", "tok", true, f);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.campi).toEqual(["leadgen"]);
    expect(r.data).toEqual({ success: true });
  });

  it("interruttore acceso e permesso approvato: lead e messaggi", async () => {
    const f = vi.fn(async () => risposta({ success: true }));
    const r = await iscriviPaginaMeta("v21.0", "P1", "tok", true, f);
    expect(r.campi).toEqual(CAMPI_LEAD_E_MESSAGGI.split(","));
  });
});

describe("collegamenti", () => {
  it("le iscrizioni delle pagine passano tutte dall'helper con ripiego", () => {
    const proxy = leggi("supabase/functions/meta-api-proxy/index.ts");
    const salute = leggi("supabase/functions/meta-health-check/index.ts");
    expect(proxy).not.toMatch(/subscribed_fields: "leadgen"/);
    expect(salute).not.toMatch(/subscribed_fields: "leadgen"/);
    expect((proxy.match(/iscriviPaginaMeta\(/g) ?? []).length).toBe(2);
  });

  it("i permessi dei messaggi si chiedono solo con l'interruttore acceso", () => {
    expect(leggi("supabase/functions/meta-oauth-start/index.ts")).toMatch(/chiediPermessiMessaggi\(await modalitaMessaggiSocial\(\w+\), isSuperAdmin\) \? PERMESSI_MESSAGGI : \[\]/);
  });

  it("le chiamate di prova per la App Review coprono i tre permessi dei messaggi", () => {
    const proxy = leggi("supabase/functions/meta-api-proxy/index.ts");
    expect(proxy).toMatch(/out\.pages_messaging = /);
    expect(proxy).toMatch(/out\.instagram_basic = /);
    expect(proxy).toMatch(/out\.instagram_manage_messages = /);
  });

  it("la vista del WhatsApp ufficiale non si tocca: i social stanno in una vista a parte", () => {
    const sql = leggi("supabase/migrations/20280916810000_messaggi_instagram_messenger.sql");
    expect(sql).not.toMatch(/CREATE OR REPLACE VIEW public\.v_conversazioni_messaggi/);
    expect((sql.match(/v_conversazioni_social/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("la casella conosce i due canali", () => {
    expect(leggi("src/hooks/useConversazioni.ts")).toMatch(/"instagram" \| "messenger"/);
    const inbox = leggi("src/pages/azienda/conversazioni/ConversazioniInbox.tsx");
    expect(inbox).toMatch(/instagram: \{ label: "Instagram"/);
    expect(inbox).toMatch(/messenger: \{ label: "Messenger"/);
  });
});

describe("verifica del webhook Meta", () => {
  it("accetta anche il token delle impostazioni di piattaforma, senza ripiegare su WhatsApp", () => {
    const webhook = leggi("supabase/functions/meta-webhook/index.ts");
    expect(webhook).toMatch(/eq\("key", "meta_webhook_verify_token"\)/);
    expect(webhook).toMatch(/Deno\.env\.get\("META_WEBHOOK_VERIFY_TOKEN"\)/);
    expect(webhook).not.toMatch(/WHATSAPP_VERIFY_TOKEN|WA_VERIFY_TOKEN/);
  });
});
