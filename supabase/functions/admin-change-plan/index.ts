import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { changeCompanyPlan } from "../_shared/changeCompanyPlan.ts";
import { conMetriche } from "../_shared/withMetrics.ts";


Deno.serve(conMetriche("admin-change-plan", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    // Parse + validate input — S1.9 hardening
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Body JSON non valido", 400, corsH);
    }
    return await changeCompanyPlan(supabaseAdmin, userId, body, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin-change-plan] Error:", err);
    return errorResponse("Errore interno", 500, corsH);
  }
}));
