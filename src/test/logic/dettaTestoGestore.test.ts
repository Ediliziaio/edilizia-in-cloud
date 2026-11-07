/**
 * «Detta e ripulisci» (07/11/2026): il gestore VERO di detta-testo con database,
 * storage, Whisper e router finti.
 *
 * Cosa conta: carta e saldo si guardano PRIMA di scaricare l'audio e di
 * chiamare Whisper (con il saldo a zero il costo resterebbe alla piattaforma);
 * l'audio deve stare nella cartella utente/azienda; un errore del provider apre
 * l'allarme del credito; una pulizia che fallisce o inventa un numero
 * restituisce la trascrizione grezza, non un errore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto } from "../helpers/edgeFinto";

const condiviso = vi.hoisted(() => ({
  client: null as unknown,
  router: vi.fn(),
  segnala: vi.fn(),
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.client }));
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => ({ aiRouterComplete: condiviso.router }));
vi.mock("../../../supabase/functions/_shared/allarmeAI.ts", () => ({ segnalaErroreAI: condiviso.segnala }));

const UTENTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AZIENDA = "11111111-1111-4111-8111-111111111111";
const ALTRA = "22222222-2222-4222-8222-222222222222";
const PERCORSO = `${UTENTE}/detta/${AZIENDA}/registrazione.webm`;
const GREZZO = "allora ehm oggi abbiamo fatto il massetto al piano terra cioè venti sacchi di cemento";

class Mondo extends DbMinimo {
  scaricati: string[] = [];
  rimossi: string[] = [];
  file: Record<string, Blob> = { [`campo-audio/${PERCORSO}`]: new Blob([new Uint8Array(2048)], { type: "audio/webm" }) };
  auth = {
    getClaims: async (token: string) => (token === "jwt-valido"
      ? { data: { claims: { sub: UTENTE } }, error: null as unknown }
      : { data: null as unknown, error: { message: "invalid JWT" } }),
    getUser: async () => ({ data: { user: null as unknown }, error: { message: "invalid JWT" } }),
  };
  storage = {
    from: (bucket: string) => ({
      download: async (p: string) => {
        this.scaricati.push(p);
        const f = this.file[`${bucket}/${p}`];
        return f ? { data: f, error: null as unknown } : { data: null as unknown, error: { message: "not found" } };
      },
      remove: async (p: string[]) => { this.rimossi.push(...p); return { data: null as unknown, error: null as unknown }; },
    }),
  };
}

let mondo: Mondo;
let whisper: ReturnType<typeof vi.fn>;

function popola(m: Mondo, { pagamento = "stripe", saldoOk = true, limite = true } = {}) {
  m.tabelle.profiles = [{ id: UTENTE, company_id: AZIENDA }];
  m.tabelle.user_roles = [{ user_id: UTENTE, role: "employee" }];
  m.tabelle.multi_company_access = [];
  m.tabelle.companies = [{ id: AZIENDA, payment_method: pagamento, status: "active" }];
  m.tabelle.ai_pricing_markup = [{ task_kind: "audio_transcription", markup_multiplier: 3, model_pattern: null, enabled: true }];
  m.rpcs.precheck_ai_credit = () => (saldoOk ? { ok: true } : { ok: false, reason: "insufficient_balance" });
  m.rpcs.check_ai_router_rate_limit = (a) => (limite || a.p_function_name !== "detta-testo:giorno"
    ? { allowed: true }
    : { allowed: false, retry_after_seconds: 86_400 });
  m.rpcs.deduct_ai_credits_with_markup = () => [{ ok: true, reason: "ok", usage_log_id: "log-1" }];
}

beforeEach(() => {
  mondo = new Mondo();
  popola(mondo);
  condiviso.client = mondo;
  condiviso.router.mockReset();
  condiviso.segnala.mockReset();
  condiviso.router.mockResolvedValue({ content: "Oggi abbiamo fatto il massetto al piano terra: 20 sacchi di cemento." });
  whisper = vi.fn(async () => new Response(GREZZO, { status: 200 }));
  vi.stubGlobal("fetch", whisper);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function detta(corpo: Record<string, unknown> = {}, jwt = "jwt-valido") {
  vi.resetModules();
  const { finto, gestore } = denoFinto({
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    OPENAI_API_KEY: "sk-finto",
  });
  vi.stubGlobal("Deno", finto);
  const percorso = "../../../supabase/functions/detta-testo/index.ts";
  await import(/* @vite-ignore */ percorso);
  const risposta = await gestore()!(new Request("http://x/functions/v1/detta-testo", {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ audio_path: PERCORSO, contesto: "rapportino", campo: "descrizione", durata_secondi: 12, company_id: AZIENDA, ...corpo }),
  }));
  return { stato: risposta.status, corpo: (await risposta.json()) as Record<string, unknown> };
}

const chiamateWhisper = () => whisper.mock.calls.filter((c) => String(c[0]).includes("audio/transcriptions")).length;
const addebiti = () => mondo.rpcChiamate.filter((c) => c.nome === "deduct_ai_credits_with_markup");

describe("detta-testo: gestore vero", () => {
  it("trascrive, ripulisce e restituisce testo pulito e grezzo, poi toglie l'audio", async () => {
    const { stato, corpo } = await detta();
    expect(stato).toBe(200);
    expect(corpo).toEqual({ trascrizione: GREZZO, testo: "Oggi abbiamo fatto il massetto al piano terra: 20 sacchi di cemento.", pulito: true });
    expect(chiamateWhisper()).toBe(1);
    expect(addebiti()).toHaveLength(1);
    expect(addebiti()[0].args).toMatchObject({ p_company_id: AZIENDA, p_task_kind: "audio_transcription", p_model_used: "openai/whisper-1" });
    const opzioni = condiviso.router.mock.calls[0][0];
    expect(opzioni).toMatchObject({ taskKey: "detta_testo", companyId: AZIENDA, userId: UTENTE, params: { temperature: 0.1 } });
    expect(opzioni.messages[0].content).toMatch(/NON devi MAI/);
    expect(opzioni.messages[1].content).toBe(GREZZO);
    expect(mondo.rimossi).toEqual([PERCORSO]);
  });

  it("senza carta risponde 402 prima di scaricare l'audio e di chiamare Whisper", async () => {
    popola(mondo, { pagamento: "none" });
    const { stato, corpo } = await detta();
    expect(stato).toBe(402);
    expect(corpo.code).toBe("payment_method_required");
    expect(mondo.scaricati).toEqual([]);
    expect(chiamateWhisper()).toBe(0);
    expect(addebiti()).toHaveLength(0);
  });

  it("con il saldo che non basta risponde 402 crediti AI prima di Whisper, stimando 3 minuti", async () => {
    popola(mondo, { saldoOk: false });
    const { stato, corpo } = await detta();
    expect(stato).toBe(402);
    expect(corpo).toMatchObject({ code: "AI_COMPANY_CREDIT", wallet: "ai" });
    expect(String(corpo.error)).toMatch(/crediti AI .* insufficienti/);
    expect(mondo.scaricati).toEqual([]);
    expect(chiamateWhisper()).toBe(0);
    // 180 s × 0,006 $/min × 0,92 × markup 3 + 0,01 € di pulizia
    const stima = Number(mondo.rpcChiamate.find((c) => c.nome === "precheck_ai_credit")?.args.p_estimated_cost_eur);
    expect(stima).toBeCloseTo(0.0597, 4);
  });

  it("oltre il limite di oggi risponde 429 senza chiamare Whisper", async () => {
    popola(mondo, { limite: false });
    const { stato, corpo } = await detta();
    expect(stato).toBe(429);
    expect(String(corpo.error)).toMatch(/limite di dettature di oggi/);
    expect(chiamateWhisper()).toBe(0);
  });

  it.each([
    ["di un altro utente", `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/detta/${AZIENDA}/x.webm`],
    ["di un'altra azienda", `${UTENTE}/detta/${ALTRA}/x.webm`],
    ["che risale le cartelle", `${UTENTE}/detta/${AZIENDA}/../../altro.webm`],
  ])("rifiuta un audio %s", async (_nome, audio_path) => {
    const { stato } = await detta({ audio_path });
    expect(stato).toBe(403);
    expect(chiamateWhisper()).toBe(0);
  });

  it("non lavora per un'azienda a cui l'utente non appartiene", async () => {
    const { stato } = await detta({ company_id: ALTRA, audio_path: `${UTENTE}/detta/${ALTRA}/x.webm` });
    expect(stato).toBe(403);
    expect(chiamateWhisper()).toBe(0);
  });

  it("senza JWT valido risponde 401", async () => {
    const { stato } = await detta({}, "jwt-falso");
    expect(stato).toBe(401);
    expect(chiamateWhisper()).toBe(0);
  });

  it("rifiuta più di 3 minuti di audio", async () => {
    const { stato } = await detta({ durata_secondi: 300 });
    expect(stato).toBe(400);
    expect(chiamateWhisper()).toBe(0);
  });

  it("un 402 di OpenAI apre l'allarme del credito e non addebita niente", async () => {
    whisper.mockImplementation(async () => new Response('{"error":{"message":"insufficient_quota"}}', { status: 402 }));
    const { stato } = await detta();
    expect(stato).toBe(502);
    expect(condiviso.segnala).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", stato: 402 }),
      expect.objectContaining({ funzione: "detta-testo", modello: "openai/whisper-1", companyId: AZIENDA }),
    );
    expect(addebiti()).toHaveLength(0);
    expect(condiviso.router).not.toHaveBeenCalled();
  });

  it("se la pulizia fallisce restituisce la trascrizione grezza con il flag, non un errore", async () => {
    condiviso.router.mockRejectedValue(new Error("Tutti i modelli hanno fallito"));
    const { stato, corpo } = await detta();
    expect(stato).toBe(200);
    expect(corpo).toEqual({ trascrizione: GREZZO, testo: GREZZO, pulito: false, motivo: "pulizia_non_riuscita" });
  });

  it("se il modello aggiunge un numero mai detto, scarta il pulito e restituisce il grezzo", async () => {
    whisper.mockImplementation(async () => new Response("abbiamo fatto il massetto al piano terra e poi ehm la guaina sul terrazzo", { status: 200 }));
    condiviso.router.mockResolvedValue({ content: "Abbiamo fatto il massetto al piano terra (35 mq) e poi la guaina sul terrazzo." });
    const { corpo } = await detta();
    expect(corpo).toMatchObject({ pulito: false, motivo: "numeri_aggiunti" });
    expect(corpo.testo).toBe(corpo.trascrizione);
  });
});
