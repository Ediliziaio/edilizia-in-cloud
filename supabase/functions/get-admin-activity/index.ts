import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

/**
 * get-admin-activity — il SUPER_ADMIN ottiene l'attività di accesso (ultimo
 * login + data creazione account) di una lista di utenti gestiti (admin
 * produttore, owner studio commercialista, …). Serve a mostrare nelle dashboard
 * "quando lo usano": ultimo accesso, dormienti, mai entrati.
 *
 * Fonte: auth.users.last_sign_in_at (leggibile solo dall'admin API).
 * Gate super_admin (con allowlist email come difesa-in-profondità).
 */
const MAX_IDS = 300;
const CHUNK = 20; // concorrenza limitata verso l'admin API

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const raw: unknown = body?.user_ids;
    const ids = Array.isArray(raw)
      ? [...new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, MAX_IDS)
      : [];
    if (ids.length === 0) return jsonResponse({ activity: {} }, 200, corsH);

    const activity: Record<string, { last_sign_in_at: string | null; last_active_at: string | null; created_at: string | null }> = {};
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await Promise.all(slice.map(async (id) => {
        try {
          const { data } = await admin.auth.admin.getUserById(id);
          const u = data?.user;
          activity[id] = {
            last_sign_in_at: u?.last_sign_in_at ?? null,
            last_active_at: null,
            created_at: u?.created_at ?? null,
          };
        } catch (_e) {
          activity[id] = { last_sign_in_at: null, last_active_at: null, created_at: null };
        }
      }));
    }

    // Ultima ATTIVITÀ reale dalle sessioni (user_sessions.last_active_at): più
    // fresca del solo login, perché si aggiorna ad ogni uso/boot del portale.
    try {
      const { data: sess } = await admin
        .from("user_sessions").select("user_id, last_active_at").in("user_id", ids);
      for (const row of (sess ?? []) as Array<{ user_id: string; last_active_at: string | null }>) {
        const cur = activity[row.user_id];
        if (!cur || !row.last_active_at) continue;
        const prevMs = cur.last_active_at ? Date.parse(cur.last_active_at) : 0;
        if (Date.parse(row.last_active_at) > prevMs) cur.last_active_at = row.last_active_at;
      }
    } catch (_e) { /* best-effort: senza sessioni resta il solo last_sign_in_at */ }

    return jsonResponse({ activity }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("get-admin-activity error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
