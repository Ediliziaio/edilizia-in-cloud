import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getGoCardlessToken, gcFetch } from "../_shared/goCardless.ts";

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

    const token = await getGoCardlessToken();
    const { data: institutions } = await gcFetch(`/institutions/?country=${country}`, token);

    return jsonResponse({ success: true, institutions });
  } catch (e) {
    console.error("bank-list-institutions error:", e);
    return errorResponse(e.message, 500);
  }
});
