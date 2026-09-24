import { aziendaAccessibile, requireAuth, requireRole } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { revocaSessioni } from "../_shared/revocaSessioni.ts";

// La revoca chiude l'accesso vero (auth.sessions), non solo la riga di
// user_sessions: vedi _shared/revocaSessioni.ts.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    // Only company_admin or super_admin can revoke sessions
    await requireRole(supabaseAdmin, userId, ["company_admin", "super_admin"], corsH);

    const esito = await revocaSessioni(
      supabaseAdmin,
      userId,
      await req.json(),
      (utenteId, aziendaId) => aziendaAccessibile(supabaseAdmin, utenteId, aziendaId),
    );

    return new Response(JSON.stringify(esito.corpo), {
      status: esito.status,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("revoke-user-session error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
