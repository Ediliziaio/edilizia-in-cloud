/**
 * manage-audit-log — edge function per scrivere su public.admin_audit_log.
 *
 * Razionale: la tabella `admin_audit_log` ha RLS che blocca INSERT da client.
 * Solo `service_role` può scrivere → necessario un edge function gate.
 *
 * Sicurezza:
 *   1. Verifica il bearer token → recupera user_id reale via getUser()
 *   2. Verifica che user_id sia super_admin (no client può iniettare audit fake)
 *   3. Insert con service_role passando user_id derivato dal token (NON dal body)
 *   4. Rate limit semplice: max 100 log/min per user
 *
 * NB: payload del body NON include `user_id` — viene SEMPRE derivato dal token
 * server-side, così client non può falsificare audit a nome di altri.
 *
 * Action body schema:
 *   {
 *     action: "log",
 *     entry: {
 *       action: string,             // es. "platform_user.delete"
 *       targetType?: string,
 *       targetId?: string,
 *       details?: Record<string, unknown>
 *     }
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

interface AuditEntryInput {
  action?: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, cors);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // ─── Auth: verifica bearer token ──────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return errorResponse("Missing Authorization", 401, cors);
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return errorResponse("Invalid token", 401, cors);
    }
    const userId = userData.user.id;

    // ─── Rate limit ───────────────────────────────────────────────────
    const rateOk = await checkRateLimit(`audit-log:${userId}`, 100, 60);
    if (!rateOk) return rateLimitResponse(cors);

    // ─── Verifica super_admin (no spam log da utenti normali) ─────────
    // NB: la RLS SELECT su admin_audit_log richiede super_admin, qui
    // verifichiamo lo stesso prima dell'INSERT per evitare INSERT da chi
    // non potrebbe nemmeno leggerlo (incoerenza dati).
    const { data: rolesData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isSuperAdmin = (rolesData ?? []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSuperAdmin) {
      return errorResponse("Forbidden: solo super_admin può scrivere audit log", 403, cors);
    }

    // ─── Parse body ───────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || body.action !== "log") {
      return errorResponse("Invalid action — expected { action: 'log', entry: {...} }", 400, cors);
    }
    const entry = body.entry as AuditEntryInput | undefined;
    if (!entry?.action || typeof entry.action !== "string") {
      return errorResponse("entry.action required", 400, cors);
    }

    // Sanity check: entry.action max length, entry.details max size
    if (entry.action.length > 100) {
      return errorResponse("entry.action too long (max 100 chars)", 400, cors);
    }
    const detailsString = entry.details ? JSON.stringify(entry.details) : null;
    if (detailsString && detailsString.length > 10_000) {
      return errorResponse("entry.details too large (max 10KB)", 400, cors);
    }

    // ─── IP extraction (best effort, niente PII collection invasiva) ──
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // ─── INSERT con service_role ──────────────────────────────────────
    const { error: insertError } = await supabaseAdmin
      .from("admin_audit_log")
      .insert({
        user_id: userId,
        action: entry.action,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        details: entry.details ?? null,
        ip_address: ipAddress,
      });

    if (insertError) {
      return errorResponse(`Insert failed: ${insertError.message}`, 500, cors);
    }

    return jsonResponse({ logged: true }, 200, cors);
  } catch (err) {
    return errorResponse(`Internal error: ${(err as Error).message}`, 500, cors);
  }
});
