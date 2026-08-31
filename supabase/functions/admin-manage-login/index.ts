import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

/**
 * admin-manage-login — il SUPER_ADMIN gestisce i DATI DI ACCESSO (login) di un
 * utente gestito: referrer, admin produttore/rivenditore, owner studio
 * commercialista. Un solo punto sicuro per tutti gli attori.
 *
 * Azioni:
 *  - get_status     → email, account esistente, confermata, bloccata, ultimo accesso
 *  - send_recovery  → invia all'utente un'email con link per reimpostare la password
 *                     (NON viene MAI impostata una password in chiaro lato admin)
 *  - change_email   → cambia l'email di login (auth + profiles + denormalizzata),
 *                     con guardia anti-takeover
 *  - unblock        → rimuove un eventuale ban auth (sblocca l'accesso)
 *
 * Sicurezza:
 *  - solo super_admin (requireRole, con allowlist email come difesa-in-profondità)
 *  - non è possibile operare su un altro super_admin (anti-escalation)
 *  - la risoluzione dell'utente avviene via profiles.email (= auth uid)
 */

const DENORM_TABLES = new Set(["referrers", "companies", "accountant_firms"]);
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DEFAULT_SITE_URL = "https://app.ediliziaincloud.com";

interface Denorm { table: string; id: string }

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    // Gate forte: solo super_admin (in allowlist). Lancia 403 altrimenti.
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const newEmail = body?.new_email ? String(body.new_email).trim().toLowerCase() : "";
    const denorm: Denorm | null = body?.denorm && typeof body.denorm === "object"
      ? { table: String(body.denorm.table ?? ""), id: String(body.denorm.id ?? "") }
      : null;

    if (!["get_status", "send_recovery", "change_email", "unblock"].includes(action)) {
      return errorResponse("Azione non valida", 400, corsH);
    }
    if (!email || !EMAIL_RE.test(email)) {
      return errorResponse("Email di riferimento non valida", 400, corsH);
    }

    // ── Risolve l'utente auth dall'email via profiles (profiles.id = auth uid) ──
    const { data: prof } = await admin
      .from("profiles").select("id, email").ilike("email", likeEscape(email)).limit(1).maybeSingle();
    const targetUserId: string | null = (prof?.id as string | undefined) ?? null;

    // Anti-escalation: non gestire un altro super_admin tramite questo strumento.
    if (targetUserId) {
      const { data: tRoles } = await admin
        .from("user_roles").select("role").eq("user_id", targetUserId);
      const roles = ((tRoles ?? []) as Array<{ role: string }>).map((r) => r.role);
      if (roles.includes("super_admin")) {
        return errorResponse("Operazione non consentita su un account super admin.", 403, corsH);
      }
    }

    // Audit best-effort delle azioni che modificano l'accesso.
    const audit = async (details: Record<string, unknown>) => {
      try {
        await admin.from("admin_audit_log").insert({
          user_id: userId,
          action: `manage_login:${action}`,
          target_type: "user",
          target_id: targetUserId ?? email,
          details,
        });
      } catch (_e) { /* l'audit non deve mai bloccare l'operazione */ }
    };

    // ── get_status ───────────────────────────────────────────────────────────
    if (action === "get_status") {
      if (!targetUserId) {
        return jsonResponse({ success: true, email, has_account: false }, 200, corsH);
      }
      const { data: u } = await admin.auth.admin.getUserById(targetUserId);
      const usr = u?.user;
      const bannedUntil = (usr as { banned_until?: string } | undefined)?.banned_until;
      return jsonResponse({
        success: true,
        email: usr?.email ?? email,
        has_account: true,
        email_confirmed: !!usr?.email_confirmed_at,
        banned: !!bannedUntil && Date.parse(bannedUntil) > Date.now(),
        last_sign_in_at: usr?.last_sign_in_at ?? null,
      }, 200, corsH);
    }

    // ── send_recovery: invia link reset password ───────────────────────────────
    if (action === "send_recovery") {
      if (!targetUserId) {
        return errorResponse("Nessun account collegato a questa email: usa il reinvito dalla sua scheda.", 404, corsH);
      }
      const origin = resolveRedirectOrigin(body?.origin);
      // /cambia-password chiede la password ATTUALE per verifica: e'
      // la pagina per cambiarla da loggati, non per recuperarla. Chi ha
      // perso la password non puo' compilarla. Il reset va su
      // /reset-password, che apre la sessione dal token del link.
      const redirectTo = `${origin}/reset-password`;
      // Client anon dedicato: l'endpoint /recover è pubblico e invia l'email
      // tramite il mailer configurato. (Niente password gestita lato admin.)
      const anon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return errorResponse(`Invio reset fallito: ${error.message}`, 500, corsH);
      await audit({ email });
      return jsonResponse({ success: true, sent_to: email }, 200, corsH);
    }

    // ── change_email: cambia l'email di login ──────────────────────────────────
    if (action === "change_email") {
      if (!newEmail || !EMAIL_RE.test(newEmail)) {
        return errorResponse("Nuova email non valida", 400, corsH);
      }
      if (newEmail === email) {
        return errorResponse("La nuova email coincide con quella attuale", 400, corsH);
      }
      if (!targetUserId) {
        return errorResponse("Nessun account collegato a questa email: usa 'Invia reset/invito'.", 404, corsH);
      }
      // Anti-takeover: la nuova email non deve appartenere ad un ALTRO utente.
      const { data: clash } = await admin
        .from("profiles").select("id").ilike("email", likeEscape(newEmail)).neq("id", targetUserId).limit(1).maybeSingle();
      if (clash?.id) {
        return errorResponse("Questa email è già usata da un altro account.", 409, corsH);
      }
      const { error: uErr } = await admin.auth.admin.updateUserById(targetUserId, {
        email: newEmail,
        email_confirm: true,
      });
      if (uErr) return errorResponse(`Cambio email fallito: ${uErr.message}`, 500, corsH);

      // profiles è la fonte di risoluzione: se la sincronizzazione fallisce DOPO
      // l'update auth, segnala l'incoerenza invece di un falso successo.
      const { error: pErr } = await admin.from("profiles").update({ email: newEmail }).eq("id", targetUserId);
      if (pErr) {
        return errorResponse(
          `Email di login aggiornata, ma la sincronizzazione del profilo è fallita (${pErr.message}). Riprova.`,
          500, corsH,
        );
      }
      // Denormalizzata (referrers/companies/accountant_firms): best-effort, non
      // blocca l'operazione ma viene segnalata se fallisce.
      let denormWarning: string | null = null;
      if (denorm && DENORM_TABLES.has(denorm.table) && denorm.id) {
        const { error: dErr } = await admin.from(denorm.table).update({ email: newEmail }).eq("id", denorm.id);
        if (dErr) denormWarning = dErr.message;
      }
      await audit({ from: email, to: newEmail, denorm: denorm?.table ?? null, denormWarning });
      return jsonResponse({ success: true, email: newEmail, denorm_warning: denormWarning }, 200, corsH);
    }

    // ── unblock: rimuove il ban auth ───────────────────────────────────────────
    if (action === "unblock") {
      if (!targetUserId) {
        return errorResponse("Nessun account collegato a questa email.", 404, corsH);
      }
      const { error: bErr } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: "none",
      });
      if (bErr) return errorResponse(`Sblocco fallito: ${bErr.message}`, 500, corsH);
      await audit({ email });
      return jsonResponse({ success: true }, 200, corsH);
    }

    return errorResponse("Azione non gestita", 400, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("admin-manage-login error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
