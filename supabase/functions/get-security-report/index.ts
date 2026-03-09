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
    await requireRole(supabaseAdmin, userId, ["company_admin", "super_admin"], corsHeaders);

    const body = await req.json().catch(() => ({}));
    const { section } = body; // overview, sessions, login_attempts, audit_log, users_security

    // Get actor's company_id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyId = profile.company_id;
    const result: Record<string, unknown> = {};

    // --- OVERVIEW ---
    if (!section || section === "overview") {
      // Active sessions count
      const { count: activeSessions } = await supabaseAdmin
        .from("user_sessions")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_active", true);

      // Failed login attempts last 24h
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: failedAttempts24h } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("success", false)
        .gte("created_at", since24h)
        .in("user_id", (
          await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("company_id", companyId)
        ).data?.map((p: any) => p.id) || []);

      // Locked accounts
      const { data: lockedUsers } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, locked_until")
        .eq("company_id", companyId)
        .not("locked_until", "is", null)
        .gt("locked_until", new Date().toISOString());

      // Users without 2FA when company enforces it
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("enforce_2fa, max_failed_attempts, password_expiry_days")
        .eq("id", companyId)
        .single();

      // Users with expired passwords
      let expiredPasswordCount = 0;
      if (company?.password_expiry_days && company.password_expiry_days > 0) {
        const expiryDate = new Date(
          Date.now() - company.password_expiry_days * 24 * 60 * 60 * 1000
        ).toISOString();

        const { count } = await supabaseAdmin
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId)
          .or(`password_changed_at.is.null,password_changed_at.lt.${expiryDate}`);

        expiredPasswordCount = count || 0;
      }

      // Total users
      const { count: totalUsers } = await supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId);

      result.overview = {
        active_sessions: activeSessions || 0,
        failed_attempts_24h: failedAttempts24h || 0,
        locked_accounts: lockedUsers || [],
        locked_count: lockedUsers?.length || 0,
        total_users: totalUsers || 0,
        expired_passwords: expiredPasswordCount,
        company_settings: company,
      };
    }

    // --- SESSIONS ---
    if (!section || section === "sessions") {
      const { data: sessions } = await supabaseAdmin
        .from("user_sessions")
        .select("*, profiles:user_id(first_name, last_name, email)")
        .eq("company_id", companyId)
        .order("started_at", { ascending: false })
        .limit(100);

      result.sessions = sessions || [];
    }

    // --- LOGIN ATTEMPTS ---
    if (section === "login_attempts") {
      const { data: companyUsers } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("company_id", companyId);

      const userIds = companyUsers?.map((u: any) => u.id) || [];

      const { data: attempts } = await supabaseAdmin
        .from("login_attempts")
        .select("*")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(200);

      result.login_attempts = attempts || [];
    }

    // --- AUDIT LOG ---
    if (section === "audit_log") {
      const { data: logs } = await supabaseAdmin
        .from("user_audit_log")
        .select(`
          *,
          actor:actor_id(first_name, last_name, email),
          target:target_user_id(first_name, last_name, email)
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);

      result.audit_log = logs || [];
    }

    // --- USERS SECURITY STATUS ---
    if (section === "users_security") {
      const { data: users } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email, last_login_at, last_login_ip, failed_login_count, locked_until, require_2fa, password_changed_at")
        .eq("company_id", companyId)
        .order("last_login_at", { ascending: false, nullsFirst: false });

      result.users_security = users || [];
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("get-security-report error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
