// Diagnostic endpoint: prova chiave + modello per ogni provider della chain
// render AI. Non genera immagini reali, fa solo HEAD/GET test minimali per
// validare credenziali e availability dei modelli.
//
// Output: JSON con stato di ogni tier {gemini_direct, openrouter, openai_direct}.
// Ritorna 200 anche se i provider falliscono — è uno strumento di diagnostica,
// non di generazione. L'errore viene riportato nel body.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProviderTest {
  provider: string;
  api_key_present: boolean;
  api_key_source?: string;
  model: string;
  endpoint: string;
  status?: number;
  status_text?: string;
  ok: boolean;
  response_excerpt?: string;
  error?: string;
}

const TIMEOUT_MS = 15_000;

function getGeminiApiKey(): { key: string; source: string } | null {
  const sources = [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "RENDER_GEMINI_API_KEY",
  ];
  for (const s of sources) {
    const v = Deno.env.get(s)?.trim();
    if (v) return { key: v, source: s };
  }
  return null;
}

// Tiny PNG 1x1 trasparente — payload minimal per testare generazione reale.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function testGemini(): Promise<ProviderTest> {
  const model = Deno.env.get("GEMINI_IMAGE_MODEL")?.trim() ||
    Deno.env.get("RENDER_GEMINI_MODEL")?.trim() ||
    "gemini-2.5-flash-image";
  // POST reale come in produzione (image.ts:callGeminiImage)
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const k = getGeminiApiKey();
  if (!k) {
    return {
      provider: "gemini_direct",
      api_key_present: false,
      model, endpoint,
      ok: false,
      error: "GEMINI_API_KEY non configurata nei Supabase secrets",
    };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": k.key,
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: "Echo this image unchanged." },
            { inline_data: { mime_type: "image/png", data: TINY_PNG_B64 } },
          ],
        }],
        generationConfig: { responseModalities: ["Image"] },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await resp.text();
    let hasImage = false;
    try {
      const j = JSON.parse(text);
      const parts = j?.candidates?.[0]?.content?.parts ?? [];
      hasImage = parts.some((p: { inline_data?: unknown }) => p.inline_data);
    } catch { /* hasImage false */ }
    return {
      provider: "gemini_direct",
      api_key_present: true,
      api_key_source: k.source,
      model, endpoint,
      status: resp.status,
      status_text: resp.statusText,
      ok: resp.ok && hasImage,
      response_excerpt: text.substring(0, 700),
      error: resp.ok && !hasImage
        ? "200 OK ma nessuna immagine nei parts della response"
        : undefined,
    };
  } catch (e) {
    return {
      provider: "gemini_direct",
      api_key_present: true,
      api_key_source: k.source,
      model, endpoint,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Discovery helper: lista modelli OpenRouter che matchano un prefix
async function listOpenRouterModels(prefix: string): Promise<string[]> {
  const key = Deno.env.get("OPENROUTER_API_KEY")?.trim();
  if (!key) return [];
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) return [];
    const j = await resp.json();
    if (!Array.isArray(j?.data)) return [];
    return j.data
      .map((m: { id: string }) => m.id)
      .filter((id: string) => id.startsWith(prefix));
  } catch {
    return [];
  }
}

async function testOpenRouter(model: string, tierLabel: string): Promise<ProviderTest> {
  // POST reale a chat/completions (stesso endpoint usato in produzione)
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const key = Deno.env.get("OPENROUTER_API_KEY")?.trim();
  if (!key) {
    return {
      provider: `openrouter_${tierLabel}`,
      api_key_present: false,
      model, endpoint,
      ok: false,
      error: "OPENROUTER_API_KEY non configurata",
    };
  }
  try {
    // 1) Verifica catalog
    const catalogResp = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    let modelFound = false;
    if (catalogResp.ok) {
      const j = await catalogResp.json().catch(() => null);
      if (j && Array.isArray(j.data)) {
        modelFound = j.data.some((m: { id: string }) => m.id === model);
      }
    }
    if (!modelFound) {
      return {
        provider: `openrouter_${tierLabel}`,
        api_key_present: true,
        api_key_source: "OPENROUTER_API_KEY",
        model, endpoint,
        status: 404,
        status_text: "model not in catalog",
        ok: false,
        error: `Model "${model}" non presente nel catalog OpenRouter`,
      };
    }
    // 2) POST reale chat/completions con immagine minimal
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const postResp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://debug.local",
        "X-Title": "debug-ai-providers",
      },
      body: JSON.stringify({
        model,
        modalities: ["image", "text"],
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Echo this 1x1 image unchanged." },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${TINY_PNG_B64}` },
            },
          ],
        }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await postResp.text();
    let hasImage = false;
    try {
      const j = JSON.parse(text);
      const c = j?.choices?.[0]?.message;
      hasImage = !!(c?.images?.length) ||
        (typeof c?.content === "string" && c.content.includes("data:image"));
    } catch { /* hasImage false */ }
    return {
      provider: `openrouter_${tierLabel}`,
      api_key_present: true,
      api_key_source: "OPENROUTER_API_KEY",
      model, endpoint,
      status: postResp.status,
      status_text: postResp.statusText,
      ok: postResp.ok && hasImage,
      response_excerpt: text.substring(0, 700),
      error: postResp.ok && !hasImage
        ? "200 OK ma nessuna immagine in choices[0].message.images"
        : undefined,
    };
  } catch (e) {
    return {
      provider: `openrouter_${tierLabel}`,
      api_key_present: true,
      api_key_source: "OPENROUTER_API_KEY",
      model, endpoint,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function testOpenAI(): Promise<ProviderTest> {
  // Allineato a _shared/ai-provider/image.ts v8.4.1: il modello reale e'
  // "gpt-image-1" (no .5). gpt-image-1.5 era un nome ipotetico mai esistito
  // sul portale OpenAI Images API → causava 404 sui debug check.
  const model = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() ||
    Deno.env.get("RENDER_OPENAI_IMAGE_MODEL")?.trim() ||
    "gpt-image-1";
  const endpoint = "https://api.openai.com/v1/models";
  const key = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (!key) {
    return {
      provider: "openai_direct",
      api_key_present: false,
      model, endpoint,
      ok: false,
      error: "OPENAI_API_KEY non configurata",
    };
  }
  try {
    const resp = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    let modelFound = false;
    if (resp.ok) {
      const json = await resp.json().catch(() => null);
      if (json && Array.isArray(json.data)) {
        modelFound = json.data.some((m: { id: string }) => m.id === model);
      }
    }
    return {
      provider: "openai_direct",
      api_key_present: true,
      api_key_source: "OPENAI_API_KEY",
      model, endpoint,
      status: resp.status,
      status_text: resp.statusText,
      ok: resp.ok,
      response_excerpt: JSON.stringify({ model_in_catalog: modelFound }),
    };
  } catch (e) {
    return {
      provider: "openai_direct",
      api_key_present: true,
      model, endpoint,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Real end-to-end test: chiama editImage() come fa il preventivatore reale.
// Restituisce providerUsed, attempts, attemptHistory completi.
async function testFullEditImage() {
  // Crea Blob da una TINY png (1×1 trasparente). Il test serve a verificare
  // il PATH del codice, non la qualità del render.
  const binStr = atob(TINY_PNG_B64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/png" });
  try {
    const result = await editImage({
      prompt: "Replace the existing frame with a modern PVC window. Keep the same wall opening, sill and surrounding geometry.",
      sourceImageBlob: blob,
      effectiveWidth: 1,
      effectiveHeight: 1,
      timeoutMs: 60_000,
      metadata: {
        task_kind: "debug_e2e_test",
        company_id: null,
        session_id: "debug-e2e",
      },
    });
    return {
      ok: true,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      attempts: result.attempts,
      attemptHistory: result.attemptHistory,
      latencyMs: result.latencyMs,
      imageBytes: result.imageDataUrl.length,
    };
  } catch (e) {
    const err = e as { message?: string; attemptHistory?: unknown };
    return {
      ok: false,
      error: err.message ?? String(e),
      attemptHistory: err.attemptHistory ?? null,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const url = new URL(req.url);
  // Modalità "full": testa l'editImage() reale del path produzione.
  if (url.searchParams.get("mode") === "full") {
    const result = await testFullEditImage();
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  // Token guard minimo: pass header `x-debug-token` per evitare endpoint pubblico
  const expected = Deno.env.get("DEBUG_TOKEN");
  const given = req.headers.get("x-debug-token");
  if (expected && given !== expected) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  const [gemini, orGemini, orOpenai, openai, openrouterOpenaiModels] = await Promise.all([
    testGemini(),
    testOpenRouter("google/gemini-2.5-flash-image", "gemini"),
    testOpenRouter(
      // Allineato a _shared/ai-provider/image.ts: default OpenRouter OpenAI
      // image model e' "openai/gpt-5-image". Il vecchio "openai/gpt-image-1.5"
      // non e' mai esistito nel catalog OpenRouter.
      Deno.env.get("OPENROUTER_OPENAI_IMAGE_MODEL")?.trim() ||
        Deno.env.get("RENDER_OPENROUTER_OPENAI_IMAGE_MODEL")?.trim() ||
        "openai/gpt-5-image",
      "openai",
    ),
    testOpenAI(),
    listOpenRouterModels("openai/"),
  ]);
  const result = {
    timestamp: new Date().toISOString(),
    chain: [gemini, orGemini, orOpenai, openai],
    summary: {
      gemini_ok: gemini.ok,
      openrouter_gemini_ok: orGemini.ok,
      openrouter_openai_ok: orOpenai.ok,
      openai_direct_ok: openai.ok,
      first_working_tier: [gemini, orGemini, orOpenai, openai].findIndex((p) => p.ok) + 1,
    },
    discovery: {
      // Aiuta a trovare il nome corretto del modello image OpenRouter
      // (es. il default 'openai/gpt-5-image' potrebbe essere stato rinominato)
      openrouter_openai_image_models: openrouterOpenaiModels.filter(
        (m) => m.includes("image") || m.includes("dall"),
      ),
    },
    env_check: {
      DEBUG_TOKEN_set: !!expected,
      url: url.pathname,
    },
  };
  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
