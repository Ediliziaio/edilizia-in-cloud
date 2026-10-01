import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signVariation } from "./sign.ts";

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, corsH);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const result = await signVariation(await req.json(), (args) => admin.rpc("odv_sign_with_token", args));
    return result.success
      ? jsonResponse({ success: true }, 200, corsH)
      : errorResponse(result.message, result.status, corsH);
  } catch (error) {
    console.error("[firma-odv-webhook]", error);
    return errorResponse("Impossibile registrare la firma. Riprova.", 500, corsH);
  }
});
