import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auditHeaders } from "../_shared/auditContext.ts";

import { getCorsHeaders } from "../_shared/headers.ts";
import { isSuperAdminEmailAllowed } from "../_shared/auth.ts";
import { conMetriche } from "../_shared/withMetrics.ts";

type SupabaseAdminClient = any;

type ProfileRow = {
  company_id: string | null;
  email: string | null;
};

type RoleRow = {
  role: string;
};

type AffectedRecords = {
  salespeople: number;
  employees: number;
  subappaltatori: number;
};

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function hasCompanyAdminAccess(
  adminClient: SupabaseAdminClient,
  userId: string,
  profileCompanyId: string | null | undefined,
  roles: RoleRow[] | null | undefined,
  companyId: string,
  callerEmail: string | null | undefined,
) {
  // Defense-in-depth: il bypass super_admin (accesso a QUALSIASI azienda) vale
  // solo se l'email è nell'allowlist (vedi src/config/superAdmin.ts). Un
  // super_admin revocato dall'allowlist perde il bypass ma conserva gli
  // eventuali diritti di company_admin sulla propria azienda (verificati sotto).
  const isSuperAdmin = (roles?.some((r) => r.role === "super_admin") ?? false)
    && isSuperAdminEmailAllowed(callerEmail);
  if (isSuperAdmin) return true;

  const isOwnCompanyAdmin = (roles?.some((r) => r.role === "company_admin") ?? false)
    && profileCompanyId === companyId;
  if (isOwnCompanyAdmin) return true;

  const { data: access } = await adminClient
    .from("multi_company_access")
    .select("access_role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    // Solo un accesso ATTIVO conferisce autorità: un admin multi-azienda
    // sospeso non può più eliminare utenti (coerente con le guardie RLS).
    .eq("status", "active")
    .maybeSingle();

  return access?.access_role === "company_admin";
}

async function userBelongsToCompany(
  adminClient: SupabaseAdminClient,
  userId: string,
  profileCompanyId: string | null | undefined,
  companyId: string,
) {
  if (profileCompanyId === companyId) return true;

  const { data: access } = await adminClient
    .from("multi_company_access")
    .select("id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  return !!access?.id;
}

async function userIsAdminInCompany(
  adminClient: SupabaseAdminClient,
  userId: string,
  profileCompanyId: string | null | undefined,
  roles: RoleRow[] | null | undefined,
  companyId: string,
) {
  if (profileCompanyId === companyId && roles?.some((r) => r.role === "company_admin")) {
    return true;
  }

  const { data: access } = await adminClient
    .from("multi_company_access")
    .select("access_role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle();

  return access?.access_role === "company_admin";
}

async function countCompanyAdmins(adminClient: SupabaseAdminClient, companyId: string) {
  const adminIds = new Set<string>();

  const { data: globalAdminRoles, error: rolesError } = await adminClient
    .from("user_roles")
    .select("user_id")
    .eq("role", "company_admin");
  if (rolesError) throw rolesError;

  const roleAdminIds = (globalAdminRoles ?? [])
    .map((row: { user_id?: string | null }) => row.user_id)
    .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

  if (roleAdminIds.length > 0) {
    const { data: primaryAdmins, error: primaryError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .in("id", roleAdminIds.length > 0 ? roleAdminIds : [EMPTY_UUID]);
    if (primaryError) throw primaryError;
    for (const row of primaryAdmins ?? []) {
      if (row.id) adminIds.add(row.id);
    }
  }

  const { data: grantedAdmins, error: grantedError } = await adminClient
    .from("multi_company_access")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("access_role", "company_admin")
    // Gli admin multi-azienda SOSPESI non sono amministratori effettivi: contarli
    // gonfiava il totale e la guardia "ultimo admin" poteva far eliminare l'unico
    // admin operativo lasciando l'azienda di fatto senza amministrazione.
    .eq("status", "active");
  if (grantedError) throw grantedError;

  for (const row of grantedAdmins ?? []) {
    if (row.user_id) adminIds.add(row.user_id);
  }

  return adminIds.size;
}

async function validateReassignTarget(
  adminClient: SupabaseAdminClient,
  reassignToUserId: string | null | undefined,
  currentUserId: string,
  companyId: string,
) {
  if (!reassignToUserId) return;
  if (reassignToUserId === currentUserId) {
    throw new Error("Il destinatario non può essere lo stesso utente");
  }

  const { data: reassignProfile } = await adminClient
    .from("profiles")
    .select("company_id")
    .eq("id", reassignToUserId)
    .maybeSingle();

  if (reassignProfile?.company_id === companyId) return;

  const { data: reassignAccess } = await adminClient
    .from("multi_company_access")
    .select("id")
    .eq("user_id", reassignToUserId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!reassignAccess?.id) {
    throw new Error("Il destinatario del reassign deve avere accesso alla stessa azienda");
  }
}

async function reassignOrUnlinkRecords(
  adminClient: SupabaseAdminClient,
  userId: string,
  companyId: string,
  reassignToUserId?: string | null,
): Promise<AffectedRecords> {
  const nextUserId = reassignToUserId ?? null;
  const affected: AffectedRecords = { salespeople: 0, employees: 0, subappaltatori: 0 };

  const { data: spData, error: spError } = await adminClient
    .from("salespeople")
    .update({ user_id: nextUserId })
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .select("id");
  if (spError) console.error("Error updating salespeople:", spError);
  affected.salespeople = spData?.length ?? 0;

  const { data: empData, error: empError } = await adminClient
    .from("employees")
    .update({ user_id: nextUserId })
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .select("id");
  if (empError) console.error("Error updating employees:", empError);
  affected.employees = empData?.length ?? 0;

  const { data: subData, error: subError } = await adminClient
    .from("subappaltatori")
    .update({ user_id: nextUserId })
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .select("id");
  if (subError) console.error("Error updating subappaltatori:", subError);
  affected.subappaltatori = subData?.length ?? 0;

  return affected;
}

Deno.serve(conMetriche("delete-company-user", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(req, { error: "Non autorizzato" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return jsonResponse(req, { error: "Non autorizzato" }, 401);
    }

    const { userId, reassignToUserId, company_id } = await req.json();
    if (!userId) {
      return jsonResponse(req, { error: "userId richiesto" }, 400);
    }

    const requestedCompanyId = typeof company_id === "string" && company_id.trim()
      ? company_id.trim()
      : null;

    // Il client admin porta con sé l'identità di chi sta cancellando: senza
    // questo il trigger di audit registra la rimozione dell'utente senza
    // sapere chi l'ha ordinata (con la chiave di servizio auth.uid() è nullo).
    const adminClient: SupabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: auditHeaders(req, caller.id, caller.email ?? null) },
    });

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", caller.id)
      .maybeSingle();

    const { data: targetProfileRaw } = await adminClient
      .from("profiles")
      .select("company_id, email")
      .eq("id", userId)
      .maybeSingle();
    const targetProfile = targetProfileRaw as ProfileRow | null;

    if (!targetProfile) {
      return jsonResponse(req, { error: "Utente non trovato" }, 404);
    }

    const targetCompanyId = requestedCompanyId ?? targetProfile.company_id;
    if (!targetCompanyId) {
      return jsonResponse(req, { error: "Azienda non selezionata" }, 400);
    }

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    // super_admin (con email in allowlist) gestisce la piattaforma: può eliminare
    // anche l'ultimo amministratore di un'azienda. Per i company_admin resta il
    // blocco anti-lockout (vedi guardia "ultimo admin" più sotto).
    const callerIsSuperAdmin = (callerRoles?.some((r: RoleRow) => r.role === "super_admin") ?? false)
      && isSuperAdminEmailAllowed(caller.email);

    const isAuthorized = await hasCompanyAdminAccess(
      adminClient,
      caller.id,
      callerProfile?.company_id,
      callerRoles,
      targetCompanyId,
      caller.email,
    );
    if (!isAuthorized) {
      return jsonResponse(req, { error: "Solo gli amministratori possono eliminare utenti" }, 403);
    }

    const targetBelongsToCompany = await userBelongsToCompany(
      adminClient,
      userId,
      targetProfile.company_id,
      targetCompanyId,
    );
    if (!targetBelongsToCompany) {
      return jsonResponse(req, { error: "L'utente non appartiene all'azienda selezionata" }, 403);
    }

    if (userId === caller.id) {
      return jsonResponse(req, { error: "Non puoi eliminare te stesso" }, 400);
    }

    await validateReassignTarget(adminClient, reassignToUserId, userId, targetCompanyId);

    const { data: targetRoles, error: targetRolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (targetRolesError) {
      return jsonResponse(req, { error: "Impossibile verificare i ruoli dell'utente" }, 500);
    }

    const targetIsCompanyAdmin = await userIsAdminInCompany(
      adminClient,
      userId,
      targetProfile.company_id,
      targetRoles,
      targetCompanyId,
    );
    if (targetIsCompanyAdmin && !callerIsSuperAdmin) {
      const adminCount = await countCompanyAdmins(adminClient, targetCompanyId);
      if (adminCount <= 1) {
        return jsonResponse(req, { error: "Impossibile eliminare l'ultimo amministratore aziendale" }, 400);
      }
    }

    const secondaryAccessOnly = targetProfile.company_id !== targetCompanyId;

    const affected = await reassignOrUnlinkRecords(adminClient, userId, targetCompanyId, reassignToUserId);

    await adminClient.from("user_audit_log").insert({
      company_id: targetCompanyId,
      actor_id: caller.id,
      target_user_id: userId,
      action: secondaryAccessOnly ? "company_access_revoked" : "user_deleted",
      details: {
        target_email: targetProfile.email,
        reassign_to_user_id: reassignToUserId ?? null,
        roles: targetRoles?.map((r: RoleRow) => r.role) ?? [],
        secondary_access_only: secondaryAccessOnly,
      },
    });

    if (secondaryAccessOnly) {
      await adminClient
        .from("user_sessions")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", targetCompanyId);

      await adminClient
        .from("team_members")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", targetCompanyId);

      await adminClient
        .from("staff_permissions")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", targetCompanyId);

      await adminClient
        .from("multi_company_access")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", targetCompanyId);

      return jsonResponse(req, { success: true, revoked_access_only: true, affected });
    }

    const { error: sessionsError } = await adminClient
      .from("user_sessions")
      .delete()
      .eq("user_id", userId);
    if (sessionsError) console.error("Error deleting user_sessions:", sessionsError);

    const { error: teamError } = await adminClient
      .from("team_members")
      .delete()
      .eq("user_id", userId);
    if (teamError) console.error("Error deleting team_members:", teamError);

    const { error: permDeleteError } = await adminClient
      .from("staff_permissions")
      .delete()
      .eq("user_id", userId)
      .eq("company_id", targetCompanyId);
    if (permDeleteError) console.error("Error deleting staff_permissions:", permDeleteError);

    const { error: rolesDeleteError } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (rolesDeleteError) console.error("Error deleting user_roles:", rolesDeleteError);

    const { error: profileDeleteError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId)
      .eq("company_id", targetCompanyId);
    if (profileDeleteError) {
      console.error("Error deleting profile:", profileDeleteError);
      return jsonResponse(req, { error: "Errore eliminazione profilo: " + profileDeleteError.message }, 500);
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error("Error deleting auth user:", deleteAuthError);
      return jsonResponse(req, { error: "Errore eliminazione account: " + deleteAuthError.message }, 500);
    }

    return jsonResponse(req, { success: true, affected });
  } catch (error: unknown) {
    console.error("delete-company-user error:", error);
    const message = error instanceof Error ? error.message : "Errore interno";
    return jsonResponse(req, { error: message }, 500);
  }
}));
