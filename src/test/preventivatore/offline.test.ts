import { describe, expect, it } from "vitest";
import { Socket } from "node:net";

describe.runIf(import.meta.env.VITE_PREVENTIVATORE_OFFLINE === "true")("isolamento delle prove del preventivatore", () => {
  it("non eredita l'azienda o il servizio reale", () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe("test-publishable-key");
  });
  it("blocca fetch, socket, WebSocket e XHR prima di inviare", () => {
    expect(() => fetch("https://example.invalid")).toThrow("offline");
    expect(() => new Socket().connect(443, "example.invalid")).toThrow("offline");
    expect(() => new WebSocket("wss://example.invalid")).toThrow("offline");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://example.invalid");
    expect(() => xhr.send("test")).toThrow("offline");
  });
});
