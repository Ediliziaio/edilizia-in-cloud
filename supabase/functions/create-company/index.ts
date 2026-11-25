import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { conMetriche } from "../_shared/withMetrics.ts";
import { creaAzienda } from "../_shared/creaAzienda.ts";

// 25/11/2026: la creazione sta in _shared/creaAzienda.ts, condivisa con platform-mcp.
Deno.serve(conMetriche("create-company", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    // --- Authentication & Authorization: only super_admin can create companies ---
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);
    return await creaAzienda(supabaseAdmin, await req.json(), corsH);
  } catch (error) {
    if (error instanceof Response) return error;

    return errorResponse((error as Error).message);
  }
}));
