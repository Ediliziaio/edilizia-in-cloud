import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getGoCardlessToken } from "../_shared/goCardless.ts";

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

    // Verify super_admin
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
    if (!role) return errorResponse("Forbidden", 403);

    try {
      await getGoCardlessToken();
      return jsonResponse({ success: true, message: "Connessione GoCardless OK" });
    } catch (e) {
      return jsonResponse({ success: false, error: e.message });
    }
  } catch (e) {
    console.error("bank-test-connection error:", e);
    return errorResponse(e.message, 500);
  }
});
