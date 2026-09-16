import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { recordMetric } from "../_shared/healthMetrics.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { emailCredenziali } from "../_shared/emailCredenziali.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
import { buildStaffPermissionsRecord } from "../_shared/staffPermissionsDefaults.ts";
/**
 * Costruisce e invia l'email di benvenuto al nuovo utente piattaforma con
 * credenziali. Non blocca il flusso se l'email fallisce — l'utente è già
 * stato creato e la password viene comunque ritornata al chiamante.
 */
async function sendWelcomePlatformEmail(
  supabaseAdmin: any,
  params: {
    email: string;
    firstName: string;
    temporaryPassword: string;
    role: string;
    callerCompanyId?: string | null;
  }
): Promise<void> {
  try {
    // Branding: usa la platform_admin_company se disponibile (fallback default)
    const branding = await getBrandingForCompany(supabaseAdmin, params.callerCompanyId ?? null);
    const platformName = branding.platformName;

    const { html, text } = emailCredenziali({
      branding,
      titolo: `Benvenuto in ${platformName}, ${params.firstName}!`,
      intro: `Il tuo account come ${params.role} è stato creato. Di seguito le credenziali per accedere alla piattaforma.`,
      email: params.email,
      password: params.temporaryPassword,
      avviso: "Ti verrà chiesto di cambiare la password al primo accesso.",
    });

    await sendEmailUnified({
      companyId:    params.callerCompanyId ?? null,
      stream:       "transactional",
      to:           [params.email],
      subject:      `Benvenuto in ${platformName} — Le tue credenziali di accesso`,
      html,
      text,
      templateName: "platform_user_invite",
      skipCredits:  true,
      adminClient:  supabaseAdmin,
      metadata:     { role: params.role },
    });
  } catch (err) {
    // Non-blocking: l'utente è creato anche se l'email fallisce
    console.error("[manage-platform-users] welcome email failed:", err);
  }
}

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

const PLATFORM_ROLES = [
  "platform_manager",
  "platform_sales",
  "platform_support",
  "platform_marketing",
  "platform_implementation",
];

const ALL_TEAM_ROLES = ["super_admin", ...PLATFORM_ROLES];

serveConMetriche("manage-platform-users", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const startTime = Date.now();
  let statusCode = 200;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

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
        return errorResponse("Unauthorized", 401);
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
      return errorResponse("Forbidden: not a super admin", 403);
    }

    // Rate limit
    const rl = await checkRateLimit({
      functionName: "manage-platform-users",
      callerId,
      maxCalls: 30,
      windowSeconds: 300,
    });
    if (!rl.allowed) {
      statusCode = 429;
      await recordMetric({
        metricType: "rate_limit_hit",
        functionName: "manage-platform-users",
        statusCode: 429,
        metadata: { caller_id: callerId },
      });
      return rateLimitResponse(rl.retryAfterSeconds!, getCorsHeaders(req));
    }

    const { action, ...body } = await req.json();

    // === LIST PLATFORM TEAM ===
    if (action === "list") {
      // Get all users with platform team roles
      const { data: roles, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("role", ALL_TEAM_ROLES);

      if (error) throw new Error(error.message);

      const userIds = [...new Set((roles || []).map((r: any) => r.user_id))];
      if (userIds.length === 0) {
        return jsonResponse({ users: [] });
      }

      const roleMap: Record<string, string[]> = {};
      for (const r of roles || []) {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      }

      const [profilesRes, permsRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, email, created_at, last_login_at")
          .in("id", userIds),
        supabaseAdmin
          .from("super_admin_permissions")
          .select("*")
          .in("user_id", userIds),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);

      const permsMap: Record<string, any> = {};
      (permsRes.data || []).forEach((p: any) => { permsMap[p.user_id] = p; });

      const users = (profilesRes.data || []).map((profile: any) => ({
        ...profile,
        roles: roleMap[profile.id] || [],
        permissions: permsMap[profile.id] || null,
      }));

      return jsonResponse({ users });
    }

    // === CREATE PLATFORM USER ===
    if (action === "create") {
      const {
        email, password: providedPassword, firstName, lastName, phone,
        platformRole, jobTitle, department, companyAccesses, companyPermissions,
        sendWelcomeEmail,
      } = body;

      if (!email) {
        return errorResponse("Email obbligatoria");
      }

      // Password: usa quella fornita (se >= 8 char) o auto-generata
      const usingProvidedPassword = !!providedPassword && String(providedPassword).length >= 8;
      const password = usingProvidedPassword
        ? String(providedPassword)
        : generateSecurePassword(12);

      if (!platformRole || !PLATFORM_ROLES.includes(platformRole)) {
        return errorResponse("Ruolo piattaforma non valido");
      }

      // Create auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (authError) throw new Error(authError.message);

      const userId = authData.user.id;

      // Create profile (no company_id for platform users) + optional phone
      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: userId,
        email,
        first_name: firstName || "Platform",
        last_name: lastName || "User",
        phone: phone || null,
        company_id: null,
      });
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(profileError.message);
      }

      // Assign platform role
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: platformRole,
      });
      if (roleError) {
        await supabaseAdmin.from("profiles").delete().eq("id", userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(roleError.message);
      }

      // Create permissions with preset
      const presets: Record<string, Record<string, boolean>> = {
        platform_manager: {
          can_manage_companies: true, can_manage_plans: true, can_manage_tickets: true,
          can_manage_referrals: true, can_manage_admins: false, can_view_platform_stats: true,
          can_manage_marketing: true,
        },
        platform_sales: {
          can_manage_companies: true, can_manage_plans: true, can_manage_tickets: false,
          can_manage_referrals: true, can_manage_admins: false, can_view_platform_stats: true,
          can_manage_marketing: false,
        },
        platform_support: {
          can_manage_companies: true, can_manage_plans: false, can_manage_tickets: true,
          can_manage_referrals: false, can_manage_admins: false, can_view_platform_stats: true,
          can_manage_marketing: false,
        },
        platform_marketing: {
          can_manage_companies: false, can_manage_plans: false, can_manage_tickets: false,
          can_manage_referrals: true, can_manage_admins: false, can_view_platform_stats: true,
          can_manage_marketing: true,
        },
        platform_implementation: {
          can_manage_companies: true, can_manage_plans: false, can_manage_tickets: true,
          can_manage_referrals: false, can_manage_admins: false, can_view_platform_stats: true,
          can_manage_marketing: false,
        },
      };

      const preset = presets[platformRole] || {};
      const companyIds = (companyAccesses || []).map((ca: any) => ca.companyId);
      
      await supabaseAdmin.from("super_admin_permissions").insert({
        user_id: userId,
        platform_role: platformRole,
        job_title: jobTitle || null,
        department: department || null,
        allowed_company_ids: companyIds.length > 0 ? companyIds : null,
        ...preset,
      });

      // Insert company accesses into multi_company_access
      const ROLES_NEEDING_PERMS = ["company_staff", "salesperson", "call_center"];
      
      if (companyAccesses && Array.isArray(companyAccesses) && companyAccesses.length > 0) {
        const accessRows = companyAccesses.map((ca: any) => ({
          user_id: userId,
          company_id: ca.companyId,
          access_role: ca.role || "company_staff",
          granted_by: callerId,
        }));

        const { error: accessError } = await supabaseAdmin
          .from("multi_company_access")
          .insert(accessRows);
        if (accessError) throw new Error(`Failed to insert company accesses: ${accessError.message}`);

        // Insert staff_permissions for non-admin companies
        if (companyPermissions) {
          const nonAdminCompanyIds = companyAccesses
            .filter((ca: any) => ROLES_NEEDING_PERMS.includes(ca.role || "company_staff"))
            .map((ca: any) => ca.companyId);

          if (nonAdminCompanyIds.length > 0) {
            // Record completo e filtrato alle chiavi note: una chiave in più nel
            // payload faceva fallire l'insert intero.
            const permRows = nonAdminCompanyIds.map((companyId: string) =>
              buildStaffPermissionsRecord(userId, companyId, companyPermissions),
            );

            const { error: permError } = await supabaseAdmin
              .from("staff_permissions")
              .insert(permRows);
            // Prima l'errore finiva solo nei log: l'utente risultava creato ma
            // entrava nell'azienda senza alcun permesso.
            if (permError) throw new Error(`Failed to insert staff permissions: ${permError.message}`);
          }
        }
      }

      await logAudit(supabaseAdmin, callerId, "create_platform_user", "user", userId, {
        target_name: `${firstName || "Platform"} ${lastName || "User"}`,
        email,
        platform_role: platformRole,
        company_count: companyIds.length,
        welcome_email_requested: sendWelcomeEmail !== false,
      });

      // Welcome email branded — non-blocking. Default true, ma il chiamante
      // può passare sendWelcomeEmail=false per saltarla (utile in import bulk).
      if (sendWelcomeEmail !== false) {
        // Risolvi caller company per il branding (se super admin)
        const { data: callerProfile } = await supabaseAdmin
          .from("profiles")
          .select("company_id")
          .eq("id", callerId)
          .maybeSingle();
        await sendWelcomePlatformEmail(supabaseAdmin, {
          email,
          firstName: firstName || "Utente",
          temporaryPassword: password,
          role: platformRole.replace(/^platform_/, "").replace(/_/g, " "),
          callerCompanyId: callerProfile?.company_id ?? null,
        });
      }

      return jsonResponse({
        success: true,
        userId,
        temporaryPassword: password,
        passwordWasProvided: usingProvidedPassword,
        welcomeEmailSent: sendWelcomeEmail !== false,
      });
    }

    // === DELETE PLATFORM USER ===
    if (action === "delete") {
      const { userId } = body;
      if (!userId) return errorResponse("userId obbligatorio");
      if (userId === callerId) return errorResponse("Non puoi eliminare te stesso");

      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("first_name, last_name, email").eq("id", userId).maybeSingle();

      // Clean up everything
      await supabaseAdmin.from("staff_permissions").delete().eq("user_id", userId);
      await supabaseAdmin.from("super_admin_permissions").delete().eq("user_id", userId);
      await supabaseAdmin.from("multi_company_access").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);

      await logAudit(supabaseAdmin, callerId, "delete_platform_user", "user", userId, {
        target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : userId,
        email: targetProfile?.email,
      });

      return jsonResponse({ success: true });
    }

    // === UPDATE PERMISSIONS ===
    if (action === "update-permissions") {
      const { userId, permissions, platformRole, jobTitle, department } = body;
      if (!userId) return errorResponse("userId obbligatorio");
      if (userId === callerId) return errorResponse("Non puoi modificare i tuoi stessi permessi");

      const updateData: any = {
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      if (permissions) {
        // Fetch existing record to merge — prevents partial update from overwriting unrelated fields
        const { data: existingPerms } = await supabaseAdmin
          .from("super_admin_permissions")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (permissions.can_manage_companies !== undefined) updateData.can_manage_companies = permissions.can_manage_companies;
        else if (existingPerms) updateData.can_manage_companies = existingPerms.can_manage_companies;

        if (permissions.can_manage_plans !== undefined) updateData.can_manage_plans = permissions.can_manage_plans;
        else if (existingPerms) updateData.can_manage_plans = existingPerms.can_manage_plans;

        if (permissions.can_manage_tickets !== undefined) updateData.can_manage_tickets = permissions.can_manage_tickets;
        else if (existingPerms) updateData.can_manage_tickets = existingPerms.can_manage_tickets;

        if (permissions.can_manage_referrals !== undefined) updateData.can_manage_referrals = permissions.can_manage_referrals;
        else if (existingPerms) updateData.can_manage_referrals = existingPerms.can_manage_referrals;

        if (permissions.can_manage_admins !== undefined) updateData.can_manage_admins = permissions.can_manage_admins;
        else if (existingPerms) updateData.can_manage_admins = existingPerms.can_manage_admins;

        if (permissions.can_view_platform_stats !== undefined) updateData.can_view_platform_stats = permissions.can_view_platform_stats;
        else if (existingPerms) updateData.can_view_platform_stats = existingPerms.can_view_platform_stats;

        if (permissions.can_manage_marketing !== undefined) updateData.can_manage_marketing = permissions.can_manage_marketing;
        else if (existingPerms) updateData.can_manage_marketing = existingPerms.can_manage_marketing;

        if (permissions.allowed_company_ids !== undefined) updateData.allowed_company_ids = permissions.allowed_company_ids;
        else if (existingPerms) updateData.allowed_company_ids = existingPerms.allowed_company_ids;
      }

      if (platformRole !== undefined) updateData.platform_role = platformRole;
      if (jobTitle !== undefined) updateData.job_title = jobTitle;
      if (department !== undefined) updateData.department = department;

      // If changing platform role, also update user_roles table
      // Upsert new role first, then remove old ones in a single bulk delete — avoids the window where user has no role
      if (platformRole && PLATFORM_ROLES.includes(platformRole)) {
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: userId, role: platformRole },
          { onConflict: "user_id,role" }
        );
        // Remove all OTHER platform roles in one query
        const rolesToRemove = PLATFORM_ROLES.filter((r) => r !== platformRole);
        if (rolesToRemove.length > 0) {
          await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("user_id", userId)
            .in("role", rolesToRemove);
        }
      }

      const { error } = await supabaseAdmin
        .from("super_admin_permissions")
        .upsert(updateData, { onConflict: "user_id" });

      if (error) throw new Error(error.message);

      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
      await logAudit(supabaseAdmin, callerId, "update_platform_permissions", "user", userId, {
        target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : userId,
        platform_role: platformRole,
        permissions,
      });

      return jsonResponse({ success: true });
    }

    // === LIST MULTI-COMPANY USERS ===
    if (action === "list-multi-company") {
      const { data: roles, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "multi_company_user");

      if (error) throw new Error(error.message);

      const userIds = (roles || []).map((r: any) => r.user_id);
      if (userIds.length === 0) {
        return jsonResponse({ users: [] });
      }

      const [profilesRes, accessRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, email, created_at, last_login_at")
          .in("id", userIds),
        supabaseAdmin
          .from("multi_company_access")
          .select("*, companies:company_id(id, name, logo_url)")
          .in("user_id", userIds),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);

      const accessMap: Record<string, any[]> = {};
      for (const a of accessRes.data || []) {
        if (!accessMap[a.user_id]) accessMap[a.user_id] = [];
        accessMap[a.user_id].push(a);
      }

      const users = (profilesRes.data || []).map((profile: any) => ({
        ...profile,
        accesses: accessMap[profile.id] || [],
      }));

      return jsonResponse({ users });
    }

    // === CREATE MULTI-COMPANY USER ===
    if (action === "create-multi-company") {
      const {
        email, password: providedPassword, firstName, lastName, phone, companyAccesses,
        sendWelcomeEmail,
      } = body;

      if (!email) return errorResponse("Email obbligatoria");
      if (!companyAccesses || !Array.isArray(companyAccesses) || companyAccesses.length === 0) {
        return errorResponse("Seleziona almeno un'azienda");
      }

      // Password: usa quella fornita (>= 8 char) o auto-generata
      const usingProvidedPassword = !!providedPassword && String(providedPassword).length >= 8;
      const password = usingProvidedPassword
        ? String(providedPassword)
        : generateSecurePassword(12);

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (authError) throw new Error(authError.message);

      const userId = authData.user.id;

      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: userId,
        email,
        first_name: firstName || "Multi",
        last_name: lastName || "Company",
        phone: phone || null,
        company_id: null,
      });
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(profileError.message);
      }

      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: "multi_company_user",
      });
      if (roleError) {
        await supabaseAdmin.from("profiles").delete().eq("id", userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(roleError.message);
      }

      // Insert company accesses
      const accessRows = companyAccesses.map((ca: any) => ({
        user_id: userId,
        company_id: ca.companyId,
        access_role: ca.role || "company_staff",
        granted_by: callerId,
      }));

      const { error: accessError } = await supabaseAdmin
        .from("multi_company_access")
        .insert(accessRows);

      if (accessError) throw new Error(`Failed to insert company accesses: ${accessError.message}`);

      await logAudit(supabaseAdmin, callerId, "create_multi_company_user", "user", userId, {
        target_name: `${firstName} ${lastName}`,
        email,
        company_count: companyAccesses.length,
        welcome_email_requested: sendWelcomeEmail !== false,
      });

      // Welcome email — same pattern del create platform
      if (sendWelcomeEmail !== false) {
        const { data: callerProfile } = await supabaseAdmin
          .from("profiles")
          .select("company_id")
          .eq("id", callerId)
          .maybeSingle();
        await sendWelcomePlatformEmail(supabaseAdmin, {
          email,
          firstName: firstName || "Utente",
          temporaryPassword: password,
          role: `Utente Multi-Azienda (${companyAccesses.length} aziende)`,
          callerCompanyId: callerProfile?.company_id ?? null,
        });
      }

      return jsonResponse({
        success: true,
        userId,
        temporaryPassword: password,
        passwordWasProvided: usingProvidedPassword,
        welcomeEmailSent: sendWelcomeEmail !== false,
      });
    }

    // === UPDATE COMPANY ACCESS ===
    if (action === "update-company-access") {
      const { userId, companyId, companyAccesses, operation } = body;
      if (!userId) return errorResponse("userId obbligatorio");

      // Single remove operation
      if (operation === "remove" && companyId) {
        const { error } = await supabaseAdmin
          .from("multi_company_access")
          .delete()
          .eq("user_id", userId)
          .eq("company_id", companyId);

        if (error) throw new Error(error.message);

        const { data: targetProfile } = await supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
        await logAudit(supabaseAdmin, callerId, "remove_company_access", "user", userId, {
          target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : userId,
          company_id: companyId,
        });

        return jsonResponse({ success: true });
      }

      // Single add operation
      if (operation === "add" && companyId) {
        const { error } = await supabaseAdmin
          .from("multi_company_access")
          .insert({
            user_id: userId,
            company_id: companyId,
            access_role: body.accessRole || "company_staff",
            granted_by: callerId,
          });

        if (error) throw new Error(error.message);

        const { data: targetProfile } = await supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
        await logAudit(supabaseAdmin, callerId, "add_company_access", "user", userId, {
          target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : userId,
          company_id: companyId,
        });

        return jsonResponse({ success: true });
      }

      // Single update-role operation — change access_role of an existing row
      if (operation === "update-role" && companyId) {
        const newRole = body.accessRole;
        if (!newRole) return errorResponse("accessRole obbligatorio per update-role");
        const { error } = await supabaseAdmin
          .from("multi_company_access")
          .update({ access_role: newRole })
          .eq("user_id", userId)
          .eq("company_id", companyId);

        if (error) throw new Error(error.message);

        const { data: targetProfile } = await supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
        await logAudit(supabaseAdmin, callerId, "update_company_access_role", "user", userId, {
          target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : userId,
          company_id: companyId,
          new_role: newRole,
        });

        return jsonResponse({ success: true });
      }

      // Bulk replace: upsert new rows first, then delete any rows not in the new set
      // This avoids a window where the user has zero access
      const newCompanyIds: string[] = [];
      if (companyAccesses && Array.isArray(companyAccesses) && companyAccesses.length > 0) {
        const accessRows = companyAccesses.map((ca: any) => ({
          user_id: userId,
          company_id: ca.companyId,
          access_role: ca.role || "company_staff",
          granted_by: callerId,
        }));

        const { error } = await supabaseAdmin
          .from("multi_company_access")
          .upsert(accessRows, { onConflict: "user_id,company_id" });

        if (error) throw new Error(error.message);

        newCompanyIds.push(...companyAccesses.map((ca: any) => ca.companyId));
      }

      // Delete rows not in the new set
      if (newCompanyIds.length > 0) {
        const { error: deleteError } = await supabaseAdmin
          .from("multi_company_access")
          .delete()
          .eq("user_id", userId)
          .not("company_id", "in", `(${newCompanyIds.join(",")})`);
        if (deleteError) throw new Error(deleteError.message);
      } else {
        // No new accesses → remove all
        const { error: deleteError } = await supabaseAdmin
          .from("multi_company_access")
          .delete()
          .eq("user_id", userId);
        if (deleteError) throw new Error(deleteError.message);
      }

      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
      await logAudit(supabaseAdmin, callerId, "update_company_access", "user", userId, {
        target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : userId,
        company_count: companyAccesses?.length || 0,
      });

      return jsonResponse({ success: true });
    }

    return errorResponse("Azione non valida");
  } catch (error) {
    statusCode = 500;
    return errorResponse((error as Error).message, 500);
  } finally {
    await recordMetric({
      metricType: "edge_function_call",
      functionName: "manage-platform-users",
      statusCode,
      latencyMs: Date.now() - startTime,
    });
  }
});
