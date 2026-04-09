// parse-rapportino-ai — Edge Function EiC
// Riceve audio URL dallo storage, trascrive con Whisper (OpenAI),
// poi estrae dati strutturati con GPT-4o mini.
//
// Input JSON: { audio_url, audio_path, order_id?, duration_sec }
// Output JSON: { trascrizione, dati_estratti, rapportino_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  note?: string;
}

const EXTRACTION_PROMPT = `Sei un assistente che estrae dati strutturati da trascrizioni vocali
di operai edili italiani che descrivono il loro lavoro giornaliero.

Dalla trascrizione, estrai ESCLUSIVAMENTE un JSON con questi campi:
{
  "ore_lavorate": numero (ore decimali, es 8 o 7.5),
  "lavorazione": stringa breve che descrive il tipo di lavoro,
  "materiali": array di {nome: string, quantita: number, unita: string},
  "note": stringa con osservazioni, anomalie, problemi
}

Rispondi SOLO con il JSON, senza markdown, senza testo extra.
Se un campo non è presente nella trascrizione, ometti la chiave.`;

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

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper error ${response.status}: ${errText}`);
  }

  const text = await response.text();
  return text.trim();
}

async function extractStructuredData(trascrizione: string): Promise<DatiEstratti> {
  if (!OPENAI_API_KEY) {
    return {};
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: trascrizione },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("GPT extraction failed", await response.text());
      return {};
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(content) as DatiEstratti;
      return parsed;
    } catch {
      return {};
    }
  } catch (err) {
    console.error("GPT extraction error", err);
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

  // ─── Estrazione dati strutturati ──
  const datiEstratti = trascrizione
    ? await extractStructuredData(trascrizione)
    : {};

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
  });
});
