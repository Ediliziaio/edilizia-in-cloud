// Aggiorna o revoca la delega di accesso commercialista → azienda.
//
// Azioni supportate:
//   - "revoke"           → status = 'revoked' + revoked_at + notifica
//   - "suspend"          → status = 'suspended'
//   - "reactivate"       → status = 'active'
//   - "update_permissions" → aggiorna access_mode + permissions
//
// Auth: caller deve essere admin/owner dell'azienda.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

type AccessAction = "revoke" | "suspend" | "reactivate" | "update_permissions";

type AccessMode = "read_only" | "operational" | "approval_required";

type Permissions = {
  finance?: boolean;
  documents?: boolean;
  management_control?: boolean;
  jobs?: boolean;
  requests?: boolean;
  exports?: boolean;
  write_actions?: boolean;
};

type Body = {
  access_id: string;
  action: AccessAction;
  access_mode?: AccessMode;
  permissions?: Permissions;
  notes?: string | null;
};

function json(req: Request, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: callerData, error: callerError } = await caller.auth.getUser();
    if (callerError || !callerData.user) return json(req, { error: "Unauthorized" }, 401);
    const callerId = callerData.user.id;

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json(req, { error: "Invalid JSON body" }, 400);
    }

    const accessId = String(body.access_id || "").trim();
    const action = body.action;
    if (!/^[0-9a-f-]{36}$/i.test(accessId)) {
      return json(req, { error: "access_id non valido" }, 400);
    }
    if (!["revoke", "suspend", "reactivate", "update_permissions"].includes(action)) {
      return json(req, { error: "action non valida" }, 400);
    }

    // Carica access + verifica caller admin/owner della company
    const { data: accessRow, error: accessErr } = await admin
      .from("accountant_company_access")
      .select("id, firm_id, company_id, status")
      .eq("id", accessId)
      .maybeSingle();
    if (accessErr || !accessRow) return json(req, { error: "Delega non trovata" }, 404);

    const { data: membership } = await admin
      .from("user_company_memberships")
      .select("role")
      .eq("user_id", callerId)
      .eq("company_id", accessRow.company_id)
      .in("role", ["owner", "admin"])
      .maybeSingle();

    let isAuthorized = !!membership;
    if (!isAuthorized) {
      const { data: superRole } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("role", "super_admin")
        .maybeSingle();
      isAuthorized = !!superRole;
    }
    if (!isAuthorized) return json(req, { error: "Forbidden" }, 403);

    const updates: Record<string, unknown> = {};
    const nowIso = new Date().toISOString();
    let notificationType: string | null = null;
    let notificationTitle: string | null = null;
    let notificationBody: string | null = null;

    switch (action) {
      case "revoke":
        updates.status = "revoked";
        updates.revoked_at = nowIso;
        updates.revoked_by = callerId;
        notificationType = "company_revoked";
        notificationTitle = "Accesso azienda revocato";
        notificationBody = "L'azienda ha revocato la tua delega di accesso.";
        break;
      case "suspend":
        updates.status = "suspended";
        notificationType = "company_suspended";
        notificationTitle = "Accesso azienda sospeso";
        notificationBody = "L'azienda ha temporaneamente sospeso il tuo accesso.";
        break;
      case "reactivate":
        updates.status = "active";
        updates.revoked_at = null;
        notificationType = "company_reactivated";
        notificationTitle = "Accesso azienda riattivato";
        notificationBody = "L'azienda ha riattivato la tua delega di accesso.";
        break;
      case "update_permissions":
        if (body.access_mode) updates.access_mode = body.access_mode;
        if (body.permissions) updates.permissions = body.permissions;
        if (typeof body.notes !== "undefined") updates.notes = body.notes;
        break;
    }

    const { error: updErr } = await admin
      .from("accountant_company_access")
      .update(updates)
      .eq("id", accessId);
    if (updErr) return json(req, { error: "Errore aggiornamento delega" }, 500);

    // Audit log
    try {
      await admin.from("accountant_audit_log").insert({
        firm_id: accessRow.firm_id,
        company_id: accessRow.company_id,
        actor_user_id: callerId,
        action: `company.${action}_accountant`,
        entity_type: "accountant_company_access",
        entity_id: accessId,
      });
    } catch {
      // non-blocking
    }

    // Notifica al firm owner se action lo richiede
    if (notificationType && notificationTitle) {
      try {
        const { data: firmRow } = await admin
          .from("accountant_firms")
          .select("owner_user_id")
          .eq("id", accessRow.firm_id)
          .maybeSingle();
        const { data: companyRow } = await admin
          .from("companies")
          .select("name")
          .eq("id", accessRow.company_id)
          .maybeSingle();
        if (firmRow?.owner_user_id) {
          await admin.from("accountant_notifications").insert({
            firm_id: accessRow.firm_id,
            user_id: firmRow.owner_user_id,
            type: notificationType,
            title: companyRow ? `${companyRow.name}: ${notificationTitle}` : notificationTitle,
            body: notificationBody,
            entity_type: "accountant_company_access",
            entity_id: accessId,
            action_url: "/commercialista/aziende",
          });
        }
      } catch {
        // non-blocking
      }
    }

    return json(req, { success: true, action, access_id: accessId });
  } catch (error) {
    return json(req, { error: (error as Error).message || "Internal error" }, 500);
  }
});
