// ============================================================================
// company-access-manage — Concessione accessi multi-azienda self-service (GHL-style).
// ----------------------------------------------------------------------------
// Permette a un company_admin (sulla PROPRIA azienda) o a un produttore (sui propri
// sub-account/rivenditori) di invitare/collegare utenti a un'azienda con un ruolo
// per-account, senza passare dal super_admin. Gestisce l'intero ciclo di vita:
// list / invite / update-role / set-status (suspend|active) / revoke.
//
// Sicurezza: gira con service_role (bypass RLS) → replica esplicitamente il modello
// can_manage_company_people(company_id) = super_admin OR company_admin dell'azienda
// (via ruolo+profilo o multi_company_access company_admin attivo). I produttori sono
// coperti perché create-reseller concede loro un mca company_admin sui figli.
// ============================================================================

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

const ALLOWED_ROLES = new Set([
  "company_admin", "company_staff", "salesperson", "call_center", "employee", "subcontractor",
]);

// deno-lint-ignore no-explicit-any
type Admin = any;

/** true se `userId` può gestire gli accessi di `companyId` (replica can_manage_company_people). */
async function canManage(supabaseAdmin: Admin, userId: string, companyId: string): Promise<boolean> {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
  if (roleSet.has("super_admin")) return true;

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("company_id").eq("id", userId).maybeSingle();
  const primary = (profile as { company_id?: string } | null)?.company_id ?? null;

  // company_admin dell'azienda target (ruolo globale + azienda primaria = target)
  if (primary === companyId && roleSet.has("company_admin")) return true;

  // company_admin via accesso multi-azienda attivo sulla target
  const { data: mca } = await supabaseAdmin
    .from("multi_company_access")
    .select("access_role, status, expires_at")
    .eq("user_id", userId).eq("company_id", companyId)
    .eq("access_role", "company_admin").eq("status", "active")
    .maybeSingle();
  if (mca) {
    const exp = (mca as { expires_at?: string | null }).expires_at;
    if (!exp || exp > new Date().toISOString()) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsH);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json();
    const action = String(body?.action ?? "");
    const companyId = String(body?.company_id ?? "");
    if (!companyId) return errorResponse("company_id mancante", 400, corsH);

    if (!(await canManage(supabaseAdmin, userId, companyId))) {
      return errorResponse("Non autorizzato a gestire gli accessi di questa azienda", 403, corsH);
    }

    // ── LIST ────────────────────────────────────────────────────────────────
    if (action === "list") {
      const { data: rows } = await supabaseAdmin
        .from("multi_company_access")
        .select("id, user_id, access_role, status, expires_at, invited_email, granted_by, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
      const { data: profs } = userIds.length
        ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
        : { data: [] };
      const pById = new Map((profs ?? []).map((p: { id: string }) => [p.id, p]));
      const items = (rows ?? []).map((r: { user_id: string }) => ({ ...r, profile: pById.get(r.user_id) ?? null }));
      return jsonResponse({ items }, 200, corsH);
    }

    // ── INVITE (collega un utente all'azienda con un ruolo) ────────────────────
    if (action === "invite") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      const accessRole = String(body?.access_role ?? "company_staff");
      if (!email || !email.includes("@")) return errorResponse("Email non valida", 400, corsH);
      if (!ALLOWED_ROLES.has(accessRole)) return errorResponse("Ruolo non valido", 400, corsH);

      // Utente esistente?
      const { data: existing } = await supabaseAdmin
        .from("profiles").select("id, company_id").eq("email", email).limit(1).maybeSingle();

      let targetUserId = (existing as { id?: string } | null)?.id ?? null;
      let invited = false;

      if (!targetUserId) {
        const origin = Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
        const { data: inv, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${origin}/cambia-password`,
          data: { company_id: companyId },
        });
        if (invErr || !inv?.user?.id) {
          return errorResponse(`Impossibile invitare l'utente: ${invErr?.message ?? "sconosciuto"}`, 500, corsH);
        }
        targetUserId = inv.user.id;
        invited = true;
        // Nuovo utente senza azienda primaria → impostala a questa (diventa la sua base).
        await supabaseAdmin.from("profiles").upsert(
          { id: targetUserId, email, company_id: companyId },
          { onConflict: "id" },
        );
        // Un nuovo utente invitato come admin/staff ottiene il ruolo globale minimo.
        const { data: hasRole } = await supabaseAdmin
          .from("user_roles").select("id").eq("user_id", targetUserId).maybeSingle();
        if (!hasRole) {
          await supabaseAdmin.from("user_roles").insert({
            user_id: targetUserId,
            role: accessRole === "company_admin" ? "company_admin" : "company_staff",
          });
        }
      }

      // Se l'utente ha già questa azienda come primaria, non serve una riga mca.
      const isPrimary = (existing as { company_id?: string } | null)?.company_id === companyId;
      if (!isPrimary) {
        const { error: upErr } = await supabaseAdmin.from("multi_company_access").upsert(
          {
            user_id: targetUserId, company_id: companyId,
            access_role: accessRole, status: "active",
            invited_email: email, granted_by: userId,
          },
          { onConflict: "user_id,company_id" },
        );
        if (upErr) return errorResponse(`Errore concessione accesso: ${upErr.message}`, 500, corsH);
      }
      return jsonResponse({ success: true, user_id: targetUserId, invited }, 200, corsH);
    }

    // ── UPDATE-ROLE / SET-STATUS / REVOKE (richiedono access_id) ───────────────
    const accessId = String(body?.access_id ?? "");
    if (!accessId) return errorResponse("access_id mancante", 400, corsH);
    // La riga deve appartenere alla company gestita (anti-IDOR).
    const { data: row } = await supabaseAdmin
      .from("multi_company_access").select("id, company_id, user_id").eq("id", accessId).maybeSingle();
    if (!row || (row as { company_id: string }).company_id !== companyId) {
      return errorResponse("Accesso non trovato per questa azienda", 404, corsH);
    }

    if (action === "update-role") {
      const accessRole = String(body?.access_role ?? "");
      if (!ALLOWED_ROLES.has(accessRole)) return errorResponse("Ruolo non valido", 400, corsH);
      await supabaseAdmin.from("multi_company_access").update({ access_role: accessRole }).eq("id", accessId);
      return jsonResponse({ success: true }, 200, corsH);
    }
    if (action === "set-status") {
      const status = String(body?.status ?? "");
      if (!["active", "suspended"].includes(status)) return errorResponse("Stato non valido", 400, corsH);
      await supabaseAdmin.from("multi_company_access").update({ status }).eq("id", accessId);
      return jsonResponse({ success: true }, 200, corsH);
    }
    if (action === "revoke") {
      await supabaseAdmin.from("multi_company_access").delete().eq("id", accessId);
      return jsonResponse({ success: true }, 200, corsH);
    }

    return errorResponse("Azione non riconosciuta", 400, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("company-access-manage error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
