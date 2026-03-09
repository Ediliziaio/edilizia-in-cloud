import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (Deno.env.get("IP_HASH_SALT") || "attr-salt-2024"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function detectDevice(ua: string): { device_type: string; browser: string; os: string } {
  const device_type = /Mobile|Android|iPhone/i.test(ua)
    ? "mobile"
    : /Tablet|iPad/i.test(ua)
    ? "tablet"
    : "desktop";

  let browser = "other";
  if (/Chrome/i.test(ua) && !/Edge|OPR/i.test(ua)) browser = "chrome";
  else if (/Firefox/i.test(ua)) browser = "firefox";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "safari";
  else if (/Edge/i.test(ua)) browser = "edge";
  else if (/OPR|Opera/i.test(ua)) browser = "opera";

  let os = "other";
  if (/Windows/i.test(ua)) os = "windows";
  else if (/Mac OS/i.test(ua)) os = "macos";
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = "linux";
  else if (/Android/i.test(ua)) os = "android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "ios";

  return { device_type, browser, os };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const {
      company_id,
      session_id,
      visitor_id,
      landing_page,
      landing_url,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      gclid,
      fbclid,
      ttclid,
      msclkid,
      li_fat_id,
    } = body;

    if (!company_id || !session_id) {
      return new Response(
        JSON.stringify({ error: "company_id and session_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify company exists
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id")
      .eq("id", company_id)
      .maybeSingle();

    if (companyErr || !company) {
      return new Response(
        JSON.stringify({ error: "Invalid company_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash IP
    const clientIP =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const ip_hash = await hashIP(clientIP);

    // Device detection
    const ua = req.headers.get("user-agent") || "";
    const { device_type, browser, os } = detectDevice(ua);

    const resolvedLandingUrl = landing_url || landing_page || null;

    // Upsert session using unique constraint (company_id, session_id)
    const { data, error } = await supabase
      .from("attribution_sessions")
      .upsert(
        {
          company_id,
          session_id,
          visitor_id: visitor_id || null,
          landing_page: resolvedLandingUrl,
          landing_url: resolvedLandingUrl,
          referrer: referrer || null,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
          gclid: gclid || null,
          fbclid: fbclid || null,
          ttclid: ttclid || null,
          msclkid: msclkid || null,
          li_fat_id: li_fat_id || null,
          device_type,
          browser,
          os,
          ip_hash,
          user_agent: ua || null,
        },
        { onConflict: "company_id,session_id", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (error) {
      console.error("Upsert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to capture session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, session_db_id: data?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Attribution capture error:", e);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
