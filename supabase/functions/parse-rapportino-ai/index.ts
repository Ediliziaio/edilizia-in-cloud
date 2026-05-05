// parse-rapportino-ai — Edge Function EiC
// Riceve audio URL dallo storage, trascrive con Whisper (OpenAI),
// poi estrae dati strutturati con GPT-4o mini.
//
// Input JSON: { audio_url, audio_path, order_id?, duration_sec }
// Output JSON: { trascrizione, dati_estratti, rapportino_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

// Rate limiting: max 20 rapportini/giorno per operaio
const MAX_RAPPORTINI_GIORNO = 20;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RequestPayload {
  audio_url?: string;
  audio_path?: string;
  order_id?: string | null;
  duration_sec?: number;
}

interface DatiEstratti {
  ore_lavorate?: number;
  lavorazione?: string;
  materiali?: Array<{ nome: string; quantita: number; unita: string }>;
  team_presenti?: string[];
  note?: string;
  sicurezza_alert?: {
    rilevato: boolean;
    tipo?: "near_miss" | "infortunio" | "dpi_mancante" | "ponteggio_non_a_norma" | "altro";
    descrizione?: string;
    gravita?: "bassa" | "media" | "alta";
  };
  incidenti_segnalati?: string[];
  qualita_auto_valutazione?: "ottima" | "buona" | "da_rivedere";
  lingua_originale?: string;
}

const EXTRACTION_PROMPT = `Sei un assistente che estrae dati strutturati da trascrizioni vocali
di operai edili italiani che descrivono il loro lavoro giornaliero.

ATTENZIONE: l'operaio potrebbe parlare in italiano, rumeno, albanese, arabo o altre lingue.
Se non in italiano: TRADUCI mentalmente e estrai i dati in italiano.

Dalla trascrizione, estrai ESCLUSIVAMENTE un JSON con questi campi:
{
  "ore_lavorate": numero (ore decimali, es 8 o 7.5),
  "lavorazione": stringa breve descrive tipo lavoro,
  "materiali": array di {nome: string, quantita: number, unita: string},
  "team_presenti": array di nomi/ruoli operai presenti in cantiere,
  "note": stringa con osservazioni generali,
  "sicurezza_alert": {
    "rilevato": boolean,
    "tipo": "near_miss" | "infortunio" | "dpi_mancante" | "ponteggio_non_a_norma" | "altro" | null,
    "descrizione": "string descrittiva | null",
    "gravita": "bassa" | "media" | "alta" | null
  },
  "incidenti_segnalati": array di stringhe (eventi imprevisti, danni, ritardi),
  "qualita_auto_valutazione": "ottima" | "buona" | "da_rivedere" | null,
  "lingua_originale": "it" | "ro" | "sq" | "ar" | "en" | "altro"
}

REGOLE CRITICHE:
- Se l'operaio dice cose tipo "quasi mi cadeva", "mi sono fatto male", "ponteggio traballa", "senza casco" → sicurezza_alert.rilevato=true
- Se dice "abbiamo finito ma c'è un problema" → incidenti_segnalati
- Materiali: solo quelli ESPLICITAMENTE menzionati con quantità (es. "ho usato 20 sacchi cemento")
- Rispondi SOLO con il JSON, senza markdown, senza testo extra
- Se un campo non è chiaro nella trascrizione, usa null (non ometter la chiave)`;

async function transcribeAudio(audioBytes: Uint8Array, mimeType: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY non configurata");
  }

  const form = new FormData();
  const blob = new Blob([audioBytes], { type: mimeType });
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : "webm";
  form.append("file", blob, `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "it");
  form.append("response_format", "text");

  // P2-5: Whisper può essere lento (file audio lunghi). Timeout 60s.
  const response = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
    timeoutMs: 60_000,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper error ${response.status}: ${errText}`);
  }

  const text = await response.text();
  return text.trim();
}

async function extractStructuredData(
  trascrizione: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  companyId: string,
  userId: string,
  orderContext?: string,
): Promise<DatiEstratti> {
  if (!trascrizione || trascrizione.length < 5) return {};

  // Migrato ad aiRouter (task rapportino_parse → deepseek-v3.1) — charged + ledger
  try {
    const { aiRouterComplete } = await import("../_shared/aiRouter.ts");
    const userMessage = orderContext
      ? `CONTESTO COMMESSA: ${orderContext}\n\nTRASCRIZIONE OPERAIO:\n${trascrizione}`
      : trascrizione;

    const result = await aiRouterComplete({
      supabase: supabaseAdmin,
      taskKey: "rapportino_parse",
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: userMessage },
      ],
      params: { temperature: 0.1, max_tokens: 1500 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
    });
    try {
      return JSON.parse(result.content) as DatiEstratti;
    } catch {
      console.warn("[parse-rapportino] JSON parse failed, content:", result.content?.slice(0, 200));
      return {};
    }
  } catch (err) {
    console.error("[parse-rapportino] aiRouter error", err);
    return {};
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ─── Auth ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const jwt = authHeader.slice(7);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(jwt);

  if (authError || !user) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }

  // Recupera company_id dal profilo
  const { data: profile, error: profError } = await supabaseAdmin
    .from("profiles")
    .select("company_id, first_name, last_name")
    .eq("id", user.id)
    .single();

  if (profError || !profile) {
    return jsonResponse({ error: "Profilo non trovato" }, 403);
  }

  const companyId = profile.company_id as string;

  // Rate limiting: conta rapportini oggi
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayCount } = await supabaseAdmin
    .from("rapportini_vocali")
    .select("id", { count: "exact", head: true })
    .eq("operaio_id", user.id)
    .gte("created_at", todayStart.toISOString());

  if ((todayCount ?? 0) >= MAX_RAPPORTINI_GIORNO) {
    return jsonResponse(
      { error: `Limite giornaliero raggiunto (${MAX_RAPPORTINI_GIORNO} rapportini)` },
      429,
    );
  }

  // ─── Parse body ──
  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!payload.audio_path) {
    return jsonResponse({ error: "audio_path mancante" }, 400);
  }
  if (!payload.duration_sec || payload.duration_sec < 3) {
    return jsonResponse({ error: "Registrazione troppo breve" }, 400);
  }

  // ─── Download audio dallo storage ──
  const { data: audioBlob, error: downloadError } = await supabaseAdmin.storage
    .from("campo-audio")
    .download(payload.audio_path);

  if (downloadError || !audioBlob) {
    return jsonResponse(
      { error: "Impossibile scaricare l'audio dallo storage" },
      500,
    );
  }

  const audioBytes = new Uint8Array(await audioBlob.arrayBuffer());
  const mimeType = audioBlob.type || "audio/webm";

  // ─── Trascrizione ──
  let trascrizione = "";
  try {
    trascrizione = await transcribeAudio(audioBytes, mimeType);
  } catch (err) {
    console.error("Trascrizione fallita", err);
    // Non bloccante: salva comunque il rapportino in bozza
    trascrizione = "";
  }

  // ─── Carica context commessa per arricchire estrazione ──
  let orderContext = "";
  if (payload.order_id) {
    try {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("order_code, client_name, client_company, tipo_lavoro, indirizzo_lavori, work_description")
        .eq("id", payload.order_id).maybeSingle();
      if (order) {
        orderContext = `Commessa ${order.order_code} per ${order.client_name ?? order.client_company} — Tipo: ${order.tipo_lavoro ?? "n/d"} — Indirizzo: ${order.indirizzo_lavori ?? "n/d"} — Descrizione: ${(order.work_description ?? "").slice(0, 200)}`;
      }
    } catch { /* best-effort */ }
  }

  // ─── Estrazione dati strutturati ──
  const datiEstratti = trascrizione
    ? await extractStructuredData(trascrizione, supabaseAdmin, companyId, user.id, orderContext)
    : {};

  // ─── Trigger sicurezza alert se rilevato ──
  if (datiEstratti.sicurezza_alert?.rilevato) {
    try {
      const sa = datiEstratti.sicurezza_alert;
      const sevMap: Record<string, "critical" | "warning" | "info"> = {
        alta: "critical", media: "warning", bassa: "info",
      };
      await supabaseAdmin.rpc("silvio_create_alert", {
        p_company_id: companyId,
        p_alert_type: "safety_incident",
        p_severity: sevMap[sa.gravita ?? "media"] ?? "warning",
        p_title: `Sicurezza ${sa.tipo ?? "evento"}: ${profile.first_name ?? "operaio"} ${profile.last_name ?? ""}`.trim(),
        p_message: `${sa.descrizione ?? "Evento sicurezza segnalato in rapportino vocale"}.${orderContext ? " Commessa: " + orderContext.slice(0, 100) : ""}`,
        p_dedup_key: `safety:${user.id}:${new Date().toISOString().slice(0, 10)}:${sa.tipo ?? "altro"}`,
        p_target_user_id: null,
        p_cta_label: "Apri rapportino",
        p_cta_action: null,
        p_cta_payload: { rapportino_user_id: user.id, order_id: payload.order_id },
        p_source_type: "rapportino_vocale",
        p_source_id: payload.order_id ?? null,
        p_source_meta: { tipo: sa.tipo, gravita: sa.gravita },
        p_expires_at: null,
      });
    } catch (e) {
      console.warn("[parse-rapportino] safety alert insert failed:", e);
    }
  }

  // ─── Salva bozza su DB ──
  const { data: urlData } = supabaseAdmin.storage
    .from("campo-audio")
    .getPublicUrl(payload.audio_path);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("rapportini_vocali")
    .insert({
      company_id: companyId,
      order_id: payload.order_id ?? null,
      operaio_id: user.id,
      audio_url: urlData.publicUrl,
      audio_duration_sec: payload.duration_sec,
      trascrizione,
      dati_estratti: datiEstratti,
      ore_lavorate: datiEstratti.ore_lavorate ?? null,
      lavorazione: datiEstratti.lavorazione ?? null,
      materiali_usati: datiEstratti.materiali ?? [],
      note: datiEstratti.note ?? null,
      stato: "bozza",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("Insert error", insertError);
    return jsonResponse({ error: "Errore salvataggio bozza" }, 500);
  }

  return jsonResponse({
    trascrizione,
    dati_estratti: datiEstratti,
    rapportino_id: inserted.id,
    safety_alert_triggered: !!datiEstratti.sicurezza_alert?.rilevato,
  });
});
