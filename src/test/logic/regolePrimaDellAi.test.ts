/**
 * Fase 5 (14/11/2026): prima le regole, poi l'AI. Il modello è finto: nessuna chiamata a pagamento.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({ checkPaymentMethod: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../../../supabase/functions/_shared/allarmeAI.ts", () => ({ segnalaErroreAI: vi.fn() }));
import { aiRouterComplete } from "../../../supabase/functions/_shared/aiRouter";
import { commessaFinale, decidiClassificazione } from "../../../supabase/functions/_shared/regolePrimaDellAi";
import { chiaveLetturaFile, improntaFile } from "../../../supabase/functions/_shared/improntaFile";

describe("decidiClassificazione", () => {
  const regola = { order_id: "o1", motivo: "CUP H85E12000710002" };
  it("commessa dalle regole e categoria già nota: il modello non si chiama", () => {
    expect(decidiClassificazione(regola, "materiali_edili")).toEqual({ chiamaAi: false, motivo: null });
  });
  it("commessa dalle regole ma categoria mancante: si chiama, e il motivo lo dice", () => {
    expect(decidiClassificazione(regola, null)).toEqual({ chiamaAi: true, motivo: "categoria mancante (commessa già riconosciuta da CUP)" });
  });
  it("nessuna regola: si chiama col motivo", () => {
    expect(decidiClassificazione(null, "altro").motivo).toBe("commessa non riconosciuta da CUP/CIG/codice");
    expect(decidiClassificazione(null, "").motivo).toBe("categoria mancante e commessa non riconosciuta da CUP/CIG/codice");
  });
  it("la commessa delle regole vince su quella del modello", () => {
    expect(commessaFinale(regola, { orderId: "o2", confidenza: 0.4 })).toEqual({ orderId: "o1", confidenza: 1, motivo: "CUP H85E12000710002" });
    expect(commessaFinale(null, { orderId: "o2", confidenza: 0.4 })).toEqual({ orderId: "o2", confidenza: 0.4, motivo: null });
  });
});

describe("ai-fattura-classify usa le regole prima del modello", () => {
  const src = readFileSync("supabase/functions/ai-fattura-classify/index.ts", "utf8");
  it("chiede commessa_da_codici e passa il motivo al router", () => {
    expect(src).toContain('rpc("commessa_da_codici"');
    expect(src.indexOf("commessaDaRegole(supabase")).toBeLessThan(src.indexOf("aiRouterComplete({"));
    expect(src).toContain("motivo: decisione.motivo");
  });
});

/** Un database finto con la sola cache delle risposte e il registro. */
function dbConCache() {
  const cache = new Map<string, { id: string; output_content: string; model_used: string; hits: number; expires_at: string }>();
  const charges: Array<Record<string, unknown>> = [];
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === "get_ai_router_config") return { data: { primary_model: "openai/gpt-4o-mini", fallback_models: [], default_params: {}, tier_key: "test" } };
    if (name === "precheck_ai_credit") return { data: { ok: true } };
    if (name === "charge_ai_call") { charges.push(args ?? {}); return { data: { success: true, ledger_id: "ledger", cost_billed_eur: 0.02 } }; }
    return { data: null };
  });
  const from = vi.fn((tabella: string) => {
    if (tabella !== "ai_response_cache") return { insert: vi.fn(async () => ({ error: null })) };
    const filtri: Record<string, string> = {};
    const q = {
      select: () => q,
      eq: (c: string, v: string) => { filtri[c] = v; return q; },
      gt: () => q,
      maybeSingle: async () => ({ data: cache.get(`${filtri.task_key}|${filtri.company_id}|${filtri.input_hash}`) ?? null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      upsert: async (r: { task_key: string; company_id: string; input_hash: string; output_content: string; model_used: string; expires_at: string }) => {
        cache.set(`${r.task_key}|${r.company_id}|${r.input_hash}`, { id: "c1", hits: 0, ...r });
        return { error: null as string | null };
      },
    };
    return q;
  });
  return { rpc, from, cache, charges };
}

describe("lettura OCR: lo stesso file due volte, una sola lettura AI", () => {
  beforeEach(() => vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "OPENROUTER_API_KEY" ? "test-not-a-secret" : undefined) } }));
  afterEach(() => vi.unstubAllGlobals());

  it("la chiave dipende dal contenuto, non dal nome o dal percorso", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4 fattura 12/2026");
    const a = chiaveLetturaFile("fattura_ricevuta_ocr", await improntaFile(pdf));
    const b = chiaveLetturaFile("fattura_ricevuta_ocr", await improntaFile(new Uint8Array(pdf)));
    const c = chiaveLetturaFile("fattura_ricevuta_ocr", await improntaFile(new TextEncoder().encode("%PDF-1.4 fattura 13/2026")));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^fattura_ricevuta_ocr:sha256:[0-9a-f]{64}$/);
  });

  it("due caricamenti dello stesso PDF: il modello risponde una volta, la seconda viene dalla cache", async () => {
    const db = dbConCache();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "g", choices: [{ message: { content: '{"numero_fattura":"12"}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.01 } }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    const chiave = chiaveLetturaFile("fattura_ricevuta_ocr", await improntaFile(new TextEncoder().encode("%PDF stesso file")));
    const leggi = (percorso: string) => aiRouterComplete({
      supabase: db, taskKey: "fattura_ricevuta_ocr", companyId: "azienda", userId: "utente",
      // Il messaggio cambia (URL firmata, nome): la chiave no.
      messages: [{ role: "user", content: `leggi ${percorso}?token=${Math.random()}` }],
      cacheTtlDays: 365, cacheKey: chiave, motivo: "lettura di un file mai letto (nessun XML)",
    });
    const prima = await leggi("azienda/a.pdf");
    const seconda = await leggi("azienda/copia di a.pdf");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(prima.prechargeReason).not.toBe("cache_hit");
    expect(seconda.prechargeReason).toBe("cache_hit");
    expect(seconda.content).toBe(prima.content);
    expect(db.charges).toHaveLength(1);
    expect((db.charges[0].p_metadata as Record<string, unknown>).motivo).toBe("lettura di un file mai letto (nessun XML)");
  });

  it("la funzione OCR usa l'impronta del file come chiave della cache", () => {
    const src = readFileSync("supabase/functions/ai-fattura-ricevuta-ocr/index.ts", "utf8");
    expect(src).toContain('cacheKey: chiaveLetturaFile("fattura_ricevuta_ocr", impronta)');
    expect(src).toContain("cacheTtlDays: 365");
  });
});
