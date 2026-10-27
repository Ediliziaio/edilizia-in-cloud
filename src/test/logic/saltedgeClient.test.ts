import { beforeAll, describe, expect, it, vi } from "vitest";
import { SaltEdgeClient, SaltEdgeError, importSaltKey, saltConfiguration, saltId, saltReturnUrl, saltTransaction, saltWidgetUrl, verifySaltCallbackSignature, saltBody, SALTEDGE_CALLBACK_KEY_V6, type SaltConfig } from "../../../supabase/functions/_shared/saltedge";

let config: SaltConfig, publicPem: string;
const pem = (key: ArrayBuffer, kind: string) => `-----BEGIN ${kind} KEY-----\n${Buffer.from(key).toString("base64")}\n-----END ${kind} KEY-----`;
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  config = { appId: "test-app", secret: "synthetic-test-only", mode: "pending", accessType: "client", origin: "http://127.0.0.1:8080", webhookBase: "https://test.invalid/functions/v1/bank-saltedge-webhook", privateKey: pem(await crypto.subtle.exportKey("pkcs8", pair.privateKey), "PRIVATE") };
  publicPem = pem(await crypto.subtle.exportKey("spki", pair.publicKey), "PUBLIC");
});
const company = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const env = (extra = {}) => { const values: Record<string, string> = { SALTEDGE_BETA_COMPANY_IDS: company, SALTEDGE_APP_ID: config.appId, SALTEDGE_SECRET: config.secret, SALTEDGE_PRIVATE_KEY: config.privateKey, SALTEDGE_APP_ORIGIN: config.origin, SALTEDGE_WEBHOOK_BASE_URL: config.webhookBase, SALTEDGE_ACCESS_TYPE: "client", ...extra }; return (name: string) => values[name]; };

describe("Salt Edge V6 beta: trasporto e confini di sicurezza", () => {
  it("blocca aziende non abilitate, segreti mancanti e produzione", () => {
    expect(() => saltConfiguration(env(), "other")).toThrow("BetaNotEnabled");
    expect(() => saltConfiguration(env({ SALTEDGE_SECRET: "" }), company)).toThrow("NotConfigured");
    expect(() => saltConfiguration(env({ SALTEDGE_MODE: "live" }), company)).toThrow("BetaModeRequired");
    expect(saltConfiguration(env(), company).mode).toBe("pending");
  });
  it("limita redirect e link del widget, senza URL arbitrari", () => {
    expect(saltReturnUrl(config.origin, "https://evil.test/", "nonce")).toContain("/azienda/impostazioni/integrazioni?");
    expect(saltReturnUrl(config.origin, "/azienda/tesoreria", "nonce")).toContain("se_state=nonce");
    for (const url of ["http://www.saltedge.com/connect", "https://www.saltedge.com.evil.test/", "https://attacker@www.saltedge.com/connect"])
      expect(() => saltWidgetUrl(url)).toThrow();
  });
  it("firma metodo, URL e corpo e non segue redirect HTTP con le chiavi", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"data":{"customer_id":"12"}}'));
    await new SaltEdgeClient(config, fetcher).request("/customers", "POST", { identifier: "synthetic" });
    const [url, options] = fetcher.mock.calls[0]; const h = new Headers(options!.headers);
    expect(options?.redirect).toBe("error"); expect(h.get("Secret")).toBe(config.secret);
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", await importSaltKey(publicPem, false), Buffer.from(h.get("Signature")!, "base64"), new TextEncoder().encode(`${h.get("Expires-at")}|POST|${url}|${options!.body}`))).toBe(true);
    await expect(new SaltEdgeClient(config, fetcher).request("/payments/create", "POST", {})).rejects.toThrow("InvalidApiPath");
  });
  it("non espone risposte bancarie o chiavi in caso di errore", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { class: "ClientPending", message: "private information" } }), { status: 406 }));
    await expect(new SaltEdgeClient(config, fetcher).request("/accounts")).rejects.toMatchObject({ code: "ClientPending", message: "ClientPending" });
  });
  it("segnala una chiave PEM non valida prima di chiamare il provider", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new SaltEdgeClient({ ...config, privateKey: "invalid-pem" }, fetcher).request("/customers")).rejects.toMatchObject({ code: "InvalidSigningKey" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("distingue un rifiuto HTML del provider senza esporne il corpo", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>private diagnostic</html>", { status: 403, headers: { "content-type": "text/html" } }));
    await expect(new SaltEdgeClient(config, fetcher).request("/connections/connect", "POST", {})).rejects.toMatchObject({ code: "UpstreamRequestRejected", message: "UpstreamRequestRejected" });
  });
  it("segue next_id, non next_page esterni, e rifiuta i cicli", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{"data":[{"id":"1"}],"meta":{"next_id":"2","next_page":"https://evil.test/"}}')).mockResolvedValueOnce(new Response('{"data":[{"id":"2"}]}'));
    expect(await new SaltEdgeClient(config, fetcher).list("/accounts?connection_id=1")).toHaveLength(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("&from_id=2");
    const cycle = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"data":[],"meta":{"next_id":"2"}}'));
    await expect(new SaltEdgeClient(config, cycle).list("/accounts")).rejects.toThrow("InvalidPagination");
  });
  it("mantiene gli ID grandi come stringhe, senza perdere precisione", () => {
    expect(saltId("9223372036854775807")).toBe("9223372036854775807");
    expect(() => saltId(9223372036854775807)).toThrow();
  });
  it("verifica notifiche RSA: firma, corpo, URL e versione", async () => {
    const raw = '{"data":{"connection_id":"1"}}', url = config.webhookBase + "/success";
    const signature = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await importSaltKey(config.privateKey, true), new TextEncoder().encode(`${url}|${raw}`))).toString("base64");
    expect(await verifySaltCallbackSignature(url, raw, signature, "6.0", publicPem)).toBe(true);
    expect(await verifySaltCallbackSignature(url, raw + " ", signature, "6.0", publicPem)).toBe(false);
    expect(await verifySaltCallbackSignature(url + "/other", raw, signature, "6.0", publicPem)).toBe(false);
    expect(await verifySaltCallbackSignature(url, raw, signature, "5.0", publicPem)).toBe(false);
    expect(await verifySaltCallbackSignature(url, raw, signature, "6.0", SALTEDGE_CALLBACK_KEY_V6)).toBe(false);
    expect(await importSaltKey(SALTEDGE_CALLBACK_KEY_V6, false)).toBeTruthy();
  });
  it("limita il corpo anche se manca Content-Length", async () => {
    await expect(saltBody(new Request("https://local.invalid/", { method: "POST", body: "x".repeat(66000) }))).rejects.toThrow("PayloadTooLarge");
  });
  it.each([-20, 0, 20])("conserva segno e importo %s e non sovrascrive riconciliazioni", amount => {
    const row = saltTransaction({ id: "9", account_id: "2", amount, currency_code: "EUR", made_on: "2026-10-27", status: "posted" }, "2", company, "account")!;
    expect(row.amount).toBe(amount); expect(row.transaction_type).toBe(amount < 0 ? "debit" : "credit");
    expect(row.external_transaction_id).toBe("se:2:9");
    for (const key of ["note", "category", "linked_invoice_id", "linked_cost_id"]) expect(row).not.toHaveProperty(key);
  });
  it("esclude pending e duplicati, blocca conti diversi e importi mancanti", () => {
    const tx = { id: "9", account_id: "2", amount: 10, currency_code: "EUR", made_on: "2026-10-27", status: "posted" };
    expect(saltTransaction({ ...tx, status: "pending" }, "2", company, "x")).toBeNull();
    expect(saltTransaction({ ...tx, duplicated: true }, "2", company, "x")).toBeNull();
    expect(() => saltTransaction(tx, "3", company, "x")).toThrow("InvalidTransaction");
    expect(() => saltTransaction({ ...tx, amount: NaN }, "2", company, "x")).toThrow("InvalidTransaction");
    expect(new SaltEdgeError("x").status).toBe(400);
  });
});
