// generate-render — Edge Function EiC
// Render Infissi AI — Multi-Provider (OpenAI / Gemini)
// NO Lovable Gateway — API keys da platform_settings
// Prompt Engine v6 — Infissi

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── MATERIAL_PHYSICS ─────────────────────────────────────────────────────────
const MATERIAL_PHYSICS: Record<string, string> = {
  pvc: "PVC profilo bianco/colorato, superfici opache con leggerissimo riflesso, giunti squadrati, aspetto pulito e moderno",
  alluminio: "alluminio anodizzato o verniciato a polvere, superfici metalliche con riflessi freddi, profili sottili, look industriale/moderno",
  legno: "legno naturale con venatura visibile, caldo e materico, bordi arrotondati, possibile verniciatura o oliatura",
  "legno-alluminio": "combinazione legno interno e alluminio esterno, dualità termica-estetica, profilo esterno metallico e interno caldo",
  acciaio: "acciaio inox o corten, superfici metalliche brillanti o ossidate, profili molto sottili, stile industriale minimalista",
};

// ── APERTURA_DESCRIPTION ─────────────────────────────────────────────────────
const APERTURA_DESCRIPTION: Record<string, string> = {
  battente: "anta che si apre ruotando su cerniere laterali, visibili cerniere sul lato, maniglia al centro",
  "scorrevole-alzante": "anta che scorre lateralmente su binario, profilo orizzontale inferiore spesso, nessuna cerniera visibile",
  vasistas: "anta che si apre verso l'esterno dal basso ruotando su cerniera superiore, apertura angolata visibile",
  "a-libro": "due ante che si aprono come un libro verso l'esterno, cerniere centrali e laterali",
  fisso: "finestra fissa non apribile, nessun hardware visibile tranne il profilo",
  "coulisse-ante": "ante scorrevoli su binari multipli sovrapposti, aspetto impilato lateralmente",
  tilt_turn: "anta oscillotraslante, visibili cerniere inferiori per ribaltamento e laterali per rotazione",
};

// ── VETRO_DESCRIPTION ────────────────────────────────────────────────────────
const VETRO_DESCRIPTION: Record<string, string> = {
  trasparente: "vetro trasparente che riflette l'ambiente esterno, alta trasmissione luminosa",
  basso_emissivo: "vetro con coating riflettente bluastro/verdastro, leggera iridescenza alla luce",
  satinato: "vetro opacizzato, diffonde la luce senza permettere visione diretta",
  specchiato: "vetro a specchio, riflette completamente l'ambiente circostante",
  colorato: "vetro tinto (bronzo, grigio, azzurro), filtra la luce con tonalità",
  "retinato-sicurezza": "vetro con reticolo metallico interno visibile, aspetto industriale",
};

// ── COLORI_STANDARD ──────────────────────────────────────────────────────────
const COLORI_STANDARD: Record<string, string> = {
  bianco: "bianco puro RAL 9016, superficie omogenea",
  "grigio-antracite": "grigio scuro RAL 7016, colore premium molto richiesto",
  "grigio-chiaro": "grigio medio RAL 7035",
  nero: "nero RAL 9005, aspetto deciso e moderno",
  "bronzo-marrone": "bronzo/marrone RAL 8019, caldo e classico",
  "legno-chiaro": "effetto legno chiaro tipo abete o rovere naturale",
  "legno-scuro": "effetto legno scuro tipo noce o wengé",
  ral_personalizzato: "colore RAL personalizzato secondo specifiche cliente",
};

// ── STILE_AMBIENTE ────────────────────────────────────────────────────────────
const STILE_AMBIENTE: Record<string, string> = {
  moderno: "architettura contemporanea, linee pulite e geometriche, facciata liscia o ventilata",
  classico: "architettura tradizionale italiana, mattoni o intonaco rustico, finestre con archi",
  industriale: "loft o edificio industriale riconvertito, cemento a vista, vetro e acciaio",
  rurale: "casa di campagna, pietra locale, persiane in legno, giardino naturale",
  minimalista: "architettura ridotta all'essenziale, grandi superfici, nessun ornamento",
  mediterraneo: "intonaco colorato (bianco/giallo/ocra), terrazze, vegetazione mediterranea",
};

// ── buildPromptFromConfig ─────────────────────────────────────────────────────
function buildPromptFromConfig(config: Record<string, unknown>): {
  systemPrompt: string;
  userPrompt: string;
  promptBlocks: Record<string, string>;
  promptVersion: string;
} {
  const materiale = (config.materiale as string) || "pvc";
  const apertura = (config.apertura as string) || "battente";
  const colore = (config.colore as string) || "bianco";
  const vetro = (config.vetro as string) || "trasparente";
  const stileAmbiente = (config.stile_ambiente as string) || "moderno";
  const larghezza = (config.larghezza as number) || 120;
  const altezza = (config.altezza as number) || 150;
  const numeroAnte = (config.numero_ante as number) || 2;
  const noteLibere = (config.note_libere as string) || "";
  const qualita = (config.qualita as string) || "alta";

  const materialDesc = MATERIAL_PHYSICS[materiale] || materiale;
  const aperturaDesc = APERTURA_DESCRIPTION[apertura] || apertura;
  const vetroDesc = VETRO_DESCRIPTION[vetro] || vetro;
  const coloreDesc = COLORI_STANDARD[colore] || colore;
  const ambienteDesc = STILE_AMBIENTE[stileAmbiente] || stileAmbiente;
  const qualitaDesc = qualita === "alta"
    ? "rendering fotorealistico di altissima qualità, dettagli millimetrici"
    : "rendering fotorealistico professionale";

  const systemPrompt = `Sei un motore di rendering architetturale specializzato in infissi e serramenti italiani.
Il tuo compito è modificare la foto originale dell'edificio sostituendo gli infissi esistenti con quelli specificati.
Mantieni INVARIATI: struttura dell'edificio, colori delle pareti, cielo, vegetazione, persone, veicoli, illuminazione.
Sostituisci SOLO gli infissi (finestre, porte-finestre, portoncini) con quelli descritti.
Qualità output: ${qualitaDesc}.`;

  const userPrompt = `Sostituisci tutti gli infissi visibili in questa foto con i seguenti:

MATERIALE: ${materiale} — ${materialDesc}
TIPO APERTURA: ${apertura} — ${aperturaDesc}
COLORE PROFILO: ${colore} — ${coloreDesc}
VETRO: ${vetro} — ${vetroDesc}
DIMENSIONI INDICATIVE: ${larghezza}cm × ${altezza}cm per anta
NUMERO ANTE PER FINESTRA: ${numeroAnte}
STILE EDIFICIO: ${stileAmbiente} — ${ambienteDesc}
${noteLibere ? `\nNOTE AGGIUNTIVE: ${noteLibere}` : ""}

Requisiti tecnici del render:
- Proporzioni e posizioni degli infissi identiche all'originale
- Riflessi realistici sul vetro coerenti con l'illuminazione della foto
- Ombre e luci degli infissi coerenti con la fonte luminosa esistente
- Profili ${materiale} con spessore proporzionato alla dimensione reale
- Giunti e guarnizioni visibili dove appropriato
- Qualità fotorealistica professionale adatta a preventivo commerciale`;

  const promptBlocks = {
    materiale: materialDesc,
    apertura: aperturaDesc,
    colore: coloreDesc,
    vetro: vetroDesc,
    ambiente: ambienteDesc,
    dimensioni: `${larghezza}×${altezza}cm, ${numeroAnte} ante`,
    note: noteLibere,
  };

  return { systemPrompt, userPrompt, promptBlocks, promptVersion: "v6" };
}

// ── fetchWithTimeout ──────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 120_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "missing_auth", message: "Authorization header required" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "invalid_auth", message: "Invalid or expired token" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request ───────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { session_id, config } = body as { session_id?: string; config?: Record<string, unknown> };

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: "session_id is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Legge la sessione ───────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from("render_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Sessione non trovata" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Verifica che la sessione appartenga all'utente (tramite company)
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.company_id !== session.company_id) {
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Accesso negato" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Controlla crediti ───────────────────────────────────────────────────
    const creditResult = await supabase.rpc("deduct_render_credit", {
      _company_id: session.company_id,
    });

    if (creditResult.data === "insufficient") {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", message: "Crediti render insufficienti" }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Aggiorna sessione: processing ───────────────────────────────────────
    await supabase
      .from("render_sessions")
      .update({ status: "processing", processing_started_at: new Date().toISOString() })
      .eq("id", session_id);

    // ── Genera signed URL per la foto originale ─────────────────────────────
    const originalPath = session.original_photo_url as string;
    let imageUrl = originalPath;

    if (originalPath && !originalPath.startsWith("http")) {
      const { data: signed } = await supabase.storage
        .from("render-originals")
        .createSignedUrl(originalPath, 600); // 10 min
      if (signed?.signedUrl) imageUrl = signed.signedUrl;
    }

    // ── Build prompt ────────────────────────────────────────────────────────
    const renderConfig = config || (session.config as Record<string, unknown>) || {};
    const { systemPrompt, userPrompt, promptBlocks, promptVersion } =
      buildPromptFromConfig(renderConfig);

    // ── Legge provider config e API key da platform_settings ────────────────
    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (!providerConfig) {
      throw new Error("Nessun provider render attivo. Configurare in Admin > Impostazioni AI > Render.");
    }

    const platformKeyName = `render_${providerConfig.provider_key}_api_key`;
    const { data: keyRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", platformKeyName)
      .single();

    const apiKey = (keyRow as { value: string } | null)?.value?.trim();
    if (!apiKey) {
      throw new Error(
        `API key mancante per provider '${providerConfig.provider_key}'.` +
        ` Configurarla in Admin > Impostazioni AI > Render.`
      );
    }

    // ── Chiama il provider AI corretto ──────────────────────────────────────
    let imageData: string | null = null;

    if (providerConfig.provider_key === "openai") {
      // OpenAI: gpt-image-1 con image editing (multipart/form-data)
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      const imgBlob = await imgResp.blob();

      const form = new FormData();
      form.append("model", providerConfig.model);
      form.append("prompt", userPrompt);
      form.append("image[]", imgBlob, "photo.jpg");
      form.append("n", "1");
      form.append("size", "1024x1024");
      form.append("response_format", "b64_json");

      const resp = await fetchWithTimeout(
        "https://api.openai.com/v1/images/edits",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        },
        providerConfig.timeout_sec * 1000
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI error ${resp.status}: ${err.substring(0, 300)}`);
      }

      const oaiData = await resp.json();
      const b64 = oaiData.data?.[0]?.b64_json;
      if (b64) imageData = `data:image/png;base64,${b64}`;

    } else if (providerConfig.provider_key === "gemini") {
      // Google Gemini: gemini-2.0-flash-preview-image-generation
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      const imgBuffer = await imgResp.arrayBuffer();
      const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

      const geminiBody = {
        contents: [{
          parts: [
            { text: systemPrompt + "\n\n" + userPrompt },
            { inline_data: { mime_type: "image/jpeg", data: imgB64 } },
          ],
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 1,
        },
      };

      const geminiUrl = `${providerConfig.api_endpoint}/${providerConfig.model}:generateContent?key=${apiKey}`;
      const resp = await fetchWithTimeout(
        geminiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
        },
        providerConfig.timeout_sec * 1000
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini error ${resp.status}: ${err.substring(0, 300)}`);
      }

      const gemData = await resp.json();
      const parts = gemData.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

    } else {
      throw new Error(
        `Provider '${providerConfig.provider_key}' non supporta image generation. ` +
        `Selezionare OpenAI o Gemini.`
      );
    }

    if (!imageData) {
      throw new Error("Nessuna immagine ricevuta dal provider AI");
    }

    // ── Upload risultato su Storage ─────────────────────────────────────────
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const resultPath = `${session.company_id}/${session_id}/render_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("render-results")
      .upload(resultPath, uint8, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("render-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;

    // ── Aggiorna render_sessions: completed ─────────────────────────────────
    const costReal = providerConfig.cost_real_per_render ?? 0.04;
    const costBilled = providerConfig.cost_billed_per_render ?? 0.10;

    await supabase
      .from("render_sessions")
      .update({
        status: "completed",
        result_urls: [resultUrl],
        prompt_used: userPrompt,
        prompt_blocks: promptBlocks,
        prompt_version: promptVersion,
        prompt_char_count: userPrompt.length,
        provider_key: providerConfig.provider_key,
        cost_real: costReal,
        cost_billed: costBilled,
        config_snapshot: renderConfig,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    // ── Incrementa contatore render provider ────────────────────────────────
    await supabase
      .from("render_provider_config")
      .update({ renders_generated: (providerConfig.renders_generated ?? 0) + 1 })
      .eq("id", providerConfig.id);

    // ── Inserisce in render_gallery ─────────────────────────────────────────
    await supabase.from("render_gallery").insert({
      company_id: session.company_id,
      session_id,
      created_by: user.id,
      title: `Render ${new Date().toLocaleDateString("it-IT")}`,
      original_url: session.original_photo_url,
      render_url: resultUrl,
      tags: [renderConfig.materiale as string, renderConfig.colore as string].filter(Boolean),
    });

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultUrl,
        provider: providerConfig.provider_key,
        cost_billed: costBilled,
        prompt_version: promptVersion,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-render] error:", msg);

    // Aggiorna sessione come failed se session_id disponibile
    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        await supabase
          .from("render_sessions")
          .update({ status: "failed", error_message: msg })
          .eq("id", sid);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: "render_failed", message: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
