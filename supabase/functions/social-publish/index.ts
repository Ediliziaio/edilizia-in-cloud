// ============================================================================
// social-publish — pubblica-ora di un singolo social_post (user-auth)
// ============================================================================
// Se Instagram sta ancora elaborando un video, la risposta ha pending=true e il
// post resta 'processing': lo completa social-publish-scheduler al giro dopo.
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

const LEASE_MS = 10 * 60_000;

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

    const row = post as SocialPostRow;
    // «Riprova» su un post uscito solo in parte: si ripubblica dove è fallito,
    // non dove è già uscito (niente doppioni su Facebook).
    const riprova = body?.riprova === true;
    const falliti = Object.entries(row.publish_result ?? {})
      .filter(([chiave, esito]) => chiave !== "_error" && esito && esito.ok === false && !esito.pending)
      .map(([chiave]) => chiave);
    if (row.status === "published" && !(riprova && falliti.length > 0)) {
      return errorResponse("Il post è già pubblicato", 409, cors);
    }
    if (row.status === "processing") {
      // Già in mano al cron (o a un altro clic): non si pubblica due volte.
      return jsonResponse({ ok: false, pending: true, status: "processing", result: row.publish_result ?? {} }, 200, cors);
    }
    // Un post da approvare lo pubblica solo chi può approvarlo.
    if (row.status === "review") {
      const { data: puoApprovare } = await userClient.rpc("puo_approvare_post_social", { p_company_id: companyId });
      if (puoApprovare !== true) {
        return errorResponse("Il post è da approvare: lo pubblica il titolare o un amministratore.", 403, cors);
      }
    }

    // Lucchetto: il cron non deve prendere lo stesso post mentre lo pubblichiamo qui.
    const { data: claimed, error: claimErr } = await admin
      .from("social_posts")
      .update({
        status: "processing",
        next_attempt_at: new Date(Date.now() + LEASE_MS).toISOString(),
        publish_attempts: (row.publish_attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .eq("status", row.status)
      .select("id");
    if (!claimErr && (!claimed || claimed.length === 0)) {
      return jsonResponse({ ok: false, pending: true, status: "processing", result: {} }, 200, cors);
    }
    // claimErr = migrazione 20280916910000 non ancora applicata: si pubblica senza lucchetto, come prima.

    // Nel riprova il publisher vede solo le piattaforme già uscite come «fatte»
    // (status processing = eredita gli esiti): le fallite ripartono da zero.
    const daPubblicare: SocialPostRow = row.status === "published"
      ? {
        ...row,
        status: "processing",
        publish_result: Object.fromEntries(
          Object.entries(row.publish_result ?? {}).filter(([chiave, esito]) => chiave !== "_error" && esito?.ok === true),
        ),
      }
      : row;
    const outcome = await publishSocialPost(admin, daPubblicare, { inlineWaitMs: 20_000 });
    return jsonResponse(outcome, 200, cors);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Errore interno", 500);
  }
});
