import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { recordMetric } from "../_shared/healthMetrics.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

/**
 * sign-in-as-user
 *
 * Privileged: solo super_admin (auth check inline via requireAuth + requireRole).
 * Genera magic link per impersonificare un utente target o tornare al proprio
 * super_admin originale (return_to_admin = true).
 *
 * S2-04: standardizzato sull'helper _shared/auth.ts.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  const startTime = Date.now();
  let statusCode = 200;
  let callerId: string | null = null;

  try {
    // 1. Auth header valido + JWT decodificato
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    callerId = userId;

    // 2. Rate limit prima del role check (anti-DoS lato auth caller)
    const rl = await checkRateLimit({
      functionName: "sign-in-as-user",
      callerId,
      maxCalls: 10,
      windowSeconds: 300,
    });
    if (!rl.allowed) {
      statusCode = 429;
      await recordMetric({
        metricType: "rate_limit_hit",
        functionName: "sign-in-as-user",
        statusCode: 429,
        metadata: { caller_id: callerId },
      });
      return rateLimitResponse(rl.retryAfterSeconds!, corsH);
    }

    const { email, return_to_admin } = await req.json();
    if (!email) {
      statusCode = 400;
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    // 3. Role check: super_admin obbligatorio, eccetto return_to_admin
    //    (in cui basta che il target sia super_admin).
    try {
      await requireRole(supabaseAdmin, callerId, ["super_admin"], corsH);
    } catch (e) {
      if (!return_to_admin) {
        statusCode = 403;
        if (e instanceof Response) return e;
        throw e;
      }

      // Caso return_to_admin: il caller potrebbe essere un user normale
      // (impersonato), ma deve poter tornare al super_admin originale.
      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      const targetUserId = targetProfile?.id;
      if (!targetUserId) {
        statusCode = 404;
        return new Response(JSON.stringify({ error: "Target user not found" }), {
          status: 404,
          headers: { ...corsH, "Content-Type": "application/json" },
        });
      }
      const { data: targetRole } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!targetRole) {
        statusCode = 403;
        return new Response(
          JSON.stringify({ error: "Can only return to a super admin account" }),
          { status: 403, headers: { ...corsH, "Content-Type": "application/json" } },
        );
      }
    }

    // 4. Generate magic link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !linkData) {
      console.error("[sign-in-as-user] generateLink error:", linkError);
      statusCode = 500;
      return new Response(
        JSON.stringify({ error: linkError?.message || "Failed to generate link" }),
        { status: 500, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    // 5. Audit log
    await supabaseAdmin.from("admin_audit_log").insert({
      user_id: callerId,
      action: return_to_admin ? "return_from_impersonation" : "sign_in_as_user",
      target_type: "user",
      target_id: email,
      details: {
        target_email: email,
        return_to_admin: !!return_to_admin,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        user_agent: req.headers.get("user-agent")?.substring(0, 200) || null,
      },
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
    });

    return new Response(
      JSON.stringify({
        hashed_token: linkData.properties?.hashed_token,
        email: linkData.user?.email,
      }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof Response) {
      statusCode = err.status;
      return err;
    }
    console.error("[sign-in-as-user] error:", err);
    statusCode = 500;
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  } finally {
    await recordMetric({
      metricType: "edge_function_call",
      functionName: "sign-in-as-user",
      statusCode,
      latencyMs: Date.now() - startTime,
    });
  }
});
