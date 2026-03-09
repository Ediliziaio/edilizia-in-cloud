import { requireAuth, requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    // Only company_admin or super_admin can revoke sessions
    await requireRole(supabaseAdmin, userId, ["company_admin", "super_admin"], corsHeaders);

    const { session_id, reason, revoke_all_for_user } = await req.json();

    // Get actor's company_id
    const { data: actorProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!actorProfile?.company_id) {
      return new Response(JSON.stringify({ error: "No company found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    if (revoke_all_for_user) {
      // Revoke all active sessions for a specific user
      const { target_user_id } = await req.json().catch(() => ({}));
      const targetId = revoke_all_for_user;

      const { data: updated, error } = await supabaseAdmin
        .from("user_sessions")
        .update({
          is_active: false,
          ended_at: now,
          revoked_by: userId,
          revoke_reason: reason || "Revoked by admin",
        })
        .eq("user_id", targetId)
        .eq("company_id", actorProfile.company_id)
        .eq("is_active", true)
        .select("id");

      if (error) throw error;

      // Audit log
      await supabaseAdmin.from("user_audit_log").insert({
        company_id: actorProfile.company_id,
        actor_id: userId,
        target_user_id: targetId,
        action: "all_sessions_revoked",
        details: { reason, revoked_count: updated?.length || 0 },
      });

      return new Response(
        JSON.stringify({ ok: true, revoked_count: updated?.length || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id or revoke_all_for_user required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Revoke single session - verify it belongs to the same company
    const { data: session } = await supabaseAdmin
      .from("user_sessions")
      .select("id, user_id, company_id")
      .eq("id", session_id)
      .eq("is_active", true)
      .single();

    if (!session || session.company_id !== actorProfile.company_id) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabaseAdmin
      .from("user_sessions")
      .update({
        is_active: false,
        ended_at: now,
        revoked_by: userId,
        revoke_reason: reason || "Revoked by admin",
      })
      .eq("id", session_id);

    if (error) throw error;

    // Audit log
    await supabaseAdmin.from("user_audit_log").insert({
      company_id: actorProfile.company_id,
      actor_id: userId,
      target_user_id: session.user_id,
      action: "session_revoked",
      details: { session_id, reason },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("revoke-user-session error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
