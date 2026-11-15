/**
 * Addebito AI — censimento del 15/11/2026 (docs/ai-addebiti-censimento.md).
 *
 * Provider e database FINTI: nessuna chiamata a pagamento, nessun credito toccato.
 * Ogni caso corrisponde a una regola del censimento:
 *   - una chiamata al provider = un addebito (anche con la stessa chiave del lavoro);
 *   - la stessa generazione non si addebita due volte;
 *   - credito finito = nessuna chiamata al provider;
 *   - senza azienda = costo della piattaforma, registrato;
 *   - strada diretta: chiave, replay, consumo non addebitato ma registrato;
 *   - unità non a token (video): controllo prima, addebito con la chiave del job;
 *   - lavori in background e isolamento fra aziende.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({ checkPaymentMethod: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../../../supabase/functions/_shared/allarmeAI.ts", () => ({ segnalaErroreAI: vi.fn() }));
import { aiRouterComplete, chiaveAddebitoChiamataRipetuta } from "../../../supabase/functions/_shared/aiRouter";
import { chargeAndLogDirect, chiaveAddebitoDiretto } from "../../../supabase/functions/_shared/ai-provider/directApi";
import { addebitaUnitario, controllaCreditoUnitario } from "../../../supabase/functions/_shared/addebitoAiUnitario";
import { esitoDaRisultatoRouter, registraEsitoLavoroAi } from "../../../supabase/functions/_shared/esitoLavoroAi";

type Args = Record<string, unknown>;
const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

/** Registro finto con la stessa regola di charge_ai_call: chiave unica, pavimento 3× il costo. */
function dbFinto(opzioni: { creditoNegato?: boolean; saldoEur?: number } = {}) {
  const registro = new Map<string, { company: string; billed: number; meta: unknown }>();
  const diretta = new Map<string, { company: string | null; charged: boolean; reason: string }>();
  const piattaforma: Args[] = [];
  let saldo = opzioni.saldoEur ?? 100;
  const rpc = vi.fn(async (name: string, args: Args = {}) => {
    if (name === "get_ai_router_config") return { data: { primary_model: "anthropic/claude-sonnet-4.5", fallback_models: [], default_params: {}, tier_key: "t2_vision" } };
    if (name === "precheck_ai_credit") return { data: { ok: !opzioni.creditoNegato, reason: "prova", message: "Credito AI esaurito (prova)" } };
    if (name === "charge_ai_call") {
      const key = String(args.p_idempotency_key);
      const prima = registro.get(key);
      if (prima) return { data: { success: true, idempotent_replay: true, ledger_id: key } };
      const eur = round8(Number(args.p_cost_real_usd) * Number(args.p_fx_usd_to_eur));
      const billed = args.p_status === "success" ? round8(eur * 3) : 0;
      if (billed > saldo) return { error: { message: "Saldo insufficiente", code: "23514" } };
      saldo = round8(saldo - billed);
      registro.set(key, { company: String(args.p_company_id), billed, meta: args.p_metadata });
      return { data: { success: true, idempotent_replay: false, ledger_id: key, cost_real_eur: eur, cost_billed_eur: billed, margin_eur: round8(billed - eur) } };
    }
    if (name === "addebita_ai_diretta") {
      const key = args.p_idempotency_key as string | null;
      if (key && diretta.has(key)) return { data: { ok: true, charged: false, reason: "idempotent_replay", idempotent_replay: true } };
      const company = (args.p_company_id as string | null) ?? null;
      const row = !company ? { company, charged: false, reason: "no_company" }
        : opzioni.creditoNegato ? { company, charged: false, reason: "insufficient_credits" }
        : { company, charged: true, reason: "success" };
      diretta.set(key ?? `senza-chiave-${diretta.size}`, row);
      return { data: { ok: row.charged || row.reason === "no_company", ...row, usage_log_id: `log-${diretta.size}` } };
    }
    if (name === "registra_esito_lavoro_ai") return { data: null, error: null };
    return { data: null };
  });
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain), gt: vi.fn(() => chain), update: vi.fn(() => chain),
      insert: vi.fn(async (row: Args) => { if (table === "platform_ai_usage_log") piattaforma.push(row); return { error: null }; }),
      upsert: vi.fn(async () => ({ error: null })),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      maybeSingle: vi.fn(async () => ({ data: null })),
    };
    return chain;
  });
  return { rpc, from, registro, diretta, piattaforma, saldo: () => saldo };
}

let generazione = 0;
function rispostaProvider(costo = 0.01) {
  generazione += 1;
  return new Response(JSON.stringify({ id: `gen-finta-${generazione}`, choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1000, completion_tokens: 100, cost: costo } }), { headers: { "Content-Type": "application/json" } });
}

const richiesta = { taskKey: "preventivo_genera", userId: "utente-prova", messages: [{ role: "user" as const, content: "dati finti" }], fxUsdToEur: 0.92 };

describe("router: una chiamata al provider = un addebito", () => {
  beforeEach(() => vi.stubGlobal("Deno", { env: { get: (k: string) => k === "OPENROUTER_API_KEY" ? "chiave-finta-mai-spedita" : undefined } }));
  afterEach(() => vi.unstubAllGlobals());

  it("crediti disponibili: addebita una volta il costo col pavimento 3×", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => rispostaProvider(0.01)));
    const db = dbFinto();
    const r = await aiRouterComplete({ ...richiesta, supabase: db, companyId: "azienda-A", idempotencyKey: "lavoro-A-1" });
    expect(db.registro.size).toBe(1);
    // corrispondenza consumo ↔ addebito atteso: 0,01 $ × 0,92 × 3
    expect(r.costBilledEur).toBe(0.0276);
    expect(db.saldo()).toBe(round8(100 - 0.0276));
  });

  it("stessa chiave del lavoro, provider richiamato: la seconda chiamata si addebita (era il buco dei 60 scarti)", async () => {
    const fetcher = vi.fn(async () => rispostaProvider(0.01)); vi.stubGlobal("fetch", fetcher);
    const db = dbFinto();
    await aiRouterComplete({ ...richiesta, supabase: db, companyId: "azienda-A", idempotencyKey: "stesso-documento" });
    await aiRouterComplete({ ...richiesta, supabase: db, companyId: "azienda-A", idempotencyKey: "stesso-documento" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(db.registro.size).toBe(2);
    const chiavi = [...db.registro.keys()];
    expect(chiavi[1]).toBe("stesso-documento~gen~gen-finta-" + generazione);
    expect((db.registro.get(chiavi[1])!.meta as Args).ripetizione_di).toBe("stesso-documento");
  });

  it("la stessa generazione non si addebita due volte (chiave deterministica)", () => {
    expect(chiaveAddebitoChiamataRipetuta("k", "gen-1")).toBe(chiaveAddebitoChiamataRipetuta("k", "gen-1"));
    expect(chiaveAddebitoChiamataRipetuta("k", null)).not.toBe(chiaveAddebitoChiamataRipetuta("k", null));
  });

  it("crediti insufficienti: il provider non parte e non c'è addebito", async () => {
    const fetcher = vi.fn(async () => rispostaProvider()); vi.stubGlobal("fetch", fetcher);
    const db = dbFinto({ creditoNegato: true });
    await expect(aiRouterComplete({ ...richiesta, supabase: db, companyId: "azienda-A" })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    // il blocco resta nel registro (stato «error», a zero), ma non scala niente
    expect([...db.registro.values()].reduce((s, r) => s + r.billed, 0)).toBe(0);
    expect(db.saldo()).toBe(100);
  });

  it("errore del provider e timeout: niente addebito, niente risposta inventata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Signal timed out."); }));
    const db = dbFinto();
    await expect(aiRouterComplete({ ...richiesta, supabase: db, companyId: "azienda-A" })).rejects.toThrow();
    expect([...db.registro.values()].reduce((s, r) => s + r.billed, 0)).toBe(0);
    expect(db.saldo()).toBe(100);
  });

  it("senza azienda (Silvio dei super admin): costo della piattaforma registrato, nessun addebito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => rispostaProvider(0.02)));
    const db = dbFinto();
    await aiRouterComplete({ ...richiesta, taskKey: "silvio_admin_chat", supabase: db, companyId: null });
    expect(db.registro.size).toBe(0);
    expect(db.piattaforma).toHaveLength(1);
    expect(db.piattaforma[0]).toMatchObject({ operation_key: "silvio_admin_chat", cost_real_usd: 0.02, metadata: expect.objectContaining({ interno: true }) });
  });

  it("isolamento fra due aziende: chiavi uguali del chiamante non si toccano", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => rispostaProvider(0.01)));
    const db = dbFinto();
    await aiRouterComplete({ ...richiesta, supabase: db, companyId: "azienda-A", idempotencyKey: "doc-1" });
    await aiRouterComplete({ ...richiesta, supabase: db, companyId: "azienda-B", idempotencyKey: "doc-1" });
    const aziende = [...db.registro.values()].map((r) => r.company).sort();
    expect(aziende).toEqual(["azienda-A", "azienda-B"]);
  });
});

describe("strada diretta: chiave, replay, consumo non addebitato", () => {
  beforeEach(() => { vi.stubGlobal("Deno", { env: { get: (): undefined => undefined } }); });
  afterEach(() => vi.unstubAllGlobals());

  it("la chiave identifica la chiamata: lavoro + generazione, poi lavoro, poi generazione", () => {
    expect(chiaveAddebitoDiretto({ task_kind: "t", idempotency_key: "allegato_1", metadata: { generation_id: "gen-9" } })).toBe("allegato_1~gen~gen-9");
    expect(chiaveAddebitoDiretto({ task_kind: "t", idempotency_key: "allegato_1" })).toBe("allegato_1");
    expect(chiaveAddebitoDiretto({ task_kind: "t", metadata: { generation_id: "gen-9" } })).toBe("gen:gen-9");
    expect(chiaveAddebitoDiretto({ task_kind: "t" })).toBeNull();
  });

  it("richiesta ritentata (stessa generazione): un solo addebito", async () => {
    const db = dbFinto();
    const args = { supabase: db as never, company_id: "azienda-A", task_kind: "email_opportunita", model_used: "anthropic/claude-haiku-4.5",
      cost_usd_real: 0.001, metadata: { generation_id: "gen-x" } };
    const uno = await chargeAndLogDirect(args);
    const due = await chargeAndLogDirect(args);
    expect(uno.charged).toBe(true);
    expect(due).toMatchObject({ charged: false, idempotent_replay: true });
  });

  it("richieste simultanee con la stessa chiave: una sola va a segno", async () => {
    const db = dbFinto();
    const args = { supabase: db as never, company_id: "azienda-A", task_kind: "x", model_used: "openai/whisper-1", cost_usd_real: 0.01, idempotency_key: "simultanea-1" };
    const esiti = await Promise.all([chargeAndLogDirect(args), chargeAndLogDirect(args), chargeAndLogDirect(args)]);
    expect(esiti.filter((e) => e.charged)).toHaveLength(1);
  });

  it("credito finito dopo la chiamata: il consumo resta registrato, non addebitato, col motivo", async () => {
    const db = dbFinto({ creditoNegato: true });
    const r = await chargeAndLogDirect({ supabase: db as never, company_id: "azienda-A", task_kind: "x", model_used: "m", cost_usd_real: 0.01 });
    expect(r).toMatchObject({ charged: false, reason: "insufficient_credits" });
    expect(db.diretta.size).toBe(1);
  });

  it("chiama sempre la porta unica addebita_ai_diretta, anche senza azienda", async () => {
    const db = dbFinto();
    const r = await chargeAndLogDirect({ supabase: db as never, company_id: null, task_kind: "kb_test_rag", model_used: "openai/text-embedding-3-small", cost_usd_real: 0.0001 });
    expect(r.reason).toBe("no_company");
    expect(db.rpc.mock.calls.map((c) => c[0])).toEqual(["addebita_ai_diretta"]);
  });
});

describe("unità non a token (video, immagini)", () => {
  beforeEach(() => { vi.stubGlobal("Deno", { env: { get: (): undefined => undefined } }); });
  afterEach(() => vi.unstubAllGlobals());

  it("credito negato: nessuna chiamata, messaggio chiaro", async () => {
    const r = await controllaCreditoUnitario(dbFinto({ creditoNegato: true }) as never, { companyId: "azienda-A", costoUsdStimato: 0.2 });
    expect(r).toEqual({ ok: false, messaggio: "Credito AI esaurito (prova)" });
  });

  it("addebito col costo del job, senza token, e replay sulla stessa previsione", async () => {
    const db = dbFinto();
    const a = await addebitaUnitario(db as never, { chiave: "video_replicate_abc", companyId: "azienda-A", userId: null, taskKey: "ads_video_genera", modello: "replicate/minimax-video-01", costoUsd: 0.2 });
    const b = await addebitaUnitario(db as never, { chiave: "video_replicate_abc", companyId: "azienda-A", userId: null, taskKey: "ads_video_genera", modello: "replicate/minimax-video-01", costoUsd: 0.2 });
    expect(a).toMatchObject({ ok: true, replay: false });
    expect(b).toMatchObject({ ok: true, replay: true });
    expect(db.registro.size).toBe(1);
    const call = db.rpc.mock.calls.find((c) => c[0] === "charge_ai_call")![1] as Args;
    expect(call).toMatchObject({ p_tokens_in: 0, p_tokens_out: 0, p_tier_key: "t2_vision" });
  });
});

describe("lavori chiusi senza AI", () => {
  it("la cache del router vale come dato già presente", () => {
    expect(esitoDaRisultatoRouter({ prechargeReason: "cache_hit" })).toBe("dato_gia_presente");
    expect(esitoDaRisultatoRouter({ modelUsed: "anthropic/claude" })).toBe("con_ai");
  });
  it("registrare un esito non ferma mai il lavoro, anche se il database rifiuta", async () => {
    const rotto = { rpc: vi.fn(async () => ({ error: { message: "no" } })) };
    await expect(registraEsitoLavoroAi(rotto, { companyId: "a", flusso: "f", chiave: "k", esito: "senza_ai" })).resolves.toBe(false);
  });
});

describe("lavori in background e accessi (lettura del codice)", () => {
  const leggi = (p: string) => readFileSync(`supabase/functions/${p}`, "utf8");

  it("il triage email L3 fa un batch per azienda e addebita quell'azienda", () => {
    const s = leggi("email-ai-l3-batch/index.ts");
    expect(s).not.toMatch(/companyId:\s*body\.company_id\s*\?\?\s*null/);
    expect(s).toMatch(/for \(const \[companyId, righe\] of perAzienda\)/);
    expect(s).toMatch(/supabase, companyId, taskKind: "email_ai_l3_batch"/);
  });

  it("lo stato del video non chiama più un URL scelto dal browser col token Replicate", () => {
    const s = leggi("ai-ads-video-status/index.ts");
    expect(s).not.toMatch(/body\.replicate_get_url\s*\?\?/);
    expect(s).toMatch(/video_replicate_\$\{body\.replicate_id\}/);
  });

  it("le funzioni che spendevano senza controllo ora verificano utente e ruolo", () => {
    expect(leggi("semantic-search-global/index.ts")).toMatch(/auth\.getUser/);
    expect(leggi("email-ai-embed-backfill/index.ts")).toMatch(/eq\("role", "super_admin"\)/);
    expect(leggi("silvio-generation-worker/index.ts")).toMatch(/requireRole\([^)]*\["super_admin"\]/);
    expect(leggi("survey-ai-assistant/index.ts")).toMatch(/requireCompanyAccess\(supabase, userId, survey\.company_id/);
    expect(leggi("entity-embed-batch/index.ts")).not.toMatch(/authHeader\.includes\(/);
  });

  it("chi chiamava il provider senza addebito ora passa da una strada che addebita", () => {
    expect(leggi("email-ai-estrai-allegato/index.ts")).toMatch(/callOpenRouterAddebitato\(/);
    expect(leggi("email-ai-opportunita/index.ts")).toMatch(/callOpenRouterAddebitato\(/);
    expect(leggi("survey-ai-assistant/index.ts")).toMatch(/claudeMessagesBilled\(/);
    expect(leggi("whatsapp-ai-processor/media.ts")).toMatch(/task_kind: "audio_transcription"/);
    expect(leggi("ai-ads-video-generate/index.ts")).toMatch(/controllaCreditoUnitario\(/);
  });
});
