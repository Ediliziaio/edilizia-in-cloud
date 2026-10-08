// Actual saved bathroom intervention model, not a disguised classic quote.
// Does not send messages or mutate the source quote.
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { chiamataInternaValida } from "../_shared/chiamataInterna.ts";
import { generateBathroomModelPdf } from "./generate.ts";
// @ts-ignore generated server bundle
import { renderBagnoReale } from "./_render.mjs";

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, corsH);
  try {
    const body = await req.json();
    const interna = chiamataInternaValida(req) && typeof body?.per_utente === "string";
    const { userId, supabaseAdmin } = interna
      ? { userId: body.per_utente, supabaseAdmin: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!) }
      : await requireAuth(req, corsH);
    const result = await generateBathroomModelPdf(supabaseAdmin, userId, body, renderBagnoReale);
    return jsonResponse(result, 200, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(JSON.stringify({ level: "error", fn: "bgn-genera-pdf", err: err instanceof Error ? err.message : String(err) }));
    return errorResponse(err instanceof Error ? err.message : "Generazione non confermata. Nessun PDF semplificato usato.", 422, corsH);
  }
});
