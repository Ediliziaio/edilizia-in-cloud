import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Non autenticato", 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await (userClient.auth as any).getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      return errorResponse("Non autenticato", 401);
    }

    const { testo, taskType = "RETRIEVAL_QUERY" } = await req.json();
    if (!testo) return errorResponse("testo richiesto", 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY non configurata");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: testo }] },
          taskType,
        }),
      }
    );

    if (!res.ok) throw new Error(`Embedding error: ${res.status}`);
    const data = await res.json();

    return jsonResponse({ embedding: `[${data.embedding.values.join(",")}]` });
  } catch (err: any) {
    console.error("[embed-query]", err);
    if (err instanceof Response) return err;
    return errorResponse(err.message || "Errore sconosciuto", 500);
  }
});
