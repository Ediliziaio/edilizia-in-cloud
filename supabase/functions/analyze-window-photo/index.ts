// analyze-window-photo — Edge Function EiC
// Analizza foto finestre con Gemini 2.5 Flash
// Restituisce FotoAnalisi JSON per il wizard RenderNew

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `You are an expert Italian window and door analyzer.
Analyze the provided image and extract structured information about the window/door visible.
You MUST respond with a valid JSON object only — no markdown, no explanation, just pure JSON.`;

const USER_PROMPT = `Analyze this window/door photo and return ONLY a JSON object with these exact fields:

{
  "tipo_apertura": one of: "battente_1_anta"|"battente_2_ante"|"battente_3_ante"|"scorrevole"|"scorrevole_alzante"|"vasistas"|"anta_ribalta"|"bilico"|"fisso"|"portafinestra",
  "materiale_attuale": one of: "pvc"|"alluminio"|"legno"|"legno_alluminio"|"acciaio_corten"|"acciaio_minimale",
  "colore_attuale": string (describe the color, e.g. "bianco RAL 9016", "grigio antracite", "legno noce"),
  "condizioni": one of: "buone"|"usurato"|"danneggiato"|"fatiscente",
  "stile_edificio": one of: "moderno"|"classico"|"industriale"|"rurale"|"liberty"|"anni_60_70"|"contemporaneo",
  "num_ante_attuale": number (1, 2 or 3 — count of movable sash panels),
  "presenza_cassonetto": boolean (true if roller shutter housing visible above window),
  "presenza_davanzale": boolean (true if window sill/ledge visible below window),
  "presenza_inferriata": boolean (true if security bars/grate visible),
  "larghezza_stimata_cm": number (estimated width in centimeters, null if unclear),
  "altezza_stimata_cm": number (estimated height in centimeters, null if unclear),
  "note_analisi": string (brief Italian note about what you observed, max 100 chars)
}

Respond with ONLY the JSON object. No extra text.`;

const BATHROOM_SYSTEM_PROMPT = `You are an expert Italian bathroom analyzer.
Analyze the provided bathroom image and extract structured information about the visible room.
You MUST respond with a valid JSON object only — no markdown, no explanation, just pure JSON.`;

const BATHROOM_USER_PROMPT = `Analyze this bathroom photo and return ONLY a JSON object with these exact fields:

{
  "tipo_stanza": string,
  "dimensione_stimata": string,
  "altezza_stimata": string,
  "piastrelle_parete_attuali": string,
  "pavimento_attuale": string,
  "colori_dominanti": array of short color strings,
  "presenza_doccia": boolean,
  "tipo_doccia": string or null,
  "presenza_vasca": boolean,
  "presenza_mobile": boolean,
  "tipo_mobile": string or null,
  "sanitari_tipo": string or null,
  "rubinetteria_attuale": string or null,
  "illuminazione_attuale": string or null,
  "stato_conservazione": one of: "buono"|"discreto"|"da_ristrutturare",
  "note": string
}

Respond with ONLY the JSON object. No extra text.`;

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "si", "sì", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function normalizeBathroomAnalysis(input: Record<string, unknown>): Record<string, unknown> {
  const colors = Array.isArray(input.colori_dominanti)
    ? input.colori_dominanti.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const conservation = typeof input.stato_conservazione === "string"
    ? input.stato_conservazione.trim().toLowerCase().replace(/\s+/g, "_")
    : "";

  return {
    tipo_stanza: stringOrDefault(input.tipo_stanza, "bagno"),
    dimensione_stimata: stringOrDefault(input.dimensione_stimata, "dimensione non identificata"),
    altezza_stimata: stringOrDefault(input.altezza_stimata, "altezza non identificata"),
    piastrelle_parete_attuali: stringOrDefault(input.piastrelle_parete_attuali, "non identificabili"),
    pavimento_attuale: stringOrDefault(input.pavimento_attuale, "non identificabile"),
    colori_dominanti: colors.slice(0, 8),
    presenza_doccia: booleanOrDefault(input.presenza_doccia, false),
    tipo_doccia: stringOrUndefined(input.tipo_doccia),
    presenza_vasca: booleanOrDefault(input.presenza_vasca, false),
    presenza_mobile: booleanOrDefault(input.presenza_mobile, false),
    tipo_mobile: stringOrUndefined(input.tipo_mobile),
    sanitari_tipo: stringOrUndefined(input.sanitari_tipo),
    rubinetteria_attuale: stringOrUndefined(input.rubinetteria_attuale),
    illuminazione_attuale: stringOrUndefined(input.illuminazione_attuale),
    stato_conservazione: conservation === "buono" || conservation === "da_ristrutturare" ? conservation : "discreto",
    note: stringOrUndefined(input.note),
  };
}

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);

  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsH });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "missing_auth", message: "Authorization header required" }),
        { status: 401, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "invalid_auth", message: "Token non valido" }),
        { status: 401, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { image_url, session_id, mode } = body as { image_url?: string; session_id?: string; mode?: string };
    const analyzeMode = (mode || "window").trim().toLowerCase();

    if (!image_url) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: "image_url is required" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // ── Recupera Gemini API key da platform_settings ─────────────────────────
    let geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

    if (!geminiApiKey) {
      const { data: setting } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "render_gemini_api_key")
        .single();
      geminiApiKey = setting?.value ?? "";
    }

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({
          error: "config_error",
          message: "Gemini API key non configurata. Configurarla in Admin > Impostazioni AI > Render.",
        }),
        { status: 503, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // ── Scarica immagine e converte in base64 ───────────────────────────────
    const imgController = new AbortController();
    const imgTimeout = setTimeout(() => imgController.abort(), 30_000);
    let imgB64 = "";
    let mimeType = "image/jpeg";

    try {
      const imgResp = await fetch(image_url, { signal: imgController.signal });
      clearTimeout(imgTimeout);
      if (!imgResp.ok) throw new Error(`Fetch immagine fallito: ${imgResp.status}`);
      const contentType = imgResp.headers.get("content-type") ?? "image/jpeg";
      mimeType = contentType.split(";")[0] ?? "image/jpeg";
      const imgBuffer = await imgResp.arrayBuffer();
      imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
    } catch (err) {
      clearTimeout(imgTimeout);
      return new Response(
        JSON.stringify({ error: "image_fetch_error", message: `Impossibile scaricare l'immagine: ${String(err)}` }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // ── Chiama Gemini 2.5 Flash ─────────────────────────────────────────────
    const geminiBody = {
      contents: [{
        parts: [
          {
            text: analyzeMode === "bathroom"
              ? `${BATHROOM_SYSTEM_PROMPT}\n\n${BATHROOM_USER_PROMPT}`
              : `${SYSTEM_PROMPT}\n\n${USER_PROMPT}`,
          },
          { inline_data: { mime_type: mimeType, data: imgB64 } },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    };

    const geminiModel = "gemini-2.5-flash-preview-04-17";
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    const gemController = new AbortController();
    const gemTimeout = setTimeout(() => gemController.abort(), 60_000);

    let rawText = "";
    try {
      const gemResp = await fetch(geminiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
        signal: gemController.signal,
      });
      clearTimeout(gemTimeout);

      if (!gemResp.ok) {
        const errText = await gemResp.text();
        throw new Error(`Gemini error ${gemResp.status}: ${errText.substring(0, 300)}`);
      }

      const gemData = await gemResp.json();
      rawText = gemData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch (err) {
      clearTimeout(gemTimeout);
      return new Response(
        JSON.stringify({ error: "ai_error", message: `Analisi AI fallita: ${String(err)}` }),
        { status: 502, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // ── Parse JSON dalla risposta ───────────────────────────────────────────
    let fotoAnalisi: Record<string, unknown> = {};
    try {
      // Estrai JSON anche se c'è testo extra o markdown code block
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Nessun JSON trovato nella risposta");
      fotoAnalisi = JSON.parse(jsonMatch[0]);
      if (analyzeMode === "bathroom") {
        fotoAnalisi = normalizeBathroomAnalysis(fotoAnalisi);
      }
    } catch (_err) {
      return new Response(
        JSON.stringify({
          error: "parse_error",
          message: "Impossibile analizzare la risposta AI",
          raw: rawText.substring(0, 500),
        }),
        { status: 422, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // ── Aggiorna sessione con foto_analisi se session_id fornito ────────────
    // FIX P1.1: prima di scrivere, verifica che la sessione appartenga alla
    // company effettiva dell'utente (o che l'utente sia super_admin). Senza
    // questo controllo la service_role key bypasserebbe RLS e permetterebbe
    // a qualsiasi autenticato di sovrascrivere foto_analisi di sessioni altrui
    // semplicemente conoscendo l'UUID.
    if (session_id) {
      const sessionTable = analyzeMode === "bathroom" ? "render_bagno_sessions" : "render_sessions";
      const analysisColumn = analyzeMode === "bathroom" ? "analisi_bagno" : "foto_analisi";

      const { data: sess } = await supabase
        .from(sessionTable)
        .select("company_id")
        .eq("id", session_id)
        .maybeSingle();

      const sessionCompanyId = (sess as { company_id?: string } | null)?.company_id;
      if (!sessionCompanyId) {
        return new Response(
          JSON.stringify({
            error: "session_not_found",
            message: "Sessione render non trovata per il session_id fornito.",
          }),
          { status: 404, headers: { ...corsH, "Content-Type": "application/json" } },
        );
      }

      const allowed = await canAccessCompany(supabase, user.id, sessionCompanyId);
      if (!allowed) {
        return new Response(
          JSON.stringify({
            error: "forbidden",
            message: "Non sei autorizzato a modificare questa sessione render.",
          }),
          { status: 403, headers: { ...corsH, "Content-Type": "application/json" } },
        );
      }

      await supabase
        .from(sessionTable)
        .update({ [analysisColumn]: fotoAnalisi })
        .eq("id", session_id);
    }

    return new Response(
      JSON.stringify(
        analyzeMode === "bathroom"
          ? { success: true, analisi_bagno: fotoAnalisi }
          : { success: true, foto_analisi: fotoAnalisi },
      ),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[analyze-window-photo] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(err) }),
      { status: 500, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }
});
