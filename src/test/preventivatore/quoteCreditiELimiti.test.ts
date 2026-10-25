/**
 * L'uso dell'AI dei preventivi spende i crediti dell'azienda: il saldo si controlla
 * PRIMA di spendere (anche per l'audio) e una raffica di richieste si ferma.
 *
 * Prima la trascrizione audio chiamava OpenAI e solo dopo addebitava: con il saldo a
 * zero l'addebito falliva, il testo veniva scartato e il costo restava alla piattaforma
 * a ogni tentativo. E nessun limite diceva quante richieste al minuto poteva mandare un
 * utente, o l'azienda intera.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../supabase/functions/_shared/headers.ts", () => ({
  jsonResponse: (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
}));
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({ checkPaymentMethod: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../../../supabase/functions/_shared/allarmeAI.ts", () => ({ segnalaErroreAI: vi.fn() }));
import {
  QUOTE_RATE_LIMITS,
  QUOTE_RATE_LIMIT_MESSAGE,
  checkQuoteRateLimit,
} from "../../../supabase/functions/_shared/quoteRateLimit.ts";
import {
  QUOTE_AUDIO_CREDIT_MESSAGE,
  QUOTE_AUDIO_MAX_SECONDS,
  companyCreditResponse,
  creditDecisionResponse,
  markupAudio,
  precheckCreditoAudio,
  stimaAddebitoAudioEur,
} from "../../../supabase/functions/_shared/quoteCreditGuard.ts";
import { QUOTE_FAILURES, classifyQuoteFailure } from "../../../supabase/functions/_shared/quoteFailure.ts";
import { AiCompanyCreditError, AiRouterError } from "../../../supabase/functions/_shared/aiRouter.ts";
import { classificaBloccoPagamento } from "../../lib/creditoEsaurito";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const UTENTE = "00000000-0000-4000-a000-000000000099";

type Chiamata = { name: string; args: Record<string, unknown> };

function dbRpc(rispondi: (c: Chiamata) => { data?: unknown; error?: { message: string } | null } | Promise<never>) {
  const chiamate: Chiamata[] = [];
  return {
    chiamate,
    db: {
      rpc: (name: string, args: Record<string, unknown>) => {
        const c = { name, args };
        chiamate.push(c);
        return Promise.resolve(rispondi(c) as never);
      },
    },
  };
}

function dbCredito(opts: { markup?: unknown; markupError?: boolean; precheck?: (a: Record<string, unknown>) => unknown } = {}) {
  const rpcs: Chiamata[] = [];
  const db = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      if (name === "precheck_ai_credit") {
        const r = opts.precheck?.(args);
        if (r instanceof Error) return Promise.reject(r);
        return Promise.resolve(r as never);
      }
      return Promise.resolve({ data: null });
    },
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "is", "eq", "in"]) q[m] = () => q;
      (q as { then: unknown }).then = (ok: (v: unknown) => unknown) =>
        Promise.resolve(opts.markupError ? { data: null, error: { message: "boom" } } : { data: opts.markup ?? [], error: null }).then(ok);
      return q;
    },
  };
  return { db, rpcs };
}

beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: (): string | undefined => undefined } });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("limite di richieste: chat e audio", () => {
  it("ogni richiesta pesa una volta in tre finestre: utente al minuto, utente in 10 minuti, azienda al minuto", async () => {
    const { db, chiamate } = dbRpc(() => ({ data: { allowed: true } }));
    expect(await checkQuoteRateLimit(db, "chat", AZIENDA, UTENTE)).toMatchObject({ allowed: true });
    expect(chiamate.map((c) => [c.args.p_function_name, c.args.p_caller_id, c.args.p_max_calls, c.args.p_window_seconds])).toEqual([
      ["quote-chat:1m", `user:${UTENTE}`, QUOTE_RATE_LIMITS.chat.utenteAlMinuto, 60],
      ["quote-chat:10m", `user:${UTENTE}`, QUOTE_RATE_LIMITS.chat.utenteIn10Minuti, 600],
      ["quote-chat:azienda", `company:${AZIENDA}`, QUOTE_RATE_LIMITS.chat.aziendaAlMinuto, 60],
    ]);
    expect(chiamate.every((c) => c.name === "check_ai_router_rate_limit")).toBe(true);
  });

  it("l'audio ha finestre separate dalla chat e più strette", async () => {
    const { db, chiamate } = dbRpc(() => ({ data: { allowed: true } }));
    await checkQuoteRateLimit(db, "audio", AZIENDA, UTENTE);
    expect(chiamate.map((c) => c.args.p_function_name)).toEqual(["quote-audio:1m", "quote-audio:10m", "quote-audio:azienda"]);
    expect(QUOTE_RATE_LIMITS.audio.utenteAlMinuto).toBeLessThan(QUOTE_RATE_LIMITS.chat.utenteAlMinuto);
    expect(QUOTE_RATE_LIMITS.audio.aziendaAlMinuto).toBeLessThan(QUOTE_RATE_LIMITS.chat.aziendaAlMinuto);
  });

  it("supera il limite: si ferma alla prima finestra piena e dice quanto aspettare", async () => {
    const { db, chiamate } = dbRpc((c) =>
      c.args.p_function_name === "quote-chat:1m" ? { data: { allowed: false, retry_after_seconds: 17.2 } } : { data: { allowed: true } },
    );
    expect(await checkQuoteRateLimit(db, "chat", AZIENDA, UTENTE)).toEqual({ allowed: false, retryAfterSeconds: 18 });
    expect(chiamate).toHaveLength(1);
  });

  it("senza indicazione dell'attesa si usa la finestra intera, mai meno di un secondo", async () => {
    const piena = dbRpc(() => ({ data: { allowed: false } }));
    expect(await checkQuoteRateLimit(piena.db, "audio", AZIENDA, UTENTE)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    const zero = dbRpc(() => ({ data: { allowed: false, retry_after_seconds: 0 } }));
    expect(await checkQuoteRateLimit(zero.db, "audio", AZIENDA, UTENTE)).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("l'azienda intera ha il suo tetto: un solo utente sotto soglia non basta se l'azienda è piena", async () => {
    const { db } = dbRpc((c) =>
      c.args.p_function_name === "quote-chat:azienda" ? { data: { allowed: false, retry_after_seconds: 5 } } : { data: { allowed: true } },
    );
    expect(await checkQuoteRateLimit(db, "chat", AZIENDA, UTENTE)).toEqual({ allowed: false, retryAfterSeconds: 5 });
  });

  it("se il conteggio non risponde la richiesta passa (il saldo si controlla comunque a parte)", async () => {
    const errore = dbRpc(() => ({ error: { message: "rete" } }));
    expect(await checkQuoteRateLimit(errore.db, "chat", AZIENDA, UTENTE)).toMatchObject({ allowed: true });
    const eccezione = { rpc: () => Promise.reject(new Error("giù")) };
    expect(await checkQuoteRateLimit(eccezione, "audio", AZIENDA, UTENTE)).toMatchObject({ allowed: true });
  });

  it("il messaggio per l'utente è in italiano e dice che non è stato addebitato nulla", () => {
    expect(QUOTE_RATE_LIMIT_MESSAGE).toMatch(/nessun addebito/i);
    expect(QUOTE_RATE_LIMIT_MESSAGE).not.toMatch(/rate limit|too many/i);
  });
});

/** Simula il conteggio atomico del database: finestre a scorrimento per (nome, chiamante). */
function contatoreFinto() {
  const registro = new Map<string, number>();
  return {
    rpc: (_nome: string, a: Record<string, unknown>) => {
      const chiave = `${a.p_function_name}|${a.p_caller_id}`;
      const n = (registro.get(chiave) ?? 0) + 1;
      const max = Number(a.p_max_calls);
      if (n > max) return Promise.resolve({ data: { allowed: false, retry_after_seconds: Number(a.p_window_seconds) } });
      registro.set(chiave, n);
      return Promise.resolve({ data: { allowed: true } });
    },
  };
}

describe("simulazioni: raffiche contro il limite", () => {
  it("un utente che martella la chat: passano 20 richieste, dalla 21ª in poi 429", async () => {
    const db = contatoreFinto();
    const esiti: boolean[] = [];
    for (let i = 0; i < 30; i++) esiti.push((await checkQuoteRateLimit(db, "chat", AZIENDA, UTENTE)).allowed);
    expect(esiti.filter(Boolean)).toHaveLength(20);
    expect(esiti.slice(0, 20).every(Boolean)).toBe(true);
    expect(esiti.slice(20).some(Boolean)).toBe(false);
  });

  it("un utente che martella l'audio: passano 6 trascrizioni, poi basta", async () => {
    const db = contatoreFinto();
    let passate = 0;
    for (let i = 0; i < 12; i++) if ((await checkQuoteRateLimit(db, "audio", AZIENDA, UTENTE)).allowed) passate++;
    expect(passate).toBe(QUOTE_RATE_LIMITS.audio.utenteAlMinuto);
  });

  it("l'audio non consuma il limite della chat, e viceversa", async () => {
    const db = contatoreFinto();
    for (let i = 0; i < 6; i++) await checkQuoteRateLimit(db, "audio", AZIENDA, UTENTE);
    expect((await checkQuoteRateLimit(db, "audio", AZIENDA, UTENTE)).allowed).toBe(false);
    expect((await checkQuoteRateLimit(db, "chat", AZIENDA, UTENTE)).allowed).toBe(true);
  });

  it("cinque colleghi sotto soglia ciascuno: l'azienda si ferma al tetto comune (60 chat al minuto)", async () => {
    const db = contatoreFinto();
    let passate = 0;
    for (let giro = 0; giro < 20; giro++) {
      for (let u = 0; u < 5; u++) {
        if ((await checkQuoteRateLimit(db, "chat", AZIENDA, `${UTENTE}-${u}`)).allowed) passate++;
      }
    }
    expect(passate).toBeLessThanOrEqual(QUOTE_RATE_LIMITS.chat.aziendaAlMinuto);
    expect(passate).toBeGreaterThan(40);
  });

  it("un'altra azienda non risente della raffica", async () => {
    const db = contatoreFinto();
    for (let i = 0; i < 70; i++) await checkQuoteRateLimit(db, "chat", AZIENDA, UTENTE);
    expect((await checkQuoteRateLimit(db, "chat", "altra-azienda", "altro-utente")).allowed).toBe(true);
  });
});

describe("simulazioni: il saldo finisce a metà conversazione", () => {
  it("le prime trascrizioni passano, quando il saldo scende sotto la soglia si ferma tutto senza partire", async () => {
    let saldo = 0.12;
    const { db } = dbCredito({
      markup: [{ task_kind: "default", markup_multiplier: 3 }],
      precheck: (a) => ({ data: { ok: saldo >= Number(a.p_estimated_cost_eur) * 1.5 } }),
    });
    const stima = await stimaAddebitoAudioEur(db);
    const esiti: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const d = await precheckCreditoAudio(db, AZIENDA);
      esiti.push(d.ok);
      if (d.ok) saldo -= stima; // l'addebito reale di una trascrizione
    }
    expect(esiti[0]).toBe(true);
    expect(esiti.includes(false)).toBe(true);
    // Dopo il primo rifiuto non si torna a passare senza una ricarica.
    const primo = esiti.indexOf(false);
    expect(esiti.slice(primo).every((x) => !x)).toBe(true);
    saldo += 10; // ricarica
    expect((await precheckCreditoAudio(db, AZIENDA)).ok).toBe(true);
  });
});

describe("saldo dell'azienda prima della trascrizione audio", () => {
  it("la stima è il costo massimo di una trascrizione × cambio × markup del compito", async () => {
    vi.stubGlobal("Deno", { env: { get: (): string | undefined => undefined } });
    const { db } = dbCredito({ markup: [{ task_kind: "audio_transcription", markup_multiplier: "2.5" }, { task_kind: "default", markup_multiplier: 3 }] });
    // 125 s a 0,006 $/min = 0,0125 $ → × 0,92 × 2,5
    expect(await stimaAddebitoAudioEur(db)).toBeCloseTo(0.0125 * 0.92 * 2.5, 4);
  });

  it("il markup: quello del compito, poi il predefinito, poi il più alto in uso se la tabella non si legge", async () => {
    expect(await markupAudio(dbCredito({ markup: [{ task_kind: "default", markup_multiplier: 2 }] }).db)).toBe(2);
    expect(await markupAudio(dbCredito({ markup: [] }).db)).toBe(3);
    expect(await markupAudio(dbCredito({ markupError: true }).db)).toBe(3);
    expect(await markupAudio(dbCredito({ markup: [{ task_kind: "audio_transcription", markup_multiplier: "abc" }] }).db)).toBe(3);
  });

  it("il cambio e la tariffa si leggono dall'ambiente; un cambio non valido ricade su 0,92", async () => {
    vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "AI_FX_USD_EUR" ? "non-un-numero" : undefined) } });
    const { db } = dbCredito({ markup: [{ task_kind: "default", markup_multiplier: 1 }] });
    expect(await stimaAddebitoAudioEur(db)).toBeCloseTo(0.0125 * 0.92, 4);
    expect(QUOTE_AUDIO_MAX_SECONDS).toBe(125);
  });

  it("saldo sufficiente: si può trascrivere, e il controllo usa la stima e l'azienda giusta", async () => {
    const { db, rpcs } = dbCredito({ markup: [{ task_kind: "default", markup_multiplier: 3 }], precheck: () => ({ data: { ok: true } }) });
    const d = await precheckCreditoAudio(db, AZIENDA);
    expect(d.ok).toBe(true);
    const p = rpcs.find((r) => r.name === "precheck_ai_credit")!;
    expect(p.args.p_company_id).toBe(AZIENDA);
    expect(p.args.p_estimated_cost_eur).toBe(d.estimatedBilledEur);
    expect(d.estimatedBilledEur).toBeGreaterThan(0);
  });

  it("saldo insufficiente: niente audio inviato, 402 che la finestra di ricarica riconosce", async () => {
    const { db } = dbCredito({ precheck: () => ({ data: { ok: false, reason: "balance_too_low" } }) });
    const d = await precheckCreditoAudio(db, AZIENDA);
    expect(d).toMatchObject({ ok: false, kind: "credit", reason: "balance_too_low", message: QUOTE_AUDIO_CREDIT_MESSAGE });
    if (d.ok) throw new Error("atteso rifiuto");
    const risposta = creditDecisionResponse(d, { "x-test": "1" });
    expect(risposta.status).toBe(402);
    const corpo = await risposta.json();
    expect(corpo).toMatchObject({ code: "AI_COMPANY_CREDIT", wallet: "ai", reason: "balance_too_low" });
    // La stessa finestra di ricarica che si apre per la chat si apre per l'audio.
    expect(classificaBloccoPagamento(402, corpo)).not.toBeNull();
  });

  it("controllo che non risponde: è un nostro guasto (503), NON una richiesta di ricarica, e nulla parte", async () => {
    const errore = dbCredito({ precheck: () => ({ error: { message: "db giù" } }) });
    const d = await precheckCreditoAudio(errore.db, AZIENDA);
    expect(d).toMatchObject({ ok: false, kind: "unavailable", reason: "precheck_error" });
    if (d.ok) throw new Error("atteso rifiuto");
    const r = creditDecisionResponse(d, {});
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("AI_CREDIT_CHECK_UNAVAILABLE");

    const eccezione = dbCredito({ precheck: () => new Error("timeout") });
    expect(await precheckCreditoAudio(eccezione.db, AZIENDA)).toMatchObject({ ok: false, kind: "unavailable", reason: "precheck_exception" });
  });

  it("se è acceso l'interruttore dei guasti, il controllo che non risponde lascia passare (come il router)", async () => {
    vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "AI_ROUTER_ALLOW_PRECHECK_FAIL_OPEN" ? "true" : undefined) } });
    const d = await precheckCreditoAudio(dbCredito({ precheck: () => ({ error: { message: "x" } }) }).db, AZIENDA);
    expect(d.ok).toBe(true);
  });
});

describe("402 dei crediti: forma e classificazione", () => {
  it("companyCreditResponse porta codice, wallet e messaggio chiari", async () => {
    const r = companyCreditResponse(QUOTE_FAILURES.AI_COMPANY_CREDIT, { "x-test": "1" });
    expect(r.status).toBe(402);
    expect(r.headers.get("x-test")).toBe("1");
    expect(await r.json()).toMatchObject({ code: "AI_COMPANY_CREDIT", wallet: "ai", error: QUOTE_FAILURES.AI_COMPANY_CREDIT });
  });

  it("il messaggio dice bozza intatta, nessun addebito, ricarica", () => {
    expect(QUOTE_FAILURES.AI_COMPANY_CREDIT).toMatch(/crediti AI/);
    expect(QUOTE_FAILURES.AI_COMPANY_CREDIT).toMatch(/Bozza intatta/);
    expect(QUOTE_FAILURES.AI_COMPANY_CREDIT).toMatch(/nessun addebito/i);
    expect(QUOTE_FAILURES.AI_COMPANY_CREDIT).toMatch(/[Rr]icarica/);
  });

  it("un saldo insufficiente nel router diventa AI_COMPANY_CREDIT; un guasto del router no", () => {
    const credito = classifyQuoteFailure(new AiCompanyCreditError("Credito insufficiente o bloccato: x", "quote_chat", "balance_too_low"));
    expect(credito.code).toBe("AI_COMPANY_CREDIT");
    expect(credito.message).toBe(QUOTE_FAILURES.AI_COMPANY_CREDIT);
    const guasto = classifyQuoteFailure(new AiRouterError("Credito insufficiente o bloccato: precheck_error", "quote_chat", []));
    expect(guasto.code).not.toBe("AI_COMPANY_CREDIT");
  });
});

describe("l'ordine delle guardie nella funzione", () => {
  const sorgente = readFileSync("supabase/functions/ai-preventivo-conversazione/index.ts", "utf8");

  it("audio: limite di richieste, poi saldo, poi trascrizione (mai la trascrizione prima del saldo)", () => {
    const rate = sorgente.indexOf("checkQuoteRateLimit(db, 'audio'");
    const saldo = sorgente.indexOf("precheckCreditoAudio(");
    const trascrizione = sorgente.indexOf("transcribeQuoteAudio(");
    expect(rate).toBeGreaterThan(-1);
    expect(saldo).toBeGreaterThan(rate);
    expect(trascrizione).toBeGreaterThan(saldo);
  });

  it("chat: il limite di richieste si controlla dopo il pagamento e prima di chiamare il modello", () => {
    const rate = sorgente.indexOf("checkQuoteRateLimit(db, 'chat'");
    expect(rate).toBeGreaterThan(sorgente.indexOf("gateAiPayment"));
    expect(rate).toBeGreaterThan(-1);
  });

  it("il 402 dei crediti esce dal catch con la stessa risposta della finestra di ricarica", () => {
    expect(sorgente).toContain("AI_COMPANY_CREDIT");
    expect(sorgente).toContain("companyCreditResponse(");
  });
});
