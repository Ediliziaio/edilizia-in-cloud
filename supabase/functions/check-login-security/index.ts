import { requireAuth } from "../_shared/auth.ts";

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
    // This function can be called without auth (pre-login check)
    // or with auth for admin IP allowlist management
    const { email, ip_address, user_agent } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Find user by email
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, failed_login_count, locked_until")
      .eq("email", email)
      .maybeSingle();

    if (!profile) {
      // Log failed attempt for unknown email
      await supabaseAdmin.from("login_attempts").insert([{
        email,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
        success: false,
        failure_reason: "unknown_email",
      }]);

      return new Response(
        JSON.stringify({ allowed: false, reason: "unknown_email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if account is locked
    if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
      await supabaseAdmin.from("login_attempts").insert([{
        email,
        user_id: profile.id,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
        success: false,
        failure_reason: "account_locked",
      }]);

      return new Response(
        JSON.stringify({ allowed: false, reason: "account_locked", locked_until: profile.locked_until }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check IP allowlist if company has one configured
    if (profile.company_id && ip_address) {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("allowed_ips, max_failed_attempts, lockout_duration_minutes")
        .eq("id", profile.company_id)
        .single();

      if (company?.allowed_ips && company.allowed_ips.length > 0) {
        const isAllowed = company.allowed_ips.some((allowedIp: string) => {
          // Simple exact match or CIDR prefix match
          if (allowedIp === ip_address) return true;
          // Basic CIDR support: check if IP starts with the network part
          if (allowedIp.includes("/")) {
            const [network] = allowedIp.split("/");
            return ip_address.startsWith(network.split(".").slice(0, 3).join("."));
          }
          return false;
        });

        if (!isAllowed) {
          await supabaseAdmin.from("login_attempts").insert([{
            email,
            user_id: profile.id,
            ip_address: ip_address || null,
            user_agent: user_agent || null,
            success: false,
            failure_reason: "ip_not_allowed",
          }]);

          return new Response(
            JSON.stringify({ allowed: false, reason: "ip_not_allowed" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Check brute force protection
      const maxAttempts = company?.max_failed_attempts || 5;
      if ((profile.failed_login_count || 0) >= maxAttempts) {
        const lockoutMinutes = company?.lockout_duration_minutes ?? 30;
        // lockoutMinutes === 0 means manual unlock only (lock far into the future)
        const lockMs = lockoutMinutes === 0 ? 365 * 24 * 60 * 60 * 1000 : lockoutMinutes * 60 * 1000;
        const lockUntil = new Date(Date.now() + lockMs).toISOString();
        await supabaseAdmin
          .from("profiles")
          .update({ locked_until: lockUntil } as any)
          .eq("id", profile.id);

        // Log audit event
        await supabaseAdmin.from("user_audit_log").insert([{
          actor_id: profile.id,
          company_id: profile.company_id,
          action: "account_locked",
          target_user_id: profile.id,
          details: { reason: "max_failed_attempts", failed_count: profile.failed_login_count },
        }]);

        await supabaseAdmin.from("login_attempts").insert([{
          email,
          user_id: profile.id,
          ip_address: ip_address || null,
          user_agent: user_agent || null,
          success: false,
          failure_reason: "account_auto_locked",
        }]);

        return new Response(
          JSON.stringify({ allowed: false, reason: "account_locked", locked_until: lockUntil }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // All checks passed
    return new Response(
      JSON.stringify({ allowed: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-login-security error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
