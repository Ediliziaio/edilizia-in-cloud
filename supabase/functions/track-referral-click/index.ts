import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
      .select("id, referral_code")
      .eq("referral_code", referral_code)
      .eq("is_active", true)
      .single();

    if (!referrer) {
      return new Response(JSON.stringify({ error: "Invalid referral code" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const normalizedLanding = String(landing_page || "/").slice(0, 500);
    const device_hash = await sha256(`${ip_address || ""}|${user_agent || ""}`);
    const dedupe_key = await sha256(`${referrer.id}|${device_hash}|${new Date().toISOString().slice(0, 10)}|${normalizedLanding}`);
    const dedupeSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: existingClick } = await supabase
      .from("referral_clicks")
      .select("id")
      .eq("referrer_id", referrer.id)
      .eq("dedupe_key", dedupe_key)
      .gte("created_at", dedupeSince)
      .maybeSingle();

    if (existingClick?.id) {
      await supabase.rpc("log_referral_event", {
        p_event_type: "click",
        p_referrer_id: referrer.id,
        p_referral_code: referral_code,
        p_click_id: existingClick.id,
        p_event_payload: {
          deduped: true,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          landing_page: normalizedLanding,
        },
        p_ip_address: ip_address,
        p_user_agent: user_agent,
      });

      return new Response(
        JSON.stringify({ success: true, click_id: existingClick.id, deduped: true }),
        {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Record click
    const { data: click, error: clickError } = await supabase
      .from("referral_clicks")
      .insert({
        referrer_id: referrer.id,
        referral_code,
        ip_address,
        user_agent,
        device_hash,
        dedupe_key,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        landing_page: normalizedLanding,
      })
      .select("id")
      .single();

    if (clickError) throw clickError;

    // Increment total_clicks
    await supabase.rpc("increment_referrer_clicks", {
      p_referrer_id: referrer.id,
    });

    await supabase.rpc("increment_referral_link_clicks", {
      p_referrer_id: referrer.id,
      p_referral_code: referral_code,
    });

    await supabase.rpc("log_referral_event", {
      p_event_type: "click",
      p_referrer_id: referrer.id,
      p_referral_code: referral_code,
      p_click_id: click?.id || null,
      p_event_payload: {
        deduped: false,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        landing_page: normalizedLanding,
      },
      p_ip_address: ip_address,
      p_user_agent: user_agent,
    });

    return new Response(
      JSON.stringify({ success: true, click_id: click?.id }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
