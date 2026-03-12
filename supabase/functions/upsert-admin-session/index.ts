import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Use getUser() — the correct Supabase JS v2 method
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const userId = user.id;

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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
