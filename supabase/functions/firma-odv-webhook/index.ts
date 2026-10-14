import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signVariation } from "./sign.ts";

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, corsH);
  try {
    if(Number(req.headers.get("content-length")??0)>2*1024*1024)return errorResponse("Firma troppo grande",413,corsH);
    const raw=await req.text();
    if(raw.length>2*1024*1024)return errorResponse("Firma troppo grande",413,corsH);
    let body:unknown;try{body=JSON.parse(raw);}catch{return errorResponse("Richiesta non valida",400,corsH);}
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const result = await signVariation(body, (args) => admin.rpc("variation_sign_verified", args));
    return result.success
      ? jsonResponse({ success: true }, 200, corsH)
      : errorResponse(result.message, result.status, corsH);
  } catch (error) {
    console.error("[firma-odv-webhook]", error);
    return errorResponse("Impossibile registrare la firma. Riprova.", 500, corsH);
  }
});
