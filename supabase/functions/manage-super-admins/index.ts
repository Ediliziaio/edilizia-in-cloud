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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is a super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is super_admin
    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden: not a super admin" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...body } = await req.json();

    // === LIST ===
    if (action === "list") {
      const { data: roles, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");

      if (error) throw new Error(error.message);

      const userIds = roles?.map((r) => r.user_id) || [];
      if (userIds.length === 0) {
        return new Response(JSON.stringify({ admins: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email, created_at")
        .in("id", userIds);

      if (profilesError) throw new Error(profilesError.message);

      return new Response(JSON.stringify({ admins: profiles || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === CREATE ===
    if (action === "create") {
      const { email, password, firstName, lastName } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email e password obbligatori" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (password.length < 8) {
        return new Response(JSON.stringify({ error: "La password deve avere almeno 8 caratteri" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (authError) throw new Error(authError.message);

      const userId = authData.user.id;

      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: userId, email, first_name: firstName || "Super", last_name: lastName || "Admin", company_id: null,
      });
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(profileError.message);
      }

      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId, role: "super_admin",
      });
      if (roleError) {
        await supabaseAdmin.from("profiles").delete().eq("id", userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(roleError.message);
      }

      return new Response(JSON.stringify({ success: true, userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === DELETE ===
    if (action === "delete") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId obbligatorio" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (userId === callerId) {
        return new Response(JSON.stringify({ error: "Non puoi eliminare te stesso" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check at least 1 admin remains
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "super_admin");

      if ((count || 0) <= 1) {
        return new Response(JSON.stringify({ error: "Impossibile eliminare l'ultimo super admin" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "super_admin");
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === STATS ===
    if (action === "stats") {
      const [companies, profiles, orders] = await Promise.all([
        supabaseAdmin.from("companies").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("orders").select("*", { count: "exact", head: true }),
      ]);

      return new Response(JSON.stringify({
        totalCompanies: companies.count || 0,
        totalUsers: profiles.count || 0,
        totalOrders: orders.count || 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Azione non valida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
