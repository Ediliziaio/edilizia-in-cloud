import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { recordMetric } from "../_shared/healthMetrics.ts";

import { corsHeaders, getCorsHeaders, secureHeaders } from "../_shared/headers.ts";

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
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const startTime = Date.now();
  let statusCode = 200;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is a super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
          status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
        status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 30 calls per 5 minutes for admin operations
    const rl = await checkRateLimit({
      functionName: "manage-super-admins",
      callerId,
      maxCalls: 30,
      windowSeconds: 300,
    });
    if (!rl.allowed) {
      statusCode = 429;
      await recordMetric({
        metricType: "rate_limit_hit",
        functionName: "manage-super-admins",
        statusCode: 429,
        metadata: { caller_id: callerId },
      });
      return rateLimitResponse(rl.retryAfterSeconds!, corsHeaders);
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
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === CREATE ===
    if (action === "create") {
      const { email, password, firstName, lastName } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email e password obbligatori" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (password.length < 8) {
        return new Response(JSON.stringify({ error: "La password deve avere almeno 8 caratteri" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === RESET PASSWORD ===
    if (action === "reset-password") {
      const { userId, newPassword } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId obbligatorio" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (userId === callerId) {
        return new Response(JSON.stringify({ error: "Non puoi resettare la tua password da qui. Usa il tab Profilo." }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (!newPassword || newPassword.length < 8) {
        return new Response(JSON.stringify({ error: "La password deve avere almeno 8 caratteri" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === GET PERMISSIONS ===
    if (action === "get-permissions") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId obbligatorio" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabaseAdmin
        .from("super_admin_permissions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ permissions: data }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === UPDATE PERMISSIONS ===
    if (action === "update-permissions") {
      const { userId, permissions } = body;
      if (!userId || !permissions) {
        return new Response(JSON.stringify({ error: "userId e permissions obbligatori" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (userId === callerId) {
        return new Response(JSON.stringify({ error: "Non puoi modificare i tuoi stessi permessi" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Fetch existing permissions to merge (prevents partial update from overwriting unrelated fields)
      const { data: existing } = await supabaseAdmin
        .from("super_admin_permissions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      const merged = {
        can_manage_companies: existing?.can_manage_companies ?? false,
        can_manage_plans: existing?.can_manage_plans ?? false,
        can_manage_tickets: existing?.can_manage_tickets ?? false,
        can_manage_referrals: existing?.can_manage_referrals ?? false,
        can_manage_admins: existing?.can_manage_admins ?? false,
        can_view_platform_stats: existing?.can_view_platform_stats ?? true,
        can_manage_marketing: existing?.can_manage_marketing ?? false,
        allowed_company_ids: existing?.allowed_company_ids ?? null,
        // Now apply only the fields actually present in the incoming permissions object
        ...(permissions.can_manage_companies !== undefined && { can_manage_companies: permissions.can_manage_companies }),
        ...(permissions.can_manage_plans !== undefined && { can_manage_plans: permissions.can_manage_plans }),
        ...(permissions.can_manage_tickets !== undefined && { can_manage_tickets: permissions.can_manage_tickets }),
        ...(permissions.can_manage_referrals !== undefined && { can_manage_referrals: permissions.can_manage_referrals }),
        ...(permissions.can_manage_admins !== undefined && { can_manage_admins: permissions.can_manage_admins }),
        ...(permissions.can_view_platform_stats !== undefined && { can_view_platform_stats: permissions.can_view_platform_stats }),
        ...(permissions.can_manage_marketing !== undefined && { can_manage_marketing: permissions.can_manage_marketing }),
        ...(permissions.allowed_company_ids !== undefined && { allowed_company_ids: permissions.allowed_company_ids }),
      };

      const { error } = await supabaseAdmin
        .from("super_admin_permissions")
        .upsert({
          user_id: userId,
          ...merged,
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === DELETE ===
    if (action === "delete") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId obbligatorio" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (userId === callerId) {
        return new Response(JSON.stringify({ error: "Non puoi eliminare te stesso" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Check at least 1 admin remains
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "super_admin");

      if ((count || 0) <= 1) {
        return new Response(JSON.stringify({ error: "Impossibile eliminare l'ultimo super admin" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === DELETE COMPANY ===
    if (action === "delete-company") {
      const { companyId } = body;
      if (!companyId) {
        return new Response(JSON.stringify({ error: "companyId obbligatorio" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Get company info before deletion for audit
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("name, email")
        .eq("id", companyId)
        .maybeSingle();

      if (!company) {
        return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
          status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { error: deleteError } = await supabaseAdmin
        .from("companies")
        .delete()
        .eq("id", companyId);

      if (deleteError) throw new Error(deleteError.message);

      await logAudit(supabaseAdmin, callerId, "delete_company", "company", companyId, {
        company_name: company.name,
        company_email: company.email,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === LOG IMPERSONATION ===
    if (action === "log-impersonation") {
      const { companyId, companyName } = body;
      await logAudit(supabaseAdmin, callerId, "impersonate_company", "company", companyId, {
        company_name: companyName || companyId,
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === GET SETTINGS ===
    if (action === "get-settings") {
      const allSettingsKeys = [
        "meta_app_id", "meta_app_secret",
        "google_maps_api_key", "whatsapp_verify_token",
        "stripe_publishable_key", "stripe_secret_key", "stripe_webhook_secret", "stripe_mode",
        "google_calendar_client_id", "google_calendar_client_secret",
        "google_calendar_allow_two_way", "google_calendar_allow_guest_contact_create", "google_calendar_allow_google_to_crm_import",
      ];

      const { data: settings } = await supabaseAdmin
        .from("platform_settings")
        .select("key, value, updated_at")
        .in("key", allSettingsKeys);

      const result: Record<string, { value: string; masked?: string; updated_at?: string }> = {};
      const secretKeys = [
        "meta_app_secret", "google_maps_api_key", "whatsapp_verify_token",
        "stripe_secret_key", "stripe_webhook_secret",
        "google_calendar_client_secret",
      ];
      for (const s of settings || []) {
        if (secretKeys.includes(s.key) && s.value) {
          const masked = s.value.length > 4 ? "••••" + s.value.slice(-4) : "••••";
          result[s.key] = { value: masked, masked: masked, updated_at: s.updated_at };
        } else {
          result[s.key] = { value: s.value, updated_at: s.updated_at };
        }
      }

      return new Response(JSON.stringify({ settings: result }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === UPDATE SETTINGS ===
    if (action === "update-settings") {
      const { settings: newSettings } = body;
      if (!newSettings || typeof newSettings !== "object") {
        return new Response(JSON.stringify({ error: "settings object required" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const allowedKeys = [
        "meta_app_id", "meta_app_secret",
        "google_maps_api_key", "whatsapp_verify_token",
        "stripe_publishable_key", "stripe_secret_key", "stripe_webhook_secret", "stripe_mode",
        "google_calendar_client_id", "google_calendar_client_secret",
        "google_calendar_allow_two_way", "google_calendar_allow_guest_contact_create", "google_calendar_allow_google_to_crm_import",
      ];
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Azione non valida" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    statusCode = 500;
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } finally {
    await recordMetric({
      metricType: "edge_function_call",
      functionName: "manage-super-admins",
      statusCode,
      latencyMs: Date.now() - startTime,
    });
  }
});
