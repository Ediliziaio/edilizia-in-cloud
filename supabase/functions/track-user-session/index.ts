import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { idAccessoDalToken } from "../_shared/revocaSessioni.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json();
    const { action } = body;

    // action: "start" | "heartbeat" | "end"

    if (action === "start") {
      const { ip_address, user_agent, device_type, browser, os } = body;

      // Resolve company_id from profile or explicit payload (super_admin impersonation)
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      const companyId = profile?.company_id || body.company_id || null;

      // If no company context is available, skip session tracking without failing the app
      if (!companyId) {
        return new Response(JSON.stringify({ session_id: null, skipped: true }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Una riga per accesso (auth.sessions) e azienda: le schede dello stesso
      // browser condividono l'accesso, e riaprendo l'app si riprende la riga
      // invece di aprirne un'altra. Un accesso già chiuso non ne riapre una,
      // anche se il suo token vale ancora fino alla scadenza. La revoca trova
      // l'accesso da chiudere proprio da qui (revoke-user-session).
      const { data: rigaId, error } = await supabaseAdmin.rpc("registra_sessione_app", {
        p_user_id: userId,
        p_company_id: companyId,
        p_auth_session_id: idAccessoDalToken(req.headers.get("Authorization")),
        p_ip_address: ip_address || null,
        p_user_agent: user_agent || null,
        p_device_type: device_type || null,
        p_browser: browser || null,
        p_os: os || null,
      });

      if (error) throw error;

      return new Response(JSON.stringify(rigaId ? { session_id: rigaId } : { session_id: null, skipped: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (action === "heartbeat") {
      const { session_id } = body;
      if (!session_id) {
        return new Response(JSON.stringify({ error: "session_id required" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin
        .from("user_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", session_id)
        .eq("user_id", userId)
        .eq("is_active", true);

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (action === "end") {
      const { session_id } = body;
      if (!session_id) {
        return new Response(JSON.stringify({ error: "session_id required" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin
        .from("user_sessions")
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
        })
        .eq("id", session_id)
        .eq("user_id", userId);

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("track-user-session error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
