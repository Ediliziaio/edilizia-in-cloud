// 10/11/2026: ripubblicata per _shared/quoteTemplateComposer, contrattoStandard e punteggiatura (niente doppio punto).
// detta-testo — «Detta e ripulisci» (07/11/2026).
//
// Chi detta dal telefono parla come capita: qui l'audio diventa testo pulito
// (punteggiatura, termini di cantiere, niente intercalari) SENZA fatti nuovi.
// Il testo torna al campo, la persona lo rivede e decide lei se salvare.
// Niente viene scritto nel database oltre all'addebito: è una bozza di testo.
//
// Funzione nuova e non una modalità di `trascrizione-audio`: quella riceve il
// file nel corpo (multipart, fino a 25 MB) e non controlla il saldo prima di
// Whisper; questa legge dal bucket privato `campo-audio`, con i controlli di
// pagamento, credito e limiti PRIMA di spendere. Mescolarle avrebbe cambiato i
// chiamanti di quella.
//
// Input:  { audio_path, contesto: "rapportino"|"giornale", campo?, durata_secondi, company_id? }
//         audio_path = <utente>/detta/<azienda>/<file> (la policy del bucket
//         vuole l'utente in testa; l'azienda subito dopo la lega al tenant).
// Output: { trascrizione, testo, pulito, motivo? } — se la pulizia non riesce
//         `testo` è la trascrizione grezza e `pulito` è false: non è un errore.

import { getCorsHeaders, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { chargeAndLogDirect, estimateWhisperCostUsd } from "../_shared/ai-provider/directApi.ts";
import { markupAudio, creditDecisionResponse, QUOTE_AUDIO_CREDIT_MESSAGE } from "../_shared/quoteCreditGuard.ts";
import { segnalaErroreAI } from "../_shared/allarmeAI.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { CONTESTI_DETTA, campoValido, controllaTestoPulito, promptPulizia, type ContestoDetta } from "./pulizia.ts";

const BUCKET = "campo-audio";
/** Come il registratore del campo: oltre non si registra. */
export const DETTA_MAX_SECONDI = 180;
const MIN_SECONDI = 3;
const MAX_BYTES = 10 * 1024 * 1024;
/** Stima della pulizia (gpt-4o-mini, ~2.000 token): pochi decimi di centesimo, arrotondata in su. */
const STIMA_PULIZIA_EUR = 0.01;

// Larghi per chi lavora (un rapportino ha due o tre campi), stretti per chi automatizza.
const LIMITI = [
  { nome: "detta-testo:1m", chi: "user", max: 6, finestra: 60 },
  { nome: "detta-testo:giorno", chi: "user", max: 60, finestra: 86_400 },
  { nome: "detta-testo:azienda", chi: "company", max: 30, finestra: 60 },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Corpo = {
  audio_path?: unknown;
  contesto?: unknown;
  campo?: unknown;
  durata_secondi?: unknown;
  company_id?: unknown;
};

// deno-lint-ignore no-explicit-any
type Db = any;

/** Saldo PRIMA di Whisper: con il saldo a zero il costo di OpenAI resterebbe alla piattaforma. */
async function creditoBasta(db: Db, companyId: string) {
  const cambio = Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92");
  const fx = Number.isFinite(cambio) && cambio > 0 ? cambio : 0.92;
  const markup = await markupAudio(db);
  const estimatedBilledEur =
    Math.round((estimateWhisperCostUsd(DETTA_MAX_SECONDI) * fx * markup + STIMA_PULIZIA_EUR) * 10000) / 10000;
  const failOpen = Deno.env.get("AI_ROUTER_ALLOW_PRECHECK_FAIL_OPEN") === "true";
  try {
    const { data, error } = await db.rpc("precheck_ai_credit", {
      p_company_id: companyId,
      p_estimated_cost_eur: estimatedBilledEur,
    });
    if (error) {
      console.warn("[detta-testo] precheck crediti non disponibile:", error.message);
      return failOpen ? null : { ok: false, kind: "unavailable" as const, estimatedBilledEur };
    }
    if ((data as { ok?: boolean } | null)?.ok === true) return null;
    return {
      ok: false,
      kind: "credit" as const,
      reason: (data as { reason?: string } | null)?.reason,
      message: QUOTE_AUDIO_CREDIT_MESSAGE,
      estimatedBilledEur,
    };
  } catch (e) {
    console.warn("[detta-testo] precheck crediti non riuscito:", e instanceof Error ? e.message : e);
    return failOpen ? null : { ok: false, kind: "unavailable" as const, estimatedBilledEur };
  }
}

/** Conteggio atomico già usato dai preventivi. Se non risponde si lascia passare: il saldo è controllato a parte. */
async function limiteSuperato(db: Db, userId: string, companyId: string): Promise<number | null> {
  for (const l of LIMITI) {
    try {
      const { data, error } = await db.rpc("check_ai_router_rate_limit", {
        p_function_name: l.nome,
        p_caller_id: l.chi === "user" ? `user:${userId}` : `company:${companyId}`,
        p_max_calls: l.max,
        p_window_seconds: l.finestra,
      });
      if (error) continue;
      const r = data as { allowed?: boolean; retry_after_seconds?: number } | null;
      if (r?.allowed === false) return Math.max(1, Math.ceil(Number(r.retry_after_seconds) || l.finestra));
    } catch {
      // protezione, non controllo di spesa: si prosegue
    }
  }
  return null;
}

async function trascrivi(blob: Blob, mime: string, companyId: string): Promise<{ testo: string } | { errore: Response }> {
  const chiave = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!chiave) return { errore: new Response(null, { status: 503 }) };
  const form = new FormData();
  const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : "webm";
  form.append("file", blob, `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "it");
  form.append("response_format", "text");
  const contesto = { funzione: "detta-testo", modello: "openai/whisper-1", companyId };
  let res: Response;
  try {
    res = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chiave}` },
      body: form,
      timeoutMs: 60_000,
    });
  } catch (e) {
    segnalaErroreAI(e, contesto);
    return { errore: new Response(null, { status: 504 }) };
  }
  if (!res.ok) {
    const testo = await res.text().catch(() => "");
    // Qui risponde il provider: un 402/401 di OpenAI deve aprire l'allarme del credito.
    segnalaErroreAI({ provider: "openai", stato: res.status, messaggio: testo.slice(0, 500) }, contesto);
    return { errore: new Response(null, { status: 502 }) };
  }
  return { testo: (await res.text()).trim() };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo non consentito" }, 405, cors);

  try {
    // JWT obbligatorio: la funzione spende crediti, mai aperta ad anon.
    const { userId, supabaseAdmin: db } = await requireAuth(req, cors);

    let corpo: Corpo;
    try {
      corpo = await req.json();
    } catch {
      return jsonResponse({ error: "Richiesta non valida" }, 400, cors);
    }
    const contesto = CONTESTI_DETTA.includes(corpo.contesto as ContestoDetta) ? corpo.contesto as ContestoDetta : null;
    if (!contesto) return jsonResponse({ error: "Contesto non valido" }, 400, cors);
    const campo = campoValido(contesto, corpo.campo);
    const durata = Number(corpo.durata_secondi);
    // +2 s di tolleranza: il registratore arrotonda, il browser può allungare di poco.
    if (!Number.isFinite(durata) || durata < MIN_SECONDI || durata > DETTA_MAX_SECONDI + 2) {
      return jsonResponse({ error: `Registra da ${MIN_SECONDI} secondi a ${DETTA_MAX_SECONDI / 60} minuti.` }, 400, cors);
    }

    let companyId = typeof corpo.company_id === "string" && UUID.test(corpo.company_id) ? corpo.company_id : null;
    if (!companyId) {
      const { data: profilo } = await db.from("profiles").select("company_id").eq("id", userId).maybeSingle();
      companyId = (profilo as { company_id?: string | null } | null)?.company_id ?? null;
    }
    if (!companyId) return jsonResponse({ error: "Nessuna azienda associata" }, 400, cors);
    await requireCompanyAccess(db, userId, companyId, cors);

    const percorso = typeof corpo.audio_path === "string" ? corpo.audio_path : "";
    const cartella = `${userId}/detta/${companyId}/`;
    if (!percorso.startsWith(cartella) || percorso.length > 300 || percorso.includes("..") || percorso.slice(cartella.length).includes("/")) {
      return jsonResponse({ error: "Audio fuori dalla cartella consentita" }, 403, cors);
    }

    // Carta e saldo PRIMA di toccare l'audio e OpenAI.
    const pagamento = await gateAiPayment(db, companyId, cors);
    if (pagamento) return pagamento;
    const credito = await creditoBasta(db, companyId);
    if (credito) return creditDecisionResponse(credito, cors);

    const attesa = await limiteSuperato(db, userId, companyId);
    if (attesa !== null) {
      return jsonResponse({
        code: "RATE_LIMITED",
        error: attesa >= 3600
          ? "Hai raggiunto il limite di dettature di oggi. Puoi scrivere il testo a mano."
          : "Troppe dettature ravvicinate. Attendi qualche istante e riprova.",
        retryAfterSeconds: attesa,
      }, 429, cors);
    }

    const { data: audio, error: erroreScarico } = await db.storage.from(BUCKET).download(percorso);
    if (erroreScarico || !audio) return jsonResponse({ error: "Audio non trovato: registra di nuovo." }, 404, cors);
    const blob = audio as Blob;
    if (!blob.size || blob.size > MAX_BYTES) return jsonResponse({ error: "Audio vuoto o oltre 10 MB." }, 413, cors);
    const mime = blob.type || "audio/webm";

    const esito = await trascrivi(blob, mime, companyId);
    if ("errore" in esito) {
      return jsonResponse({ error: "Trascrizione non riuscita. Riprova tra poco o scrivi il testo: nessun addebito." }, esito.errore.status, cors);
    }
    const trascrizione = esito.testo;
    await chargeAndLogDirect({
      supabase: db,
      company_id: companyId,
      task_kind: "audio_transcription",
      model_used: "openai/whisper-1",
      cost_usd_real: estimateWhisperCostUsd(durata),
      cost_is_estimated: true,
      metadata: { user_id: userId, audio_seconds: durata, file_size_bytes: blob.size, operation: "detta_testo", contesto, campo },
    }).catch((e: unknown) => console.warn("[detta-testo] addebito Whisper non registrato:", e instanceof Error ? e.message : e));

    // L'audio serviva solo a questo: non resta nel bucket.
    await db.storage.from(BUCKET).remove([percorso]).catch(() => undefined);

    if (!trascrizione) {
      return jsonResponse({ error: "Non ho sentito parole. Riprova parlando vicino al telefono." }, 422, cors);
    }

    // Pulizia: se non riesce si restituisce la trascrizione, mai un errore.
    let testo = trascrizione;
    let pulito = false;
    let motivo: string | null = null;
    try {
      const { aiRouterComplete } = await import("../_shared/aiRouter.ts");
      const risposta = await aiRouterComplete({
        supabase: db,
        taskKey: "detta_testo",
        messages: [
          { role: "system", content: promptPulizia(contesto, campo) },
          { role: "user", content: trascrizione },
        ],
        params: { temperature: 0.1, max_tokens: 1500 },
        companyId,
        userId,
        idempotencyKey: `detta_testo_${percorso}`,
      });
      const controllo = controllaTestoPulito(risposta.content, trascrizione);
      if (controllo.scartato) motivo = controllo.motivo;
      else { testo = controllo.testo; pulito = true; }
    } catch (e) {
      // Il router ha già segnalato al sistema degli allarmi gli errori del provider.
      console.warn("[detta-testo] pulizia non riuscita:", e instanceof Error ? e.message : e);
      motivo = "pulizia_non_riuscita";
    }

    return jsonResponse({ trascrizione, testo, pulito, ...(motivo ? { motivo } : {}) }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[detta-testo] errore:", e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Errore interno: riprova o scrivi il testo." }, 500, cors);
  }
});
