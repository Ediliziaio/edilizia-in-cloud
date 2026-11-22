import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalAssistanceClient } from "@/lib/localAssistanceClient";
afterEach(() => vi.unstubAllGlobals());
describe("isolated local assistance client", () => {
  it("uses only the fixed same-origin local API and its local nonce", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          mode: "local",
          productionConnected: false,
          token: "local-nonce",
          customers: [],
          scenarios: [],
          calendars: [],
          sessions: [],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ mode: "local", productionConnected: false }),
      );
    vi.stubGlobal("fetch", send);
    const client = createLocalAssistanceClient();
    await client.bootstrap();
    await client.start({
      requestId: crypto.randomUUID(),
      customerId: "fixture",
      calendarId: "fixture",
      scenario: "new",
    });
    expect(send.mock.calls[0][0]).toBe("/__local-assistance/bootstrap");
    expect(send.mock.calls[1][0]).toBe("/__local-assistance/sessions");
    expect(send.mock.calls[1][1].headers).toMatchObject({
      "X-Local-Assistance-Token": "local-nonce",
    });
    expect(send.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
  });
  it("rejects a response that is not explicitly isolated and never follows a supplied host", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            mode: "production",
            productionConnected: true,
            token: "x",
          }),
        ),
    );
    await expect(createLocalAssistanceClient().bootstrap()).rejects.toThrow(
      "non appartiene al collaudo locale",
    );
    expect(() =>
      createLocalAssistanceClient().snapshot("https://example.com"),
    ).toThrow("non valido");
  });
});
