import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is super_admin
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, return_to_admin } = await req.json();
    if (!email) {
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
      // If not super_admin, only allow return_to_admin flow
      // where target email must belong to a super_admin
      if (!return_to_admin) {
        return new Response(JSON.stringify({ error: "Only super admins can use this feature" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify the target email belongs to a super_admin
      const { data: targetUser } = await adminClient.auth.admin.listUsers();
      const targetUserId = targetUser?.users?.find((u: any) => u.email === email)?.id;
      
      if (!targetUserId) {
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
      return new Response(
        JSON.stringify({ error: linkError?.message || "Failed to generate link" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Log the impersonation
    await adminClient.from("admin_audit_log").insert({
      user_id: callerId,
      action: "sign_in_as_user",
      target_type: "user",
      target_id: email,
      details: { target_email: email },
    });

    // Return the hashed_token and email for verifyOtp
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
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
