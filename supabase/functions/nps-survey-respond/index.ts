// nps-survey-respond: public endpoint to record NPS survey responses
// Validates token, records score + feedback, marks as responded.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const { token, score, feedback_text } = await req.json();

    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "token_invalid" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (typeof score !== "number" || score < 0 || score > 10) {
      return new Response(JSON.stringify({ error: "invalid_score" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the survey by token
    const { data: survey, error: lookupError } = await supabase
      .from("nps_surveys")
      .select("id, responded_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (lookupError || !survey) {
      return new Response(JSON.stringify({ error: "token_invalid" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check if already responded
    if (survey.responded_at) {
      return new Response(JSON.stringify({ error: "already_responded", success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check expiry
    if (new Date(survey.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "token_expired" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Record response
    const { error: updateError } = await supabase
      .from("nps_surveys")
      .update({
        score,
        feedback_text: feedback_text || null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", survey.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("nps-survey-respond error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
