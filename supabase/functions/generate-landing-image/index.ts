import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated user
    await requireAuth(req, corsHeaders);

    const { prompt } = await req.json();
    if (!prompt) {
      return errorResponse("prompt is required", 400);
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Use DALL-E 3 for image generation
    const response = await fetch("https://api.openai.com/v1/images/generations", {
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

    return jsonResponse({ imageUrl });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("generate-landing-image error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
