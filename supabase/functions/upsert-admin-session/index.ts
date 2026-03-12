import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");
    const userId = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify super_admin role
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!role) throw new Error("Not super admin");

    const body = await req.json().catch(() => ({}));
    const deviceHint = body.device_hint ?? null;
    const ipAddress = body.ip_address ?? req.headers.get("x-forwarded-for") ?? null;

    const sessionToken = crypto.randomUUID();

    await supabaseAdmin
      .from("admin_sessions")
      .insert({
        user_id: userId,
        session_token: sessionToken,
        device_hint: deviceHint,
        ip_address: ipAddress,
        last_seen_at: new Date().toISOString(),
      });

    // Keep max 5 sessions per admin
    const { data: allSessions } = await supabaseAdmin
      .from("admin_sessions")
      .select("id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if ((allSessions?.length ?? 0) > 5) {
      const toDelete = (allSessions ?? []).slice(5).map((s: any) => s.id);
      await supabaseAdmin
        .from("admin_sessions")
        .delete()
        .in("id", toDelete);
    }

    return new Response(
      JSON.stringify({ ok: true, session_token: sessionToken }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});