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

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) return errorResponse("No company", 400);

    const { data: company } = await supabase.from("companies").select("tesoreria_enabled").eq("id", profile.company_id).single();
    if (!company?.tesoreria_enabled) return errorResponse("Tesoreria non abilitata", 403);

    const { institution_id, institution_name, institution_logo, redirect_url } = await req.json();
    if (!institution_id || !redirect_url) return errorResponse("institution_id e redirect_url richiesti", 400);

    // Fix 6: Strict redirect URL validation — reject unauthorized origins
    try {
      const redirectOrigin = new URL(redirect_url).origin;
      const isAllowed =
        redirectOrigin.endsWith(".lovable.app") ||
        redirectOrigin.includes("localhost") ||
        redirectOrigin.includes("127.0.0.1");
      if (!isAllowed) {
        console.error(`Redirect URL origin rejected: ${redirectOrigin}`);
        return errorResponse("redirect_url non autorizzato", 403);
      }
    } catch {
      return errorResponse("redirect_url non valido", 400);
    }

    const token = await getGoCardlessToken();

    // Create requisition
    const reference = crypto.randomUUID();
    const { data: requisition } = await gcFetch("/requisitions/", token, {
      method: "POST",
      body: JSON.stringify({
        redirect: redirect_url,
        institution_id,
        reference,
        user_language: "IT",
      }),
    });

    // Calculate expires_at (90 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const { error: insertErr } = await supabase.from("bank_connections").insert({
      company_id: profile.company_id,
      institution_id,
      institution_name: institution_name || institution_id,
      institution_logo: institution_logo || null,
      requisition_id: requisition.id,
      requisition_link: requisition.link,
      status: "authenticating",
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    });

    if (insertErr) return errorResponse(insertErr.message, 500);

    return jsonResponse({
      success: true,
      requisition_id: requisition.id,
      auth_url: requisition.link,
    });
  } catch (e) {
    console.error("bank-connect-start error:", e);
    return errorResponse(e.message, 500);
  }
});
