import { beforeEach, describe, expect, it, vi } from "vitest";
import { gmailCanModifyLabels, gmailMailboxAuthorizationUrl } from "../../../supabase/functions/_shared/gmailMailboxScopes";

const mock = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("../../../supabase/functions/_shared/outreachMailboxSend.ts", () => ({ getOauthAccessToken: mock.getToken }));
// Il modulo è eseguito davvero sotto Vitest, con il solo lettore token simulato.
// Il confine Deno rimane fuori dal programma TypeScript del frontend.
const { engageMailbox } = await vi.importActual<{
  engageMailbox: (admin: unknown, box: { email: string; provider: string; oauth_connection_id: string }, pool: string[]) => Promise<{
    recuperate: number; lette: number; skipped?: string;
  }>;
}>("../../../supabase/functions/_shared/outreachWarmupEngage.ts");

describe("Consenso Gmail limitato alla posta CRM", () => {
  it("mantiene client, callback e stato anche con caratteri riservati", () => {
    const redirect = "https://app.example/callback?origine=posta&tab=email";
    const state = "firmato+/=&";
    const url = new URL(gmailMailboxAuthorizationUrl("client-originale", redirect, state));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("client-originale");
    expect(url.searchParams.get("redirect_uri")).toBe(redirect);
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it.each([
    { scopes: null }, { scopes: undefined }, { scopes: [] as string[] },
    { scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"] },
  ])(
    "lettura e invio non autorizzano la modifica delle etichette (%j)", ({ scopes }) => {
      expect(gmailCanModifyLabels(scopes)).toBe(false);
    },
  );
});

describe("Warm-up: nessuna scrittura non autorizzata, grant esistenti preservati", () => {
  beforeEach(() => { vi.restoreAllMocks(); mock.getToken.mockReset(); });

  it("con il nuovo grant non chiama Gmail e non trasforma l'omissione in errore", async () => {
    mock.getToken.mockResolvedValue({ accessToken: "test", tokens: { scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"] } });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("non deve partire"));
    expect(await engageMailbox({}, { email: "a@example.test", provider: "gmail", oauth_connection_id: "existing-id" }, ["b@example.test"]))
      .toEqual({ recuperate: 0, lette: 0, skipped: "gmail_modify_not_granted" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["https://www.googleapis.com/auth/gmail.modify", "https://mail.google.com/"])(
    "il vecchio grant %s mantiene l'engagement senza riconnessione", async (scope) => {
      mock.getToken.mockResolvedValue({ accessToken: "test", tokens: { scopes: [scope] } });
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "spam-test" }] })))
        .mockResolvedValueOnce(new Response("{}"))
        .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "unread-test" }] })))
        .mockResolvedValueOnce(new Response("{}"));
      expect(await engageMailbox({}, { email: "a@example.test", provider: "gmail", oauth_connection_id: "existing-id" }, ["b@example.test"]))
        .toEqual({ recuperate: 1, lette: 1 });
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(fetchSpy.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ addLabelIds: ["INBOX"], removeLabelIds: ["SPAM"] }));
      expect(fetchSpy.mock.calls[3]?.[1]?.body).toBe(JSON.stringify({ addLabelIds: [], removeLabelIds: ["UNREAD"] }));
    },
  );
});
