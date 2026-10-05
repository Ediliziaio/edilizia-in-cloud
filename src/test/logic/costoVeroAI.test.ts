import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOpenRouter } from "../../../supabase/functions/_shared/ai-provider/openrouter";
import { claudeMessagesBilled } from "../../../supabase/functions/_shared/claudeProxy";

/**
 * Il costo VERO di ogni chiamata a OpenRouter (05/10/2026).
 *
 * Il codice cercava l'header `x-or-cost`, che nei dati non arriva mai: lo strato
 * ai-provider scriveva una stima fissa di 1,5/6 $ per milione di token per
 * qualsiasi modello (Sonnet 4 dimezzato, Haiku +63%) e la chiamava «non stimata»;
 * i render passati da OpenRouter finivano al prezzo di config (0,039 €) mentre la
 * fattura di GPT-5 Image era di circa 0,4 $ a immagine. Il costo vero sta nel
 * corpo (`usage.cost`), ma OpenRouter lo manda solo se lo si chiede con
 * `usage: { include: true }`.
 */

type Chiamata = { url: string; init: RequestInit };
let chiamate: Chiamata[];

const risposta = (corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json", ...headers } });

function stubFetch(risponde: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    new Headers(init.headers as HeadersInit); // come il runtime: caratteri oltre Latin-1 nelle intestazioni lanciano
    chiamate.push({ url: String(url), init });
    return risponde();
  }));
}

const corpoInviato = (i = 0) => JSON.parse(String(chiamate[i].init.body));

beforeEach(() => {
  chiamate = [];
  const env: Record<string, string> = { OPENROUTER_API_KEY: "sk-test" };
  (globalThis as Record<string, unknown>).Deno = { env: { get: (k: string) => env[k] } };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).Deno;
});

const PARAMETRI = { model: "anthropic/claude-sonnet-4", messages: [{ role: "user", content: "ciao" }], max_tokens: 100 };
const META: { task_kind: string; company_id?: string | null } = { task_kind: "bot_operativo_titolare", company_id: null };

describe("ai-provider: il costo che si registra è quello vero", () => {
  it("chiede a OpenRouter il costo (usage: include) senza perdere i parametri della richiesta", async () => {
    stubFetch(() => risposta({ id: "gen-1", model: PARAMETRI.model, choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.0001 } }));
    await callOpenRouter(PARAMETRI, META);
    expect(corpoInviato()).toMatchObject({ ...PARAMETRI, usage: { include: true } });
  });

  it("usa usage.cost del corpo: costo vero, non stimato, con l'id della generazione", async () => {
    stubFetch(() => risposta({ id: "gen-abc", model: PARAMETRI.model, choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 26_536, completion_tokens: 300, cost: 0.0841 } }));
    const r = await callOpenRouter(PARAMETRI, META);
    expect(r.cost_usd).toBeCloseTo(0.0841, 6);
    expect(r.cost_is_estimated).toBe(false);
    expect(r.generation_id).toBe("gen-abc");
  });

  it("il caso del bot titolare: 26.536 token a Sonnet 4 costano il doppio della stima fissa", async () => {
    // stima fissa 1,5/6 $ per milione: (26536×1,5 + 300×6)/1e6 = 0,0416 $; il costo vero a 3/15 è 0,0841 $
    stubFetch(() => risposta({ id: "g", model: PARAMETRI.model, choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 26_536, completion_tokens: 300, cost: 0.0841 } }));
    const r = await callOpenRouter(PARAMETRI, META);
    const stimaFissa = (26_536 * 1.5 + 300 * 6) / 1e6;
    expect(r.cost_usd / stimaFissa).toBeGreaterThan(1.9);
  });

  it("un costo vero pari a zero (modello gratuito) è vero, non una stima", async () => {
    stubFetch(() => risposta({ id: "g", model: PARAMETRI.model, choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 5, completion_tokens: 5, cost: 0 } }));
    const r = await callOpenRouter(PARAMETRI, META);
    expect(r.cost_usd).toBe(0);
    expect(r.cost_is_estimated).toBe(false);
  });

  it("se il corpo non porta il costo ma c'è l'header x-or-cost, vince l'header", async () => {
    stubFetch(() => risposta({ id: "g", model: PARAMETRI.model, choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 5, completion_tokens: 5 } }, { "x-or-cost": "0.5" }));
    const r = await callOpenRouter(PARAMETRI, META);
    expect(r.cost_usd).toBe(0.5);
    expect(r.cost_is_estimated).toBe(false);
  });

  it("senza nessuno dei due si ricade sulla stima fissa, e lo dichiara", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(() => risposta({ id: "g", model: PARAMETRI.model, choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1000, completion_tokens: 500 } }));
    const r = await callOpenRouter(PARAMETRI, META);
    expect(r.cost_usd).toBeCloseTo((1000 * 1.5 + 500 * 6) / 1e6, 8);
    expect(r.cost_is_estimated).toBe(true);
  });
});

describe("claudeProxy: il triage email e gli altri registrano il costo vero", () => {
  const RISPOSTA_OR = (cost?: number) => ({
    id: "gen-xyz",
    model: "anthropic/claude-haiku-4.5",
    choices: [{ message: { content: "riassunto" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 3000, completion_tokens: 200, ...(cost == null ? {} : { cost }) },
  });
  const BODY = { model: "claude-haiku-4-5", max_tokens: 500, messages: [{ role: "user" as const, content: "ciao" }] };

  function clienteFinto() {
    const righe: Array<Record<string, unknown>> = [];
    return {
      righe,
      // deno-lint-ignore no-explicit-any
      client: { from: () => ({ insert: async (r: Record<string, unknown>): Promise<{ error: null }> => { righe.push(r); return { error: null }; } }) } as any,
    };
  }

  it("chiede il costo a OpenRouter e scrive nel registro quello vero, con l'id della generazione", async () => {
    stubFetch(() => risposta(RISPOSTA_OR(0.00123)));
    const { client, righe } = clienteFinto();
    const r = await claudeMessagesBilled(BODY, { supabase: client, companyId: null, taskKind: "email_ai_l3_batch" });
    expect(corpoInviato().usage).toEqual({ include: true });
    expect(righe).toHaveLength(1);
    expect(righe[0].cost_usd).toBeCloseTo(0.00123, 8);
    expect(righe[0].cost_is_estimated).toBe(false);
    expect((righe[0].metadata as Record<string, unknown>).generation_id).toBe("gen-xyz");
    // la risposta resta nella forma Anthropic
    const json = await r.json() as { content: Array<{ text: string }>; usage: { input_tokens: number } };
    expect(json.content[0].text).toBe("riassunto");
    expect(json.usage.input_tokens).toBe(3000);
  });

  it("il triage L3 su Haiku non è più scritto a tariffa Sonnet (0,42 $ registrati contro 0,14 veri)", async () => {
    // 3000 token in e 200 out a tariffa Sonnet 3/15 = 0,012 $; il costo vero di Haiku (1/5) è 0,004 $
    stubFetch(() => risposta(RISPOSTA_OR(0.004)));
    const { client, righe } = clienteFinto();
    await claudeMessagesBilled(BODY, { supabase: client, companyId: null, taskKind: "email_ai_l3_batch" });
    expect(Number(righe[0].cost_usd)).toBeCloseTo(0.004, 8);
    expect(Number(righe[0].cost_usd)).toBeLessThan((3000 * 3 + 200 * 15) / 1e6);
  });

  it("se OpenRouter non manda il costo si stima per modello, e il registro dice che è una stima", async () => {
    stubFetch(() => risposta(RISPOSTA_OR()));
    const { client, righe } = clienteFinto();
    await claudeMessagesBilled(BODY, { supabase: client, companyId: null, taskKind: "email_ai_l3_batch" });
    expect(Number(righe[0].cost_usd)).toBeCloseTo((3000 * 3 + 200 * 15) / 1e6, 8);
    expect(righe[0].cost_is_estimated).toBe(true);
  });
});

// image.ts legge Deno.env quando viene caricato: va importato dopo che lo stub di Deno c'è (beforeEach).
const caricaImmagini = async () => await import("../../../supabase/functions/_shared/ai-provider/image");

describe("render: il costo vero di un'immagine passata da OpenRouter", () => {
  const IMMAGINE = (cost?: number) => ({
    id: "gen-img-1",
    choices: [{ message: { content: "", images: [{ image_url: { url: "data:image/png;base64,AAAA" } }] } }],
    ...(cost == null ? {} : { usage: { cost } }),
  });
  const PARAMS = { prompt: "una piscina", size: "1024x1024", metadata: { task_kind: "creativita", company_id: null as string | null } };

  it("chiede il costo a OpenRouter e lo passa al calcolo del render", async () => {
    stubFetch(() => risposta(IMMAGINE(0.4213)));
    const { generateImage } = await caricaImmagini();
    const r = await generateImage(PARAMS);
    expect(corpoInviato().usage).toEqual({ include: true });
    expect(r.providerUsed).toBe("openrouter");
    expect(r.costUsd).toBeCloseTo(0.4213, 6);
    expect(r.costIsEstimated).toBe(false);
  });

  it("senza costo nella risposta lascia undefined: a decidere è il listino, non un numero inventato", async () => {
    stubFetch(() => risposta(IMMAGINE()));
    const { generateImage } = await caricaImmagini();
    const r = await generateImage(PARAMS);
    expect(r.costUsd).toBeUndefined();
    expect(r.costIsEstimated).toBe(true);
  });
});

describe("Il registro del router porta l'id della generazione, per unirlo all'export di OpenRouter", () => {
  const sorgente = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

  it("la riga del libro mastro scrive generation_id", () => {
    expect(sorgente("supabase/functions/_shared/aiRouter.ts")).toContain("generation_id: (data as { id?: string })?.id ?? null");
  });

  it("ai-provider lo passa a chi registra", () => {
    expect(sorgente("supabase/functions/_shared/ai-provider/index.ts")).toContain("generation_id: result.generation_id ?? null");
  });
});

describe("La migrazione del listino: GPT-5 Image su OpenRouter", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281005224700_render_prezzo_gpt5_image_openrouter.sql"), "utf8");

  it("inserisce la riga mancante per (openrouter_image, openai/gpt-5-image) e non ne duplica una attiva", () => {
    expect(sql).toMatch(/'openrouter_image', 'openai\/gpt-5-image', 'per_image'/);
    expect(sql).toMatch(/where not exists \([\s\S]*effective_to is null/i);
  });

  it("il ripiego è un prezzo realistico (circa 0,4 €), non i 0,039 € di config", () => {
    const m = sql.match(/'per_image', 0, 0, ([\d.]+), 0, ([\d.]+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThan(0.3);
    expect(Number(m![2])).toBeGreaterThan(0.3);
  });

  it("non tocca il prezzo ai clienti (render_provider_config)", () => {
    expect(sql).not.toMatch(/update\s+public\.render_provider_config/i);
    expect(sql).not.toMatch(/cost_billed_per_render\s*=/i);
  });
});
