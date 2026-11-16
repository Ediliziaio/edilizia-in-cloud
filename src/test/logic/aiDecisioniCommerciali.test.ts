/**
 * Decisioni commerciali sull'AI approvate dal titolare il 16/11/2026
 * (docs/ai-addebiti-censimento.md §9 e §10).
 *
 * Provider e database FINTI. Le regole di prezzo, rimborso e debito vivono nel
 * database (migrazione 20290417120000) e sono provate là in transazioni annullate
 * su Demo Azienda 2; qui si prova che il codice le chiama dove serve.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({ checkPaymentMethod: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../../../supabase/functions/_shared/allarmeAI.ts", () => ({ segnalaErroreAI: vi.fn() }));
import { aiRouterComplete } from "../../../supabase/functions/_shared/aiRouter";
import { rimborsaAddebitoAi } from "../../../supabase/functions/_shared/rimborsoAi";
import { riepilogoDebitoAi } from "@/components/credits/DebitoAiAlert";

type Args = Record<string, unknown>;
const FN = "supabase/functions";
const leggi = (p: string) => readFileSync(join(FN, p), "utf8");
const MIGRAZIONE = readFileSync("supabase/migrations/20290417120000_ai_ricarico_rimborsi_debito.sql", "utf8");

function dbFinto() {
  const rimborsi: Args[] = [];
  const rpc = vi.fn(async (name: string, args: Args = {}) => {
    if (name === "get_ai_router_config") return { data: { primary_model: "anthropic/claude-haiku-4.5", fallback_models: [], default_params: {}, tier_key: "t3_balanced" } };
    if (name === "precheck_ai_credit") return { data: { ok: true } };
    if (name === "charge_ai_call") {
      const eur = Number(args.p_cost_real_usd) * Number(args.p_fx_usd_to_eur);
      return { data: { success: true, idempotent_replay: false, ledger_id: "riga-1", cost_real_eur: eur, cost_billed_eur: eur * 3, margin_eur: eur * 2 } };
    }
    if (name === "ai_rimborsa_addebito") {
      rimborsi.push(args);
      return { data: { ok: true, rimborsato_eur: 0.0276, debito_annullato_eur: 0 } };
    }
    return { data: null };
  });
  const from = vi.fn(() => {
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain), gt: vi.fn(() => chain), update: vi.fn(() => chain),
      insert: vi.fn(async () => ({ error: null })), upsert: vi.fn(async () => ({ error: null })),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      maybeSingle: vi.fn(async () => ({ data: null })),
    };
    return chain;
  });
  return { rpc, from, rimborsi };
}

function risposta(content: string) {
  return new Response(JSON.stringify({ id: `gen-${Math.random()}`, choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1000, completion_tokens: 100, cost: 0.01 } }), { headers: { "Content-Type": "application/json" } });
}

const richiesta = {
  taskKey: "fattura_classify", userId: "utente-prova", companyId: "azienda-A",
  messages: [{ role: "user" as const, content: "dati finti" }], fxUsdToEur: 0.92,
  responseFormat: { type: "json_object" },
};

describe("2. errore nostro dopo che il provider ha lavorato: si rimborsa", () => {
  beforeEach(() => vi.stubGlobal("Deno", { env: { get: (k: string) => k === "OPENROUTER_API_KEY" ? "chiave-finta-mai-spedita" : undefined } }));
  afterEach(() => vi.unstubAllGlobals());

  it("JSON chiesto e non leggibile sull'ultimo modello: addebito stornato, risultato a 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => risposta("non è JSON, mi spiace")));
    const db = dbFinto();
    const r = await aiRouterComplete({ ...richiesta, supabase: db, idempotencyKey: "fattura-1" });
    expect(db.rimborsi).toHaveLength(1);
    expect(db.rimborsi[0]).toMatchObject({ p_ledger_id: "riga-1", p_motivo: "risposta JSON non leggibile" });
    expect(r.rimborsato).toBe(true);
    expect(r.costBilledEur).toBe(0);
  });

  it("JSON leggibile (anche dentro un fence): nessun rimborso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => risposta("```json\n{\"categoria_ai\":\"materiali\"}\n```")));
    const db = dbFinto();
    const r = await aiRouterComplete({ ...richiesta, supabase: db, idempotencyKey: "fattura-2" });
    expect(db.rimborsi).toHaveLength(0);
    expect(r.rimborsato).toBeUndefined();
    expect(r.costBilledEur).toBeGreaterThan(0);
  });

  it("testo libero senza JSON chiesto: nessun rimborso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => risposta("testo libero")));
    const db = dbFinto();
    await aiRouterComplete({ ...richiesta, responseFormat: undefined, supabase: db, idempotencyKey: "fattura-3" });
    expect(db.rimborsi).toHaveLength(0);
  });

  it("rimborsaAddebitoAi non lancia mai e passa la riga giusta", async () => {
    const rotto = { rpc: vi.fn(async () => { throw new Error("rete giù"); }) };
    await expect(rimborsaAddebitoAi(rotto, { ledgerId: "x", motivo: "salvataggio fallito" })).resolves.toMatchObject({ rimborsato: false });
    expect(await rimborsaAddebitoAi(rotto, { motivo: "niente" })).toMatchObject({ rimborsato: false, reason: "niente_da_rimborsare" });
    const db = dbFinto();
    await rimborsaAddebitoAi(db, { usageLogId: "log-1", ledgerId: "ignorato", motivo: "salvataggio fallito" });
    expect(db.rimborsi[0]).toMatchObject({ p_usage_log_id: "log-1", p_ledger_id: null });
    const replay = { rpc: vi.fn(async () => ({ data: { ok: true, idempotent_replay: true, reason: "gia_rimborsato" } })) };
    expect((await rimborsaAddebitoAi(replay, { idempotencyKey: "video_replicate_abc", motivo: "video non generato" })).rimborsato).toBe(true);
  });

  it("i punti agganciati: video fallito, classificazione fatture, lettura DDT", () => {
    const v = leggi("ai-ads-video-status/index.ts");
    expect(v).toMatch(/idempotencyKey: `video_replicate_\$\{body\.replicate_id\}`,\s*motivo: "video non generato"/);
    expect(v).toMatch(/motivo: "video senza file in uscita"/);
    const f = leggi("ai-fattura-classify/index.ts");
    expect(f).toMatch(/motivo: "risposta JSON non leggibile"/);
    expect(f).toMatch(/if \(erroreSalvataggio\) \{\s*await rimborsaAddebitoAi/);
    expect(leggi("ddt-ai-extract/index.ts")).toMatch(/rimborsaAddebitoAi\(supabaseAdmin as any, \{ ledgerId: aiResult\.ledgerId/);
  });

  it("nel database: la riga resta, il rimborso è una riga nuova (refunded, importo negativo)", () => {
    expect(MIGRAZIONE).toMatch(/CHECK \(cost_billed_eur >= 0 OR status = 'refunded'\)/);
    expect(MIGRAZIONE).toMatch(/v_key := 'rimborso:' \|\| l\.idempotency_key;/);
    expect(MIGRAZIONE).not.toMatch(/DELETE FROM public\.ai_call_ledger/i);
  });
});

describe("1. ricarico per compito, minimo 3× su tutte le strade", () => {
  it("la tabella non accetta un ricarico sotto 3× e la funzione lo rialza comunque", () => {
    expect(MIGRAZIONE).toMatch(/CHECK \(regalato OR moltiplicatore >= 3\)/);
    expect(MIGRAZIONE).toMatch(/GREATEST\(r\.moltiplicatore, 3\.0\), false, 'compito'/);
    expect(MIGRAZIONE).toMatch(/GREATEST\(r\.moltiplicatore, 3\.0\), false, 'default'/);
  });

  it("router e strada diretta leggono la stessa regola", () => {
    expect(MIGRAZIONE).toMatch(/charge_ai_call[\s\S]*FROM public\.ai_ricarico_per\(p_task_key, p_model_used\)/);
    expect(MIGRAZIONE).toMatch(/deduct_ai_credits_with_markup[\s\S]*FROM public\.ai_ricarico_per\(p_task_kind, p_model_used\)/);
    // Il vecchio pavimento del tier non scende mai sotto 3×.
    expect(MIGRAZIONE).toMatch(/v_min_mult := GREATEST\(COALESCE\(\(v_pricing->>'min_markup_multiplier'\)::numeric, 3\.0\), 3\.0\);/);
  });

  it("le funzioni nuove nascono chiuse ad anon", () => {
    for (const f of ["ai_ricarico_per\\(text, text\\)", "ai_debito_salda\\(uuid\\)", "ai_rimborsa_addebito\\(text, text, uuid, uuid\\)", "ai_ricarico_anteprima\\(integer\\)", "tg_ai_debito_salda\\(\\)"]) {
      expect(MIGRAZIONE).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f} FROM PUBLIC, anon`));
    }
  });
});

describe("3. chiamata fatta a credito finito: debito scalato alla ricarica", () => {
  it("router e diretta scrivono il debito invece di perdere la chiamata", () => {
    expect(MIGRAZIONE).toMatch(/VALUES \(p_company_id, 'router', v_ledger_id, p_task_key, v_debito, v_debito\)/);
    expect(MIGRAZIONE).toMatch(/VALUES \(p_company_id, 'diretta', v_log_id, p_task_kind, v_cost_billed, v_cost_billed\)/);
  });

  it("si salda quando il saldo o l'omaggio crescono, a fine transazione, senza far fallire la ricarica", () => {
    expect(MIGRAZIONE).toMatch(/CREATE CONSTRAINT TRIGGER ai_credits_salda_debito\s+AFTER UPDATE ON public\.ai_credits\s+DEFERRABLE INITIALLY DEFERRED/);
    expect(MIGRAZIONE).toMatch(/WHEN \(NEW\.balance_eur > OLD\.balance_eur OR NEW\.free_balance_eur > OLD\.free_balance_eur\)/);
    expect(MIGRAZIONE).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING 'ai_debito_salda/);
  });

  it("«a_debito» non è un addebito mancato per chi chiama la strada diretta", () => {
    expect(leggi("_shared/ai-provider/directApi.ts")).toMatch(/\["idempotent_replay", "no_company", "regalato", "a_debito"\]/);
    expect(leggi("ai-preventivo-conversazione/audio.ts")).toMatch(/charge\.reason !== 'a_debito'/);
  });

  it("il titolare lo vede in Crediti", () => {
    expect(readFileSync("src/pages/azienda/settings/SettingsCredits.tsx", "utf8")).toMatch(/<DebitoAiAlert companyId=\{companyId\} \/>/);
    expect(riepilogoDebitoAi([])).toEqual({ totale: 0, chiamate: 0, dal: null });
    const r = riepilogoDebitoAi([
      { residuo_eur: "0.0455", created_at: "2026-11-16T10:00:00Z" },
      { residuo_eur: 0, created_at: "2026-11-01T10:00:00Z" },
      { residuo_eur: 0.01, created_at: "2026-11-15T10:00:00Z" },
    ]);
    expect(r.chiamate).toBe(2);
    expect(r.totale).toBeCloseTo(0.0555, 6);
    expect(r.dal).toBe("2026-11-15T10:00:00Z");
  });
});

describe("4. embedding regalati", () => {
  it("ogni compito di embedding nel codice è regalato (per nome o per modello)", () => {
    const file: string[] = [];
    const visita = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) { if (n !== "node_modules") visita(p); }
        else if (n.endsWith(".ts") && !n.endsWith(".test.ts")) file.push(p);
      }
    };
    visita(FN);
    const compiti = new Set<string>();
    for (const f of file) {
      for (const m of readFileSync(f, "utf8").matchAll(/(?:task_kind|taskKind|taskKey):\s*["']([a-z_0-9]*embedding[a-z_0-9]*)["']/g)) compiti.add(m[1]);
    }
    expect(compiti.size).toBeGreaterThan(5);
    for (const c of compiti) expect(MIGRAZIONE, c).toMatch(new RegExp(`\\('${c}',\\s+true,`));
    expect(MIGRAZIONE).toMatch(/IF COALESCE\(p_modello, ''\) ILIKE '%embed%' THEN/);
  });

  it("niente più controllo del credito prima di un embedding regalato", () => {
    expect(leggi("semantic-search-global/index.ts")).not.toMatch(/precallCheck/);
    expect(leggi("email-ai-embed-backfill/index.ts")).not.toMatch(/precallCheck/);
  });
});
