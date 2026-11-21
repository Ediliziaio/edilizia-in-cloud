/// <reference types="node" />
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/test-integration/index.ts", "utf8");
const handlerCode = ts.transpileModule(source.replace(/^import .*;$/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function prepara(impostazioni: Record<string, string> = {}, { admin = true, statusStripe = 200 } = {}) {
  let handler!: (req: Request) => Promise<Response>;
  const getPlatformSetting = vi.fn(async (key: string) => impostazioni[key] ?? "");
  const fetchProvider = vi.fn(async () => new Response(JSON.stringify({
    error: { message: "Risposta con dettagli riservati" },
  }), { status: statusStripe }));
  const from = vi.fn((table: string) => {
    if (table === "platform_settings") return { select: async (): Promise<{ data: never[] }> => ({ data: [] }) };
    if (table !== "user_roles") throw new Error("Tabella inattesa");
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: admin ? { role: "super_admin" } : null }),
    };
    return query;
  });
  runInNewContext(handlerCode, {
    Deno: { serve: (serve: typeof handler) => { handler = serve; }, env: { get: (): undefined => undefined } },
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "utente-demo" } } }) },
      from,
    }),
    getPlatformSetting,
    configurazioneMapsBrowser: async () => ({ configured: true }),
    getCorsHeaders: () => ({}), fetch: fetchProvider, Request, Response, AbortSignal,
  });
  const verifica = (integration: string) => handler(new Request("http://localhost/test-integration", {
    method: "POST", headers: { Authorization: "Bearer sessione-sintetica" },
    body: JSON.stringify({ integration }),
  }));
  return { verifica, from, getPlatformSetting, fetchProvider };
}

describe("diagnostica delle integrazioni amministrative", () => {
  it("usa il lettore di configurazione del prodotto e verifica Stripe dal provider", async () => {
    const chiave = "segreto-sintetico-solo-in-vault";
    const fixture = prepara({ stripe_secret_key: chiave });
    const res = await fixture.verifica("stripe");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, verifica: "connessione" });
    expect(fixture.getPlatformSetting).toHaveBeenCalledExactlyOnceWith("stripe_secret_key", "STRIPE_SECRET_KEY");
    expect(fixture.from).not.toHaveBeenCalledWith("platform_settings");
    expect(fixture.fetchProvider).toHaveBeenCalledExactlyOnceWith("https://api.stripe.com/v1/balance", expect.objectContaining({
      headers: { Authorization: `Bearer ${chiave}` },
    }));
    expect(JSON.stringify(body)).not.toContain(chiave);
  });

  it.each([
    ["google_calendar", "google_calendar_client_id", "demo.apps.googleusercontent.com", true],
    ["google_calendar", "google_calendar_client_id", "demo.apps.googleusercontent.com.invalid", false],
    ["meta", "meta_app_id", "123456789012345", true],
  ])("dichiara una verifica di formato per %s (%s, %s)", async (integration, key, id, ok) => {
    const fixture = prepara({ [key]: id });
    expect(await (await fixture.verifica(integration)).json()).toMatchObject({ ok, verifica: "formato" });
    expect(fixture.fetchProvider).not.toHaveBeenCalled();
  });

  it("per Maps comunica la presenza della configurazione", async () => {
    const fixture = prepara();
    expect(await (await fixture.verifica("google_maps")).json()).toMatchObject({ ok: true, verifica: "configurazione" });
    expect(fixture.fetchProvider).not.toHaveBeenCalled();
  });

  it("senza chiave o accesso amministrativo si ferma prima di contattare Stripe", async () => {
    const senzaChiave = prepara();
    const senzaRuolo = prepara({ stripe_secret_key: "sintetica" }, { admin: false });
    expect(await (await senzaChiave.verifica("stripe")).json()).toMatchObject({ ok: false });
    expect((await senzaRuolo.verifica("stripe")).ok).toBe(false);
    expect(senzaChiave.fetchProvider).not.toHaveBeenCalled();
    expect(senzaRuolo.getPlatformSetting).not.toHaveBeenCalled();
  });

  it("mantiene riservati i dettagli ritornati da Stripe quando rifiuta la chiave", async () => {
    const fixture = prepara({ stripe_secret_key: "sintetica" }, { statusStripe: 401 });
    const body = await (await fixture.verifica("stripe")).json();
    expect(body).toMatchObject({ ok: false, verifica: "connessione" });
    expect(body.message).toContain("401");
    expect(body.message).not.toContain("dettagli riservati");
  });
});
