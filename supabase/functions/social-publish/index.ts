// ============================================================================
// social-publish — pubblica-ora di un singolo social_post (user-auth)
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { publishSocialPost, type SocialPostRow } from "../_shared/socialPublishCore.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const jsonResponse = (data: unknown, status = 200, headers = cors) =>
  new Response(JSON.stringify(data), { status, headers });
const errorResponse = (message: string, status = 400, headers = cors) =>
  new Response(JSON.stringify({ ok: false, error: message }), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return errorResponse("Non autenticato", 401, cors);

    const body = await req.json().catch(() => ({}));
    const postId = body?.post_id as string | undefined;
    const companyId = body?.company_id as string | undefined;
    if (!postId || !companyId) return errorResponse("post_id e company_id richiesti", 400, cors);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verifica identità + accesso azienda con il client utente
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authErr } = await userClient.auth.getUser();
    if (authErr || !auth?.user) return errorResponse("Sessione non valida", 401, cors);
    try {
      await verifyCompanyAccess(userClient, auth.user.id, companyId);
    } catch {
      return errorResponse("Accesso non autorizzato a questa azienda", 403, cors);
    }

    // Token criptati e tabelle protette → client service-role
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: post, error: postErr } = await admin
      .from("social_posts").select("*").eq("id", postId).eq("company_id", companyId).single();
    if (postErr || !post) return errorResponse("Post non trovato", 404, cors);

    const { ok, result } = await publishSocialPost(admin, post as SocialPostRow);
    return jsonResponse({ ok, result }, 200, cors);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Errore interno", 500);
  }
});
