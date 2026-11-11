import { describe, expect, it, vi } from "vitest";
import { appleCalDavFetch } from "../../../supabase/functions/_shared/appleCalDavFetch";

describe("Apple CalDAV: protezione delle credenziali", () => {
  const init = { method: "PROPFIND", headers: { Authorization: "Basic synthetic-test-value" } };
  it.each(["https://evil.example/event.ics", "https://icloud.com.evil.example/", "http://caldav.icloud.com/", "https://caldav.icloud.com:8443/", "https://user:pass@caldav.icloud.com/", "http://127.0.0.1/"])("non inoltra credenziali a %s", async url => {
    const network = vi.fn();
    await expect(appleCalDavFetch(url, init, network)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
  it("segue il redirect iCloud legittimo, validando anche il nuovo host", async () => {
    const network = vi.fn().mockResolvedValueOnce(new Response(null, { status: 301, headers: { Location: "https://p42-caldav.icloud.com/principal/" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 207 }));
    expect((await appleCalDavFetch("https://caldav.icloud.com/.well-known/caldav", init, network)).status).toBe(207);
    expect(network).toHaveBeenLastCalledWith("https://p42-caldav.icloud.com/principal/", expect.objectContaining({ redirect: "manual", headers: init.headers }));
  });
  it("blocca un redirect esterno senza fare la seconda richiesta", async () => {
    const network = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://evil.example/" } }));
    await expect(appleCalDavFetch("https://caldav.icloud.com/", init, network)).rejects.toThrow("non valido");
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("interrompe i redirect ciclici", async () => {
    const network = vi.fn().mockResolvedValue(new Response(null, { status: 307, headers: { Location: "/again" } }));
    await expect(appleCalDavFetch("https://caldav.icloud.com/", init, network)).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(4);
  });
});
