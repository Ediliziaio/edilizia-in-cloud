import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);

    const formData = await req.formData();
    const audioBlob = formData.get("audio") as Blob;
    const language = (formData.get("language") as string) ?? "it";

    const openaiFormData = new FormData();
    openaiFormData.append("file", audioBlob, "audio.webm");
    openaiFormData.append("model", "whisper-1");
    openaiFormData.append("language", language);
    openaiFormData.append("response_format", "json");

    const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      },
      body: openaiFormData,
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      throw new Error(`OpenAI error: ${openaiRes.status} ${errText}`);
    }

    const data = await openaiRes.json();

    return jsonResponse({ testo: data.text });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : String(err));
  }
});
