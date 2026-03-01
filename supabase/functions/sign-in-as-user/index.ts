import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { recordMetric } from "../_shared/healthMetrics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let statusCode = 200;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      statusCode = 401;
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    let callerId: string | null = null;
    try {
      const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(
        authHeader.replace("Bearer ", "")
      );
      if (!claimsError && claimsData?.claims?.sub) {
        callerId = claimsData.claims.sub as string;
      }
    } catch {
      // fallback
    }
    if (!callerId) {
      const { data: userData } = await callerClient.auth.getUser();
      callerId = userData?.user?.id ?? null;
    }

    if (!callerId) {
      statusCode = 401;
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 10 calls per 5 minutes per user
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
      return rateLimitResponse(rl.retryAfterSeconds!, corsHeaders);
    }

    const { email, return_to_admin } = await req.json();
    if (!email) {
      statusCode = 400;
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check super_admin role of caller
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      if (!return_to_admin) {
        statusCode = 403;
        return new Response(JSON.stringify({ error: "Only super admins can use this feature" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      const targetUserId = targetProfile?.id;
      
      if (!targetUserId) {
        statusCode = 404;
        return new Response(JSON.stringify({ error: "Target user not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: targetRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId)
        .eq("role", "super_admin")
        .maybeSingle();

      if (!targetRole) {
        statusCode = 403;
        return new Response(JSON.stringify({ error: "Can only return to a super admin account" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generate magic link
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !linkData) {
      console.error("generateLink error:", linkError);
      statusCode = 500;
      return new Response(
        JSON.stringify({ error: linkError?.message || "Failed to generate link" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Enhanced audit log with session details
    await adminClient.from("admin_audit_log").insert({
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
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("sign-in-as-user error:", err);
    statusCode = 500;
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
