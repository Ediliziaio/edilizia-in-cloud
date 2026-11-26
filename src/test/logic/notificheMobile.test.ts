import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { percorsoNotifica, percorsoPushNativa } from "@/lib/notifiche/percorsoNotifica";
import { preparaInvioNativo, pushNativeConfigurate } from "../../../supabase/functions/_shared/pushNativa";

const origine = "https://app.ediliziaincloud.com";
const pagamento = "/azienda/scadenzario?tab=uscite#rate";

describe("Apertura degli avvisi", () => {
  it("conserva parametri e destinazione anche dalla push del telefono", () => {
    expect(percorsoNotifica(pagamento, origine)).toBe(pagamento);
    expect(percorsoPushNativa({ user_id: "u1", url: origine + pagamento }, "https://localhost", "u1")).toBe(pagamento);
    expect(percorsoPushNativa({ route: "/campo/invii" }, "https://localhost", "u1")).toBe("/campo/invii");
    expect(percorsoPushNativa({ user_id: "u2", url: pagamento }, "https://localhost", "u1")).toBeNull();
  });

  it("apre i percorsi interni anche con lo schema locale di iOS, senza accettare altre origini", () => {
    expect(percorsoPushNativa({ user_id: "u1", url: pagamento }, "capacitor://localhost", "u1")).toBe(pagamento);
    expect(percorsoNotifica("/campo/documenti", "capacitor://localhost", true)).toBe("/campo/documenti");
    expect(percorsoPushNativa({ user_id: "u1", url: "https://altro.example/documenti" }, "capacitor://localhost", "u1")).toBeNull();
  });

  it.each(["//host.test/avviso", "https://host.test/avviso", origine + "//host.test/avviso", "/\\host.test", "javascript:alert(1)"])(
    "scarta una destinazione fuori applicazione (%s)", url => {
      expect(percorsoNotifica(url, origine)).toBeNull();
      expect(percorsoPushNativa({ url, user_id: "u1" }, "https://localhost", "u1")).toBeNull();
    },
  );
});

describe("Invio nativo per sistema operativo", () => {
  it("su iOS usa APNs con un contenuto neutro e il riferimento all’utente", async () => {
    const coppia = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const valori: Record<string, string> = {
      APNS_TEAM_ID: "TEAMPROVA", APNS_KEY_ID: "KEYPROVA",
      APNS_PRIVATE_KEY: coppia.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      APNS_ENVIRONMENT: "sandbox",
    };
    const richiesta = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 410 }));
    expect(pushNativeConfigurate(k => valori[k])).toEqual({ android: false, ios: true });
    const invia = await preparaInvioNativo("ios", k => valori[k], richiesta);
    const token = { id: "t1", user_id: "u1", token: "a".repeat(64), platform: "ios" };
    await expect(invia!(token, { url: pagamento, tag: "pagamenti" })).resolves.toBe("inviata");
    await expect(invia!(token, { url: pagamento })).resolves.toBe("scaduta");
    const [url, init] = richiesta.mock.calls[0];
    expect(url).toBe("https://api.sandbox.push.apple.com/3/device/" + token.token);
    expect(new Headers(init?.headers).get("apns-topic")).toBe("com.ediliziaincloud.app");
    expect(JSON.parse(String(init?.body))).toMatchObject({ user_id: "u1", url: pagamento, aps: { alert: {
      title: "Edilizia in Cloud", body: "Hai una nuova notifica.",
    } } });
  });

  it("su Android usa FCM e distingue un token revocato da un errore temporaneo", async () => {
    const coppia = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const env = (k: string) => k === "FCM_SERVICE_ACCOUNT_JSON" ? JSON.stringify({
      project_id: "progetto-demo", client_email: "fcm@example.invalid",
      private_key: coppia.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    }) : undefined;
    const richiesta = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "mock" }))
      .mockResolvedValueOnce(Response.json({ error: { details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const invia = await preparaInvioNativo("android", env, richiesta);
    const token = { id: "t2", user_id: "u2", token: "token-fcm", platform: "android" };
    await expect(invia!(token, { url: "//esterno.test" })).resolves.toBe("scaduta");
    await expect(invia!(token, { url: pagamento })).resolves.toBe("errore");
    const [url, init] = richiesta.mock.calls[1];
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/progetto-demo/messages:send");
    expect(JSON.parse(String(init?.body))).toMatchObject({ message: { data: { user_id: "u2", url: "/" } } });
  });
});
