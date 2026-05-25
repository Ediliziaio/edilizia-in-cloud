// Invita il commercialista dell'azienda al portale studio.
//
// Flow:
//   1. Auth: caller deve essere admin/owner della company_id
//   2. Validation: email, access_mode, permissions
//   3. Trova accountant_firm dell'email (se esiste user accountant) OR
//      placeholder firm (se non esiste ancora utente)
//   4. Insert/update accountant_company_access (status='invited')
//   5. Audit log + notifica in-app (se firm ha owner) + email transazionale
//   6. Ritorna access_id + requires_signup flag

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { render as renderInviteEmail } from "../_shared/email-templates/accountant-company-invite.ts";

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
  company_id: string;
  accountant_email: string;
  access_mode?: AccessMode;
  permissions?: Permissions;
  notes?: string | null;
};

const DEFAULT_PERMISSIONS: Permissions = {
  finance: true,
  documents: true,
  management_control: true,
  jobs: true,
  requests: true,
  exports: true,
  write_actions: false,
};

const ACCESS_MODE_LABELS: Record<AccessMode, string> = {
  read_only: "sola lettura",
  operational: "operativo",
  approval_required: "con approvazione",
};

function json(req: Request, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getAccountantPortalUrl(path: string) {
  const baseUrl =
    Deno.env.get("PUBLIC_ACCOUNTANT_URL") ||
    Deno.env.get("ACCOUNTANT_APP_URL") ||
    "https://commercialista.ediliziaincloud.com";
  const url = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
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
    // 1. Auth caller
    const { data: callerData, error: callerError } = await caller.auth.getUser();
    if (callerError || !callerData.user) return json(req, { error: "Unauthorized" }, 401);
    const callerId = callerData.user.id;
    const callerEmail = callerData.user.email || "";

    // 2. Parse body
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json(req, { error: "Invalid JSON body" }, 400);
    }

    const companyId = String(body.company_id || "").trim();
    const accountantEmail = normalizeEmail(String(body.accountant_email || ""));
    const accessMode: AccessMode = (body.access_mode ?? "read_only") as AccessMode;
    const permissions: Permissions = { ...DEFAULT_PERMISSIONS, ...(body.permissions || {}) };
    const notes = body.notes?.trim() || null;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
      return json(req, { error: "company_id non valido" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountantEmail)) {
      return json(req, { error: "Email commercialista non valida" }, 400);
    }
    if (!["read_only", "operational", "approval_required"].includes(accessMode)) {
      return json(req, { error: "access_mode non valido" }, 400);
    }

    // 3. Verifica caller è admin/owner della company
    const { data: membership } = await admin
      .from("user_company_memberships")
      .select("role")
      .eq("user_id", callerId)
      .eq("company_id", companyId)
      .in("role", ["owner", "admin"])
      .maybeSingle();

    // Fallback: super_admin globale può sempre invitare
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

    if (!isAuthorized) {
      return json(
        req,
        { error: "Solo titolare o admin dell'azienda può invitare un commercialista" },
        403,
      );
    }

    // 4. Recupera company per nome
    const { data: companyRow } = await admin
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .maybeSingle();
    if (!companyRow) return json(req, { error: "Azienda non trovata" }, 404);

    // 5. Recupera profile caller per "invited by name"
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", callerId)
      .maybeSingle();
    const invitedByName =
      [callerProfile?.first_name, callerProfile?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || callerEmail || "Un collaboratore";

    // 6. Cerca user_id del commercialista (se esiste)
    const { data: lookupResult } = await admin.rpc("lookup_user_by_email", {
      p_email: accountantEmail,
    });
    const accountantUserId = (lookupResult as string | null) || null;

    // 7. Cerca/crea accountant_firm
    let firmId: string | null = null;
    let firmOwnerId: string | null = null;
    let recipientName = accountantEmail.split("@")[0];

    if (accountantUserId) {
      // Cerca firm dove è owner
      const { data: ownedFirm } = await admin
        .from("accountant_firms")
        .select("id, name, owner_user_id")
        .eq("owner_user_id", accountantUserId)
        .maybeSingle();
      if (ownedFirm) {
        firmId = ownedFirm.id;
        firmOwnerId = ownedFirm.owner_user_id;
      }

      const { data: existingProfile } = await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", accountantUserId)
        .maybeSingle();
      const personName =
        [existingProfile?.first_name, existingProfile?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
      if (personName) recipientName = personName;
    }

    // Se non ha ancora firm, ne creo una placeholder
    let requiresSignup = false;
    if (!firmId) {
      requiresSignup = !accountantUserId;
      const { data: newFirm, error: firmErr } = await admin
        .from("accountant_firms")
        .insert({
          name: `Studio ${recipientName}`,
          email: accountantEmail,
          owner_user_id: accountantUserId, // null se non esiste ancora
          status: accountantUserId ? "active" : "pending_contract",
          contract_status: "pending",
          dpa_status: "pending",
        })
        .select("id, owner_user_id")
        .single();
      if (firmErr || !newFirm) {
        return json(req, { error: "Errore creazione studio placeholder" }, 500);
      }
      firmId = newFirm.id;
      firmOwnerId = newFirm.owner_user_id;

      // Se ha owner, già aggiungo come member
      if (accountantUserId) {
        await admin
          .from("accountant_firm_members")
          .insert({
            firm_id: firmId,
            user_id: accountantUserId,
            role: "owner",
            status: "active",
            accepted_at: new Date().toISOString(),
          })
          .select("id");
        await admin
          .from("user_roles")
          .insert({ user_id: accountantUserId, role: "accountant" })
          .select("id");
      }
    }

    // 8. Insert/update accountant_company_access (upsert by firm+company)
    const nowIso = new Date().toISOString();
    const { data: accessExisting } = await admin
      .from("accountant_company_access")
      .select("id, status")
      .eq("firm_id", firmId)
      .eq("company_id", companyId)
      .maybeSingle();

    let accessId: string;
    if (accessExisting) {
      const { error: updErr } = await admin
        .from("accountant_company_access")
        .update({
          status: "invited",
          access_mode: accessMode,
          permissions,
          granted_by: callerId,
          invited_email: accountantEmail,
          invited_at: nowIso,
          notes,
          revoked_at: null,
          revoked_by: null,
        })
        .eq("id", accessExisting.id);
      if (updErr) return json(req, { error: "Errore aggiornamento delega" }, 500);
      accessId = accessExisting.id;
    } else {
      const { data: created, error: insErr } = await admin
        .from("accountant_company_access")
        .insert({
          firm_id: firmId,
          company_id: companyId,
          status: "invited",
          access_mode: accessMode,
          permissions,
          granted_by: callerId,
          invited_email: accountantEmail,
          invited_at: nowIso,
          notes,
        })
        .select("id")
        .single();
      if (insErr || !created) return json(req, { error: "Errore creazione delega" }, 500);
      accessId = created.id;
    }

    // 9. Audit log
    try {
      await admin.from("accountant_audit_log").insert({
        firm_id: firmId,
        company_id: companyId,
        actor_user_id: callerId,
        action: "company.invited_accountant",
        entity_type: "accountant_company_access",
        entity_id: accessId,
      });
    } catch {
      // non-blocking
    }

    // 10. Notifica in-app (se firm ha owner)
    if (firmOwnerId) {
      try {
        await admin.from("accountant_notifications").insert({
          firm_id: firmId,
          user_id: firmOwnerId,
          type: "company_invite",
          title: `${companyRow.name} ti ha invitato come commercialista`,
          body: `Livello di accesso: ${ACCESS_MODE_LABELS[accessMode]}. Accetta o rifiuta l'invito dal portale.`,
          entity_type: "accountant_company_access",
          entity_id: accessId,
          action_url: getAccountantPortalUrl("/commercialista/aziende"),
        });
      } catch {
        // non-blocking
      }
    }

    // 11. Email transazionale
    const portalUrl = requiresSignup
      ? `${getAccountantPortalUrl("/commercialista-login")}?signup=1&prefill_email=${encodeURIComponent(accountantEmail)}`
      : getAccountantPortalUrl("/commercialista-login");
    try {
      const branding = {
        companyName: "Edilizia in Cloud",
        primaryColor: "#1d4ed8",
        logoUrl: "https://www.ediliziaincloud.com/icons/icon-512.png",
      };
      const rendered = renderInviteEmail(
        {
          recipientName,
          companyName: companyRow.name,
          invitedByName,
          accessModeLabel: ACCESS_MODE_LABELS[accessMode],
          portalUrl,
          requiresSignup,
        },
        branding,
      );
      await sendEmailUnified({
        companyId: null,
        stream: "transactional",
        to: accountantEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        templateName: "accountant_company_invite",
        adminClient: admin,
      });
    } catch (emailErr) {
      console.error("[invite-accountant] email send failed:", emailErr);
      // non-blocking: l'invito è stato comunque creato
    }

    return json(req, {
      success: true,
      access_id: accessId,
      firm_id: firmId,
      requires_signup: requiresSignup,
      message: requiresSignup
        ? "Invito creato. Il commercialista riceverà un'email per registrarsi e accettare."
        : "Invito creato. Il commercialista vedrà la richiesta nel portale studio.",
    });
  } catch (error) {
    console.error("[invite-accountant-to-company] error:", error);
    return json(req, { error: (error as Error).message || "Internal error" }, 500);
  }
});
