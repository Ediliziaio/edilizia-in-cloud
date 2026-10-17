import { getCorsHeaders } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCompanyAccess } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { order_id, signer_email, signer_name } = await req.json();

    if (!order_id || !signer_email) {
      return new Response(JSON.stringify({ error: "order_id and signer_email are required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get order info
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, order_code, company_id, description")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // SECURITY (audit run-1, HIGH IDOR cross-tenant): l'ordine e' caricato col
    // service role (bypassa RLS). Senza questo controllo qualsiasi utente
    // autenticato potrebbe creare una richiesta di firma su un ordine di
    // un'altra azienda. Legare l'ordine all'azienda del chiamante, come fa
    // send-quote-signature. requireCompanyAccess lancia una Response (403) se
    // l'utente non appartiene a order.company_id.
    await requireCompanyAccess(supabaseAdmin, user.id, order.company_id, getCorsHeaders(req));

    // Create signature request
    const { data: sigRequest, error: insertError } = await supabaseAdmin
      .from("signature_requests")
      .insert({
        company_id: order.company_id,
        order_id: order.id,
        signer_email,
        signer_name: signer_name || null,
        created_by: user.id,
      })
      .select("id, token")
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      id: sigRequest.id,
      token: sigRequest.token,
      message: "Signature request created successfully",
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    // requireCompanyAccess/requireAuth lanciano una Response gia' pronta (403/401).
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Errore imprevisto";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
