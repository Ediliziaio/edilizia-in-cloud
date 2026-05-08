import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { chargeAndLogDirect, estimateDallECostUsd } from "../_shared/ai-provider/directApi.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    // Platform asset generation is a SuperAdmin-only operation. It uses
    // platform OpenAI credentials and must not be burnable by tenant users.
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    const { prompt } = await req.json();
    if (!prompt) {
      return errorResponse("prompt is required", 400);
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Use DALL-E 3 for image generation
    const startedAt = Date.now();
    const response = await fetchWithTimeout("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "url",
        quality: "standard",
      }),
      timeoutMs: 90_000,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return errorResponse("Rate limit exceeded, please try again later.", 429);
      }
      if (response.status === 402) {
        return errorResponse("Payment required.", 402);
      }
      const errorText = await response.text();
      console.error("OpenAI image error:", response.status, errorText);
      throw new Error(`OpenAI image error: ${response.status}`);
    }

    const data = await response.json();
    // DALL-E 3 response: { data: [{ url: "..." }] }
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error("No image returned from OpenAI");
    }

    await chargeAndLogDirect({
      supabase: supabaseAdmin,
      company_id: null,
      task_kind: "image_landing",
      model_used: "openai/dall-e-3",
      cost_usd_real: Number(
        Deno.env.get("AI_DALLE3_STANDARD_1024_USD")
          ?? estimateDallECostUsd({ model: "dall-e-3", size: "1024x1024", quality: "standard" }),
      ),
      cost_is_estimated: true,
      metadata: {
        user_id: userId,
        size: "1024x1024",
        quality: "standard",
        duration_ms: Date.now() - startedAt,
        operation: "generate_landing_image",
      },
    });

    return jsonResponse({ imageUrl });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("generate-landing-image error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
