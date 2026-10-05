import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Il lato che scrive: il punto in cui il provider risponde male chiama
 * `segnalaErroreAI`, e deve (1) registrare SOLO il credito/la chiave e non il
 * rumore, (2) non fare cento scritture per cento errori uguali, (3) svegliare
 * il canarino alla prima segnalazione, (4) non rompere MAI la chiamata AI e non
 * farla aspettare.
 */

const CORPO_402 = "OpenRouter 402: This request requires more credits, or fewer max_tokens. You requested up to 1800 tokens, but can only afford 76.";

type Chiamata = { url: string; init: RequestInit };

let chiamate: Chiamata[];
let inAttesa: Promise<unknown>[];
let rispostaRegistra: () => Response | Promise<Response>;

async function carica() {
  vi.resetModules(); // il limitatore è uno per modulo: ogni prova ne vuole uno nuovo
  return await import("../../../supabase/functions/_shared/allarmeAI");
}

const finisci = async () => {
  await Promise.all(inAttesa);
};

beforeEach(() => {
  chiamate = [];
  inAttesa = [];
  rispostaRegistra = () => new Response(JSON.stringify({ id: "a1", nuovo: true, da_notificare: true }), { status: 200 });
  const env: Record<string, string> = {
    SUPABASE_URL: "https://progetto.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    INTERNAL_CRON_SECRET: "segreto-cron",
  };
  (globalThis as Record<string, unknown>).Deno = { env: { get: (k: string) => env[k] } };
  (globalThis as Record<string, unknown>).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => inAttesa.push(p) };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    new Headers(init.headers as HeadersInit); // come il runtime: caratteri oltre Latin-1 nelle intestazioni lanciano
    chiamate.push({ url: String(url), init });
    if (String(url).includes("/rest/v1/rpc/ai_allarme_registra")) return await rispostaRegistra();
    return new Response("{}", { status: 200 });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).Deno;
  delete (globalThis as Record<string, unknown>).EdgeRuntime;
});

describe("Un 402 diventa un allarme registrato, senza far aspettare chi chiama", () => {
  it("registra provider, motivo, funzione, modello, azienda e il testo dell'errore", async () => {
    const { segnalaErroreAI } = await carica();
    segnalaErroreAI(CORPO_402, { funzione: "persona_silvio", modello: "anthropic/claude-sonnet-4.5", companyId: "11111111-1111-1111-1111-111111111111" });

    // torna subito: a questo punto non è ancora partito niente di asincrono completato
    await finisci();
    const registra = chiamate.find((c) => c.url.endsWith("/rest/v1/rpc/ai_allarme_registra"))!;
    expect(registra).toBeTruthy();
    expect(registra.init.method).toBe("POST");
    const h = registra.init.headers as Record<string, string>;
    expect(h.apikey).toBe("service-key");
    expect(h.Authorization).toBe("Bearer service-key");
    const corpo = JSON.parse(String(registra.init.body));
    expect(corpo).toMatchObject({
      p_provider: "openrouter",
      p_motivo: "credito_esaurito",
      p_funzione: "persona_silvio",
      p_modello: "anthropic/claude-sonnet-4.5",
      p_azienda: "11111111-1111-1111-1111-111111111111",
      p_conteggio: 1,
    });
    expect(corpo.p_dettaglio).toContain("402");
    expect(corpo.p_dettaglio).toContain("requires more credits");
  });

  it("un id azienda che non è un uuid non fa perdere la segnalazione: parte senza azienda", async () => {
    const { segnalaErroreAI } = await carica();
    segnalaErroreAI(CORPO_402, { funzione: "persona_silvio", companyId: "non-un-uuid" });
    await finisci();
    const registra = chiamate.find((c) => c.url.endsWith("/rest/v1/rpc/ai_allarme_registra"))!;
    expect(JSON.parse(String(registra.init.body)).p_azienda).toBeNull();
  });

  it("alla prima segnalazione sveglia il canarino col segreto dei cron e il modo credito-ai", async () => {
    const { segnalaErroreAI } = await carica();
    segnalaErroreAI(CORPO_402, { funzione: "persona_silvio" });
    await finisci();
    const sveglia = chiamate.find((c) => c.url === "https://progetto.supabase.co/functions/v1/ops-canarino")!;
    expect(sveglia).toBeTruthy();
    expect((sveglia.init.headers as Record<string, string>)["x-cron-secret"]).toBe("segreto-cron");
    expect(JSON.parse(String(sveglia.init.body))).toEqual({ modo: "credito-ai" });
  });

  it("se il database dice che non serve ancora (da_notificare: false), non sveglia nessuno", async () => {
    rispostaRegistra = () => new Response(JSON.stringify({ id: "a1", nuovo: false, da_notificare: false }), { status: 200 });
    const { segnalaErroreAI } = await carica();
    segnalaErroreAI(CORPO_402, {});
    await finisci();
    expect(chiamate.some((c) => c.url.includes("/functions/v1/ops-canarino"))).toBe(false);
  });

  it("senza INTERNAL_CRON_SECRET registra lo stesso e lascia il resto al cron dei 5 minuti", async () => {
    (globalThis as Record<string, unknown>).Deno = {
      env: { get: (k: string) => ({ SUPABASE_URL: "https://progetto.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" } as Record<string, string>)[k] },
    };
    const { segnalaErroreAI } = await carica();
    segnalaErroreAI(CORPO_402, {});
    await finisci();
    expect(chiamate.some((c) => c.url.includes("ai_allarme_registra"))).toBe(true);
    expect(chiamate.some((c) => c.url.includes("/functions/v1/ops-canarino"))).toBe(false);
  });
});

describe("Il rumore normale non scrive niente", () => {
  it("timeout, 429, 5xx, errori di rete e testi senza provider: nessuna chiamata", async () => {
    const { segnalaErroreAI } = await carica();
    for (const e of [
      "OpenRouter 429: rate limited",
      "OpenRouter 503: no provider",
      "OpenRouter timeout (>30s) — modello x non risponde",
      "OpenRouter network error: connection reset",
      "Error: 402 senza dire di chi",
      new Error("boom"),
      null,
      undefined,
    ]) segnalaErroreAI(e, { funzione: "x" });
    await finisci();
    expect(chiamate).toEqual([]);
  });
});

describe("Cento errori uguali non sono cento scritture", () => {
  it("il primo passa subito, gli altri si contano e partono insieme dopo la finestra", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-05T07:00:00.000Z"));
      const { segnalaErroreAI } = await carica();
      for (let i = 0; i < 50; i++) segnalaErroreAI(CORPO_402, { funzione: "persona_silvio" });
      await finisci();
      const registrazioni = () => chiamate.filter((c) => c.url.includes("ai_allarme_registra"));
      expect(registrazioni()).toHaveLength(1);
      expect(JSON.parse(String(registrazioni()[0].init.body)).p_conteggio).toBe(1);

      vi.setSystemTime(new Date("2026-10-05T07:00:25.000Z")); // oltre i 20 secondi
      segnalaErroreAI(CORPO_402, { funzione: "persona_silvio" });
      await finisci();
      expect(registrazioni()).toHaveLength(2);
      expect(JSON.parse(String(registrazioni()[1].init.body)).p_conteggio).toBe(50); // 49 trattenute + questa
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Non rompe MAI la chiamata AI", () => {
  it("se il database non risponde o risponde male, nessuna eccezione esce", async () => {
    rispostaRegistra = () => Promise.reject(new Error("db giù"));
    const { segnalaErroreAI } = await carica();
    expect(() => segnalaErroreAI(CORPO_402, { funzione: "x" })).not.toThrow();
    await finisci(); // la promessa in background non deve rifiutare
  });

  it("senza ambiente Deno (test, altri runtime) è un no-op", async () => {
    delete (globalThis as Record<string, unknown>).Deno;
    const { segnalaErroreAI } = await carica();
    expect(() => segnalaErroreAI(CORPO_402, {})).not.toThrow();
    await finisci();
    expect(chiamate).toEqual([]);
  });

  it("risposta 500 del database: si ignora, non si sveglia nessuno", async () => {
    rispostaRegistra = () => new Response("boom", { status: 500 });
    const { segnalaErroreAI } = await carica();
    segnalaErroreAI(CORPO_402, {});
    await finisci();
    expect(chiamate.some((c) => c.url.includes("/functions/v1/ops-canarino"))).toBe(false);
  });
});
