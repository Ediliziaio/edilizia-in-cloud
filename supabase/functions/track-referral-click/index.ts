import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { referral_code, utm_source, utm_medium, utm_campaign, landing_page } = body;

    if (!referral_code) {
      return new Response(JSON.stringify({ error: "referral_code required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip_address =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      null;
    const user_agent = req.headers.get("user-agent") || null;

    // Find active referrer
    const { data: referrer } = await supabase
      .from("referrers")
      .select("id")
      .eq("referral_code", referral_code)
      .eq("is_active", true)
      .single();

    if (!referrer) {
      return new Response(JSON.stringify({ error: "Invalid referral code" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record click
    const { data: click } = await supabase
      .from("referral_clicks")
      .insert({
        referrer_id: referrer.id,
        referral_code,
        ip_address,
        user_agent,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        landing_page: landing_page || null,
      })
      .select("id")
      .single();

    // Increment total_clicks
    await supabase.rpc("increment_referrer_clicks", {
      p_referrer_id: referrer.id,
    });

    return new Response(
      JSON.stringify({ success: true, click_id: click?.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
