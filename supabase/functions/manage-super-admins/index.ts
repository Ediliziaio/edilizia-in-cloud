import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function logAudit(
  supabaseAdmin: any,
  userId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, any> | null
) {
  await supabaseAdmin.from("admin_audit_log").insert({
    user_id: userId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

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

    // Extract user ID with fallback: getClaims -> getUser
    let callerId: string;
    try {
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await (callerClient.auth as any).getClaims(token);
      if (!claimsError && claimsData?.claims?.sub) {
        callerId = claimsData.claims.sub;
      } else {
        throw new Error("getClaims failed");
      }
    } catch {
      const { data: userData, error: userError } = await callerClient.auth.getUser();
      if (userError || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerId = userData.user.id;
    }

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

      const [profilesRes, permsRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, email, created_at")
          .in("id", userIds),
        supabaseAdmin
          .from("super_admin_permissions")
          .select("*")
          .in("user_id", userIds),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);

      const permsMap: Record<string, any> = {};
      (permsRes.data || []).forEach((p: any) => { permsMap[p.user_id] = p; });

      const admins = (profilesRes.data || []).map((profile: any) => ({
        ...profile,
        permissions: permsMap[profile.id] || null,
      }));

      return new Response(JSON.stringify({ admins }), {
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

      // Create default permissions
      await supabaseAdmin.from("super_admin_permissions").insert({ user_id: userId });

      await logAudit(supabaseAdmin, callerId, "create_admin", "user", userId, {
        target_name: `${firstName || "Super"} ${lastName || "Admin"}`,
        email,
      });

      return new Response(JSON.stringify({ success: true, userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === RESET PASSWORD ===
    if (action === "reset-password") {
      const { userId, newPassword } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId obbligatorio" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (userId === callerId) {
        return new Response(JSON.stringify({ error: "Non puoi resettare la tua password da qui. Usa il tab Profilo." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!newPassword || newPassword.length < 8) {
        return new Response(JSON.stringify({ error: "La password deve avere almeno 8 caratteri" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
      if (updateError) throw new Error(updateError.message);

      // Get target name for audit
      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
      await logAudit(supabaseAdmin, callerId, "reset_password", "user", userId, {
        target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : userId,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === GET PERMISSIONS ===
    if (action === "get-permissions") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId obbligatorio" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabaseAdmin
        .from("super_admin_permissions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ permissions: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === UPDATE PERMISSIONS ===
    if (action === "update-permissions") {
      const { userId, permissions } = body;
      if (!userId || !permissions) {
        return new Response(JSON.stringify({ error: "userId e permissions obbligatori" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (userId === callerId) {
        return new Response(JSON.stringify({ error: "Non puoi modificare i tuoi stessi permessi" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin
        .from("super_admin_permissions")
        .upsert({
          user_id: userId,
          can_manage_companies: permissions.can_manage_companies ?? true,
          can_manage_plans: permissions.can_manage_plans ?? true,
          can_manage_tickets: permissions.can_manage_tickets ?? true,
          can_manage_referrals: permissions.can_manage_referrals ?? true,
          can_manage_admins: permissions.can_manage_admins ?? true,
          can_view_platform_stats: permissions.can_view_platform_stats ?? true,
          allowed_company_ids: permissions.allowed_company_ids ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw new Error(error.message);

      // Get target name for audit
      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
      await logAudit(supabaseAdmin, callerId, "update_permissions", "user", userId, {
        target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : userId,
        permissions,
      });

      return new Response(JSON.stringify({ success: true }), {
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

      // Get target name before deleting
      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("first_name, last_name, email").eq("id", userId).maybeSingle();

      await supabaseAdmin.from("super_admin_permissions").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "super_admin");
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);

      await logAudit(supabaseAdmin, callerId, "delete_admin", "user", userId, {
        target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : userId,
        email: targetProfile?.email,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === LOG IMPERSONATION ===
    if (action === "log-impersonation") {
      const { companyId, companyName } = body;
      await logAudit(supabaseAdmin, callerId, "impersonate_company", "company", companyId, {
        company_name: companyName || companyId,
      });
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

    // === GET SETTINGS ===
    if (action === "get-settings") {
      const { data: settings } = await supabaseAdmin
        .from("platform_settings")
        .select("key, value, updated_at")
        .in("key", ["meta_app_id", "meta_app_secret", "google_maps_api_key", "whatsapp_verify_token"]);

      const result: Record<string, { value: string; masked?: string; updated_at?: string }> = {};
      const secretKeys = ["meta_app_secret", "google_maps_api_key", "whatsapp_verify_token"];
      for (const s of settings || []) {
        if (secretKeys.includes(s.key)) {
          const masked = s.value.length > 4 ? "••••" + s.value.slice(-4) : "••••";
          result[s.key] = { value: masked, masked: masked, updated_at: s.updated_at };
        } else {
          result[s.key] = { value: s.value, updated_at: s.updated_at };
        }
      }

      return new Response(JSON.stringify({ settings: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === UPDATE SETTINGS ===
    if (action === "update-settings") {
      const { settings: newSettings } = body;
      if (!newSettings || typeof newSettings !== "object") {
        return new Response(JSON.stringify({ error: "settings object required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allowedKeys = ["meta_app_id", "meta_app_secret", "google_maps_api_key", "whatsapp_verify_token"];
      const updates: { key: string; oldValue?: string }[] = [];

      for (const [key, value] of Object.entries(newSettings)) {
        if (!allowedKeys.includes(key)) continue;
        if (!value || typeof value !== "string" || (value as string).trim() === "") continue;

        // Get old value for audit
        const { data: existing } = await supabaseAdmin
          .from("platform_settings")
          .select("value")
          .eq("key", key)
          .maybeSingle();

        await supabaseAdmin
          .from("platform_settings")
          .upsert({
            key,
            value: (value as string).trim(),
            updated_at: new Date().toISOString(),
            updated_by: callerId,
          }, { onConflict: "key" });

        updates.push({ key, oldValue: existing?.value ? "***" : undefined });
      }

      if (updates.length > 0) {
        await logAudit(supabaseAdmin, callerId, "update_platform_settings", "platform_settings", null, {
          keys_updated: updates.map(u => u.key),
        });
      }

      return new Response(JSON.stringify({ success: true, updated: updates.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Azione non valida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
