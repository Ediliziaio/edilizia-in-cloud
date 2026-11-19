import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

// Il database collega le fonti esistenti e impedisce le doppie registrazioni.
// Si usa il JWT dell'utente: il permesso di leggere l'azienda non autorizza
// da solo a modificarne la prima nota tramite il client amministrativo.
Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const { company_id, action = "both", preview = false } = await req.json();
    if (typeof company_id !== "string" || !["both", "from_banking", "from_invoices"].includes(action)) {
      return errorResponse("Azienda o origine non valida", 400, cors);
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc("prima_nota_allinea_fonti", {
      p_company: company_id, p_origine: action, p_anteprima: preview === true,
    });
    if (error) return errorResponse(error.message, error.code === "42501" ? 403 : 400, cors);
    return jsonResponse({ success: true, ...data }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("sync-prima-nota:", e);
    return errorResponse("Impossibile riallineare la prima nota. Riprova.", 500, cors);
  }
});
