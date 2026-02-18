import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function mapAccountStatus(reviewStatus: string | undefined): string {
  if (!reviewStatus) return "not_verified";
  switch (reviewStatus.toUpperCase()) {
    case "APPROVED":
      return "verified";
    case "PENDING":
      return "pending";
    default:
      return "not_verified";
  }
}

function mapQualityRating(rating: string | undefined): string {
  if (!rating) return "none";
  switch (rating.toUpperCase()) {
    case "GREEN":
      return "green";
    case "YELLOW":
      return "yellow";
    case "RED":
      return "red";
    default:
      return "none";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify user auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  let userId: string;
  try {
    const { data: claimsData, error: claimsErr } =
      await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      const { data: userData, error: userErr } =
        await supabaseAuth.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    } else {
      userId = claimsData.claims.sub as string;
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { company_id } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "Missing company_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify user belongs to company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile || profile.company_id !== company_id) {
      return new Response(
        JSON.stringify({ error: "Not authorized for this company" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get WhatsApp config
    const { data: config, error: configErr } = await supabase
      .from("messaging_whatsapp_config")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    if (configErr || !config || !config.is_connected) {
      return new Response(
        JSON.stringify({ error: "WhatsApp not connected" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = config.access_token_encrypted;
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "No access token available" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let accountStatus = config.account_status;
    let qualityRating = config.quality_rating;
    let messagingLimitTier: string | null = null;

    // Fetch WABA account status
    if (config.waba_id) {
      try {
        const wabaRes = await fetch(
          `https://graph.facebook.com/v21.0/${config.waba_id}?fields=account_review_status,business_verification_status&access_token=${accessToken}`
        );
        const wabaData = await wabaRes.json();
        if (!wabaData.error) {
          accountStatus = mapAccountStatus(wabaData.account_review_status);
        } else {
          console.error("WABA status error:", wabaData.error);
        }
      } catch (e) {
        console.error("WABA fetch error:", e);
      }
    }

    // Fetch phone number quality and limits
    if (config.phone_number_id) {
      try {
        const phoneRes = await fetch(
          `https://graph.facebook.com/v21.0/${config.phone_number_id}?fields=quality_rating,messaging_limit_tier,display_phone_number,verified_name&access_token=${accessToken}`
        );
        const phoneData = await phoneRes.json();
        if (!phoneData.error) {
          qualityRating = mapQualityRating(phoneData.quality_rating);
          messagingLimitTier = phoneData.messaging_limit_tier || null;
        } else {
          console.error("Phone status error:", phoneData.error);
        }
      } catch (e) {
        console.error("Phone fetch error:", e);
      }
    }

    // Update config in DB
    const { error: updateErr } = await supabase
      .from("messaging_whatsapp_config")
      .update({
        account_status: accountStatus,
        quality_rating: qualityRating,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", company_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        account_status: accountStatus,
        quality_rating: qualityRating,
        messaging_limit_tier: messagingLimitTier,
        updated_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("whatsapp-status error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
