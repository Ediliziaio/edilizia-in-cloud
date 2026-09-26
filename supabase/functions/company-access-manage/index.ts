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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { buildStaffPermissionsRecord, STAFF_ROLE_PRESETS } from "../_shared/staffPermissionsDefaults.ts";

const ALLOWED_ROLES = new Set([
  "company_admin", "company_staff", "salesperson", "call_center", "employee", "subcontractor",
]);

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DEFAULT_SITE_URL = "https://app.ediliziaincloud.com";

/** Escapa i metacaratteri LIKE (% e _) per un confronto letterale case-insensitive. */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

/** Origin valido per il redirect del reset (whitelist di forma, no open-redirect). */
function resolveRedirectOrigin(raw: unknown): string {
  const o = String(raw ?? "").trim();
  if (/^https?:\/\/[a-zA-Z0-9.\-:]+$/.test(o)) return o;
  return Deno.env.get("SITE_URL") || DEFAULT_SITE_URL;
}

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

/**
 * Conta gli amministratori EFFETTIVI di un'azienda: admin primari (ruolo
 * globale company_admin + azienda primaria) + admin via accesso multi-azienda
 * ATTIVO e non scaduto. Serve alla guardia anti-lockout: non si può togliere
 * l'ultimo admin (sospensione/declassamento/revoca) lasciando l'azienda senza
 * chi la amministra.
 */
async function countActiveAdmins(supabaseAdmin: Admin, companyId: string): Promise<number> {
  const adminIds = new Set<string>();

  const { data: roleAdmins } = await supabaseAdmin
    .from("user_roles").select("user_id").eq("role", "company_admin");
  const roleAdminIds = (roleAdmins ?? [])
    .map((r: { user_id?: string }) => r.user_id)
    .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
  if (roleAdminIds.length > 0) {
    const { data: primaryAdmins } = await supabaseAdmin
      .from("profiles").select("id").eq("company_id", companyId).in("id", roleAdminIds);
    for (const p of primaryAdmins ?? []) if (p.id) adminIds.add(p.id);
  }

  const nowIso = new Date().toISOString();
  const { data: mcaAdmins } = await supabaseAdmin
    .from("multi_company_access")
    .select("user_id, expires_at")
    .eq("company_id", companyId).eq("access_role", "company_admin").eq("status", "active");
  for (const m of mcaAdmins ?? []) {
    if (m.user_id && (!m.expires_at || m.expires_at > nowIso)) adminIds.add(m.user_id);
  }

  return adminIds.size;
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
          // /reset-password e non /cambia-password: chi riceve l'invito non ha
          // ancora una password, e /cambia-password gli chiederebbe quella attuale.
          redirectTo: `${origin}/reset-password`,
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

      // Senza una riga staff_permissions l'invitato non-admin entrava e non
      // vedeva nulla. La riga nasce col preset del suo ruolo, lo stesso del
      // client (STAFF_ROLE_PRESETS; la modifica operativa la deriva il
      // trigger), e l'admin la regola dalla scheda utente. Se la riga c'è già
      // non si tocca.
      if (accessRole !== "company_admin") {
        const { data: permRow, error: permReadErr } = await supabaseAdmin
          .from("staff_permissions").select("id")
          .eq("user_id", targetUserId).eq("company_id", companyId)
          .limit(1).maybeSingle();
        if (permReadErr) return errorResponse(`Errore lettura permessi: ${permReadErr.message}`, 500, corsH);
        if (!permRow) {
          const { error: permErr } = await supabaseAdmin
            .from("staff_permissions")
            .insert(buildStaffPermissionsRecord(targetUserId, companyId, STAFF_ROLE_PRESETS[accessRole]));
          if (permErr) return errorResponse(`Accesso concesso, ma permessi non creati: ${permErr.message}`, 500, corsH);
        }
      }

      return jsonResponse({ success: true, user_id: targetUserId, invited }, 200, corsH);
    }

    // ── CHANGE-EMAIL: cambia l'email di LOGIN (auth) + profilo + reset ────────
    // Sta PRIMA del controllo su access_id qui sotto, che serve solo alle azioni
    // su una riga di accesso: messo dopo (fino al 22/09/2026), ogni cambio email
    // finiva in «access_id mancante» e l'email non cambiava mai.
    // Il chiamante è già company_admin dell'azienda (canManage). In più il
    // target deve appartenere a QUESTA azienda: niente cambio email cross-tenant.
    // Aggiorna prima auth (fonte del login), poi il profilo, poi invia il reset
    // alla NUOVA email. Nasce perché l'edit lato azienda aggiornava solo il
    // profilo → l'email di login restava vecchia e il reset non arrivava.
    if (action === "change_email") {
      const targetUserId = String(body?.user_id ?? "");
      const newEmail = String(body?.new_email ?? "").trim().toLowerCase();
      if (!targetUserId) return errorResponse("user_id mancante", 400, corsH);
      if (!newEmail || !EMAIL_RE.test(newEmail)) return errorResponse("Nuova email non valida", 400, corsH);

      const { data: target } = await supabaseAdmin
        .from("profiles").select("id, email, company_id").eq("id", targetUserId).maybeSingle();
      if (!target) return errorResponse("Utente non trovato", 404, corsH);

      // L'email di ACCESSO è la credenziale di login (una per account auth): la
      // cambia solo chi amministra l'azienda PRINCIPALE dell'utente (profiles.
      // company_id), o il super admin. Prima bastava un accesso multi-azienda a
      // QUESTA azienda: l'amministratore di B cambiava l'email — e prendeva
      // l'account — di un utente la cui azienda vera è A, titolare compreso
      // (26/09/2026).
      const targetHome = (target as { company_id?: string | null }).company_id ?? "";
      if (!(await canManage(supabaseAdmin, userId, targetHome))) {
        return errorResponse("L'email di accesso la può cambiare solo un amministratore dell'azienda principale dell'utente.", 403, corsH);
      }

      const emailAttuale = String((target as { email?: string }).email ?? "").toLowerCase();
      if (newEmail === emailAttuale) return errorResponse("La nuova email coincide con quella attuale", 400, corsH);

      // Anti-takeover: la nuova email non deve essere di un ALTRO utente.
      const { data: clash } = await supabaseAdmin
        .from("profiles").select("id").ilike("email", likeEscape(newEmail)).neq("id", targetUserId).limit(1).maybeSingle();
      if (clash?.id) return errorResponse("Questa email è già usata da un altro account.", 409, corsH);

      // 1) Auth = fonte del login (email_confirm: niente doppia conferma per l'admin).
      const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        email: newEmail, email_confirm: true,
      });
      if (uErr) return errorResponse(`Cambio email fallito: ${uErr.message}`, 500, corsH);

      // 2) Profilo (fonte di risoluzione lato app).
      const { error: pErr } = await supabaseAdmin.from("profiles").update({ email: newEmail }).eq("id", targetUserId);
      if (pErr) {
        return errorResponse(`Email di login aggiornata, ma la sincronizzazione del profilo è fallita (${pErr.message}). Riprova.`, 500, corsH);
      }

      // 3) Reset password verso la NUOVA email (client anon = mailer pubblico).
      let recoveryWarning: string | null = null;
      try {
        const origin = resolveRedirectOrigin(body?.origin);
        const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
        const { error: rErr } = await anon.auth.resetPasswordForEmail(newEmail, {
          redirectTo: `${origin}/reset-password`,
        });
        if (rErr) recoveryWarning = rErr.message;
      } catch (e) {
        recoveryWarning = e instanceof Error ? e.message : String(e);
      }

      return jsonResponse({ success: true, email: newEmail, recovery_warning: recoveryWarning }, 200, corsH);
    }

    // ── UPDATE-ROLE / SET-STATUS / REVOKE (richiedono access_id) ───────────────
    const accessId = String(body?.access_id ?? "");
    if (!accessId) return errorResponse("access_id mancante", 400, corsH);
    // La riga deve appartenere alla company gestita (anti-IDOR).
    const { data: row } = await supabaseAdmin
      .from("multi_company_access").select("id, company_id, user_id, access_role, status")
      .eq("id", accessId).maybeSingle();
    if (!row || (row as { company_id: string }).company_id !== companyId) {
      return errorResponse("Accesso non trovato per questa azienda", 404, corsH);
    }
    const targetRow = row as { access_role: string; status: string; user_id: string };
    const targetIsActiveAdmin = targetRow.access_role === "company_admin" && targetRow.status === "active";

    // Guardia anti-lockout: se questa riga è l'ultimo admin attivo dell'azienda,
    // non la si può declassare/sospendere/revocare (l'azienda resterebbe senza
    // amministratore). Il super_admin di piattaforma non è vincolato.
    const guardLastAdmin = async (): Promise<Response | null> => {
      if (!targetIsActiveAdmin) return null;
      const admins = await countActiveAdmins(supabaseAdmin, companyId);
      if (admins <= 1) {
        return errorResponse(
          "Non puoi rimuovere l'ultimo amministratore dell'azienda. Assegna prima un altro admin.",
          409, corsH,
        );
      }
      return null;
    };

    if (action === "update-role") {
      const accessRole = String(body?.access_role ?? "");
      if (!ALLOWED_ROLES.has(accessRole)) return errorResponse("Ruolo non valido", 400, corsH);
      // Declassamento dell'ultimo admin → blocca (mantiene admin → admin ok).
      if (accessRole !== "company_admin") {
        const blocked = await guardLastAdmin();
        if (blocked) return blocked;
      }
      await supabaseAdmin.from("multi_company_access").update({ access_role: accessRole }).eq("id", accessId);
      return jsonResponse({ success: true }, 200, corsH);
    }
    if (action === "set-status") {
      const status = String(body?.status ?? "");
      if (!["active", "suspended"].includes(status)) return errorResponse("Stato non valido", 400, corsH);
      if (status === "suspended") {
        const blocked = await guardLastAdmin();
        if (blocked) return blocked;
      }
      await supabaseAdmin.from("multi_company_access").update({ status }).eq("id", accessId);
      return jsonResponse({ success: true }, 200, corsH);
    }
    if (action === "revoke") {
      const blocked = await guardLastAdmin();
      if (blocked) return blocked;
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
