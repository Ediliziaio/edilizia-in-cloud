import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, apiKeyPrefix, API_SCOPES } from "@/lib/platformApi";

describe("platformApi — chiavi", () => {
  it("genera chiavi nel formato eic_live_ + 40 alfanumerici", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^eic_live_[A-Za-z0-9]{40}$/);
  });

  it("genera chiavi diverse a ogni chiamata (entropia)", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey()));
    expect(keys.size).toBe(50);
  });

  it("hash SHA-256 esadecimale a 64 char, deterministico, identico al server", async () => {
    // Il server (platform-mcp) calcola sha256 hex sullo stesso input:
    // stessa stringa → stesso hash, così la chiave generata nel browser
    // viene riconosciuta dalla edge function.
    const h1 = await hashApiKey("eic_live_test");
    const h2 = await hashApiKey("eic_live_test");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    // Vettore noto (sha256 di "eic_live_test") per blindare l'algoritmo
    expect(h1).toBe("47aac617471407d9b9dc97347c70db562a57e9b9cf541d929d498be699c589a5");
  });

  it("prefisso = primi 8 char dopo eic_live_ (riconoscibile ma inutile da solo)", () => {
    const key = "eic_live_ABCDEFGH123456789";
    expect(apiKeyPrefix(key)).toBe("eic_live_ABCDEFGH");
  });

  it("catalogo scope: valori univoci nel formato risorsa:azione", () => {
    const values = API_SCOPES.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
    // Azioni ammesse: lettura/scrittura, invio email e il meta-scope «sensitive»
    // (azioni con invio reale o costo AI: actions:sensitive).
    for (const v of values) expect(v).toMatch(/^[a-z]+:(read|write|send|sensitive)$/);
  });
});
