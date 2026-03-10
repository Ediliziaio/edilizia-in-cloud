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
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return errorResponse("Unauthorized", 401);

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) return errorResponse("No company", 400);

    const { connection_id } = await req.json();
    if (!connection_id) return errorResponse("connection_id richiesto", 400);

    const { data: conn } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("id", connection_id)
      .eq("company_id", profile.company_id)
      .single();

    if (!conn) return errorResponse("Connessione non trovata", 404);

    // Fix 10: clean state on disconnect — clear error_message and operational fields
    await supabase.from("bank_connections").update({
      status: "disconnected",
      error_message: null,
    }).eq("id", connection_id);

    await supabase.from("bank_accounts").update({ is_active: false }).eq("connection_id", connection_id);

    // Try to revoke on GoCardless (non-critical)
    try {
      if (conn.requisition_id) {
        const token = await getGoCardlessToken();
        await fetch(`https://bankaccountdata.gocardless.com/api/v2/requisitions/${conn.requisition_id}/`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (e) {
      console.warn("GoCardless revoke failed (non-critical):", e);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    console.error("bank-disconnect error:", e);
    return errorResponse(e.message, 500);
  }
});
