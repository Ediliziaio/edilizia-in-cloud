import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const { country = "IT" } = await req.json().catch(() => ({}));

    const secretId = await getPlatformSetting("bank_gocardless_secret_id");
    const secretKey = await getPlatformSetting("bank_gocardless_secret_key");
    if (!secretId || !secretKey) return errorResponse("GoCardless non configurato", 400);

    // Get token
    const tokenRes = await fetch("https://bankaccountdata.gocardless.com/api/v2/token/new/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return errorResponse("Token GoCardless fallito", 500);

    // Fetch institutions
    const instRes = await fetch(`https://bankaccountdata.gocardless.com/api/v2/institutions/?country=${country}`, {
      headers: { Authorization: `Bearer ${tokenData.access}` },
    });
    const institutions = await instRes.json();

    return jsonResponse({ success: true, institutions });
  } catch (e) {
    console.error("bank-list-institutions error:", e);
    return errorResponse(e.message, 500);
  }
});
