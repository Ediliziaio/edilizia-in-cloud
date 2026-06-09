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

interface Denorm { table: string; id: string }

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
      .from("profiles").select("id, email").ilike("email", email).limit(1).maybeSingle();
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

    // ── get_status ───────────────────────────────────────────────────────────
    if (action === "get_status") {
      if (!targetUserId) {
        return jsonResponse({ success: true, email, has_account: false }, 200, corsH);
      }
      const { data: u } = await admin.auth.admin.getUserById(targetUserId);
      const usr = u?.user;
      return jsonResponse({
        success: true,
        email: usr?.email ?? email,
        has_account: true,
        email_confirmed: !!usr?.email_confirmed_at,
        banned: !!(usr as { banned_until?: string } | undefined)?.banned_until
          && new Date((usr as { banned_until?: string }).banned_until as string).getTime() > Date.now(),
        last_sign_in_at: usr?.last_sign_in_at ?? null,
      }, 200, corsH);
    }

    // ── send_recovery: invia link reset password ───────────────────────────────
    if (action === "send_recovery") {
      const origin = new URL(req.url).origin;
      const redirectTo = `${origin}/cambia-password`;
      // Client anon dedicato: l'endpoint /recover è pubblico e invia l'email
      // tramite il mailer configurato. (Niente password gestita lato admin.)
      const anon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return errorResponse(`Invio reset fallito: ${error.message}`, 500, corsH);
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
        .from("profiles").select("id").ilike("email", newEmail).neq("id", targetUserId).limit(1).maybeSingle();
      if (clash?.id) {
        return errorResponse("Questa email è già usata da un altro account.", 409, corsH);
      }
      const { error: uErr } = await admin.auth.admin.updateUserById(targetUserId, {
        email: newEmail,
        email_confirm: true,
      });
      if (uErr) return errorResponse(`Cambio email fallito: ${uErr.message}`, 500, corsH);

      await admin.from("profiles").update({ email: newEmail }).eq("id", targetUserId);
      if (denorm && DENORM_TABLES.has(denorm.table) && denorm.id) {
        await admin.from(denorm.table).update({ email: newEmail }).eq("id", denorm.id);
      }
      return jsonResponse({ success: true, email: newEmail }, 200, corsH);
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
      return jsonResponse({ success: true }, 200, corsH);
    }

    return errorResponse("Azione non gestita", 400, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("admin-manage-login error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
