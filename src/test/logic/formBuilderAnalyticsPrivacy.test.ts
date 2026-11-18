import { describe, expect, it } from "vitest";
import { buildLeadFormAutoResizeEmbedSnippet } from "@/lib/formBuilder";

function fixture(publicUrl = "https://app.ediliziaincloud.com/f/demo-form") {
  const callbacks: Record<string, (event: unknown) => void> = {};
  const domEvents: unknown[] = [];
  const iframe = { contentWindow: {}, style: {} as Record<string, string> };
  const mount = { innerHTML: "", appendChild: () => {}, dispatchEvent: (event: unknown) => domEvents.push(event) };
  const browser = {
    location: { search: "" },
    dataLayer: [] as Record<string, unknown>[],
    addEventListener: (name: string, callback: (event: unknown) => void) => { callbacks[name] = callback; },
  };
  const document = { getElementById: () => mount, createElement: () => iframe };
  class LocalEvent {
    constructor(public type: string, public init: unknown) {}
  }
  const snippet = buildLeadFormAutoResizeEmbedSnippet(publicUrl, { slug: "demo-form" });
  const script = snippet.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("Missing generated embed script");
  new Function("window", "document", "CustomEvent", "URL", "URLSearchParams", script)(browser, document, LocalEvent, URL, URLSearchParams);
  const data = {
    type: "eic-lead-form-submit", slug: "demo-form", form_id: "private-form-id", contact_id: "private-contact-id",
    email: "person@example.invalid", phone: "+39000000000", phone_e164: "+39000000000", first_name: "Example", last_name: "Person",
  };
  const send = (override: Record<string, unknown> = {}) => callbacks.message({ source: iframe.contentWindow, origin: "https://app.ediliziaincloud.com", data, ...override });
  return { browser, domEvents, iframe, data, send };
}

describe("iframe form analytics privacy", () => {
  it("emits only the fixed non-personal form identifier after the validated callback", () => {
    const f = fixture();
    expect(f.browser.dataLayer).toEqual([]);
    f.send();
    expect(f.browser.dataLayer).toEqual([{ event: "eic_form_submit", form_id: "eic_public_form" }]);
    expect(JSON.stringify(f.browser.dataLayer)).not.toMatch(/person@|000000000|private-|first_name|last_name|email|phone|contact_id|form_slug/);
    expect(f.domEvents).toHaveLength(1);
    expect((f.domEvents[0] as { init: { detail: unknown } }).init.detail).toBe(f.data);
  });

  it.each([
    { source: {} },
    { origin: "https://unexpected.example.invalid" },
    { data: { type: "eic-lead-form-submit", slug: "wrong-form" } },
    { data: { type: "not-a-submit", slug: "demo-form" } },
  ])("rejects a callback outside its source/origin/form contract: %o", override => {
    const f = fixture();
    f.send(override);
    expect(f.browser.dataLayer).toEqual([]);
    expect(f.domEvents).toEqual([]);
  });

  it("keeps resize notifications separate from analytics", () => {
    const f = fixture();
    f.send({ data: { type: "eic-lead-form-height", slug: "demo-form", height: 750 } });
    expect(f.iframe.style.height).toBe("766px");
    expect(f.browser.dataLayer).toEqual([]);
  });

  it("does not measure when the embed has no valid allowed origin", () => {
    const f = fixture("/f/demo-form");
    f.send();
    expect(f.browser.dataLayer).toEqual([]);
    // Preserve the existing operational callback without exposing it to Google.
    expect(f.domEvents).toHaveLength(1);
  });
});
