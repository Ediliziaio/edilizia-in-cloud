/**
 * I crediti AI dell'azienda si controllano PRIMA di spendere, anche per l'audio.
 *
 * L'uso dell'AI spende i crediti disponibili dell'azienda: all'azienda si addebita il
 * costo reale per il markup (deduct_ai_credits_with_markup, che rifiuta se il saldo non
 * basta). La chat passa dal router AI, che prima di chiamare il provider verifica il
 * saldo (precheck_ai_credit). La trascrizione audio no: chiamava OpenAI e SOLO DOPO
 * addebitava. Con il saldo a zero l'addebito falliva, il testo veniva scartato e il
 * costo restava a carico della piattaforma, a ogni tentativo.
 *
 * Qui lo stesso precheck della chat, con il costo massimo che una trascrizione può
 * addebitare: durata massima accettata × tariffa × cambio × markup di quel compito. La
 * RPC chiede in più un margine del 50% sulla stima.
 */
import { estimateWhisperCostUsd } from "./ai-provider/directApi.ts";
import { jsonResponse } from "./headers.ts";
import { QUOTE_FAILURES } from "./quoteFailure.ts";

/** Oltre questa durata la trascrizione viene scartata (audio.ts): il costo massimo si stima su questa. */
export const QUOTE_AUDIO_MAX_SECONDS = 125;
/** Se la tabella dei markup non si legge: il più alto fra quelli in uso per le trascrizioni. */
const MARKUP_DI_RISERVA = 3;

export const QUOTE_COMPANY_CREDIT_MESSAGE = QUOTE_FAILURES.AI_COMPANY_CREDIT;
export const QUOTE_AUDIO_CREDIT_MESSAGE =
  "I crediti AI dell’azienda sono insufficienti: nessun audio inviato e nessun addebito. La registrazione resta disponibile; ricarica i crediti per trascriverla.";

type CreditDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error?: { message?: string } | null }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
};

/** Forma piatta (niente unione): il controllo tipi del progetto non restringe le unioni su `ok`. */
export type CreditDecision = {
  ok: boolean;
  /** "credit" = saldo insufficiente (402); "unavailable" = il controllo non risponde (503). Assente se ok. */
  kind?: "credit" | "unavailable";
  reason?: string;
  message?: string;
  estimatedBilledEur: number;
};

/** Il markup che l'addebito applicherà: quello del compito, altrimenti il predefinito, altrimenti il più alto in uso. */
export async function markupAudio(db: CreditDb): Promise<number> {
  try {
    const { data, error } = await db
      .from("ai_pricing_markup")
      .select("task_kind, markup_multiplier")
      .is("model_pattern", null)
      .eq("enabled", true)
      .in("task_kind", ["audio_transcription", "default"]);
    if (error || !Array.isArray(data)) return MARKUP_DI_RISERVA;
    const righe = data as Array<{ task_kind: string; markup_multiplier: number | string }>;
    const scelto = righe.find((r) => r.task_kind === "audio_transcription") ?? righe.find((r) => r.task_kind === "default");
    const m = Number(scelto?.markup_multiplier);
    return Number.isFinite(m) && m > 0 ? m : MARKUP_DI_RISERVA;
  } catch {
    return MARKUP_DI_RISERVA;
  }
}

/** Quanto, al massimo, una trascrizione può addebitare all'azienda (euro, markup compreso). */
export async function stimaAddebitoAudioEur(db: CreditDb): Promise<number> {
  const cambio = Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92");
  const fx = Number.isFinite(cambio) && cambio > 0 ? cambio : 0.92;
  const markup = await markupAudio(db);
  return Math.round(estimateWhisperCostUsd(QUOTE_AUDIO_MAX_SECONDS) * fx * markup * 10000) / 10000;
}

export async function precheckCreditoAudio(db: CreditDb, companyId: string): Promise<CreditDecision> {
  const estimatedBilledEur = await stimaAddebitoAudioEur(db);
  const failOpen = Deno.env.get("AI_ROUTER_ALLOW_PRECHECK_FAIL_OPEN") === "true";
  try {
    const { data, error } = await db.rpc("precheck_ai_credit", {
      p_company_id: companyId,
      p_estimated_cost_eur: estimatedBilledEur,
    });
    if (error) {
      console.warn("[quote-audio] precheck crediti non disponibile:", error.message);
      return failOpen
        ? { ok: true, estimatedBilledEur }
        : { ok: false, kind: "unavailable", reason: "precheck_error", estimatedBilledEur };
    }
    const r = data as { ok?: boolean; reason?: string } | null;
    if (r?.ok === true) return { ok: true, estimatedBilledEur };
    return { ok: false, kind: "credit", reason: r?.reason, message: QUOTE_AUDIO_CREDIT_MESSAGE, estimatedBilledEur };
  } catch (e) {
    console.warn("[quote-audio] precheck crediti non riuscito:", e instanceof Error ? e.message : e);
    return failOpen
      ? { ok: true, estimatedBilledEur }
      : { ok: false, kind: "unavailable", reason: "precheck_exception", estimatedBilledEur };
  }
}

/** 402 con le stesse chiavi che la finestra di ricarica già riconosce (code, wallet, frase «crediti … insufficienti»). */
export function companyCreditResponse(
  message: string,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse({ code: "AI_COMPANY_CREDIT", error: message, wallet: "ai", ...extra }, 402, headers);
}

export function creditDecisionResponse(
  decision: CreditDecision,
  headers: Record<string, string>,
): Response {
  if (decision.kind === "credit") {
    return companyCreditResponse(decision.message ?? QUOTE_AUDIO_CREDIT_MESSAGE, headers, {
      reason: decision.reason ?? null,
      estimated_cost_eur: decision.estimatedBilledEur,
    });
  }
  return jsonResponse(
    { code: "AI_CREDIT_CHECK_UNAVAILABLE", error: "Verifica dei crediti AI non disponibile. Nessun audio inviato e nessun addebito: riprova tra poco." },
    503,
    headers,
  );
}
