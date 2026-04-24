/**
 * Edge Function: resolve-email-sender
 *
 * Ritorna il mittente effettivo (`from`, `fromEmail`, `replyTo`, ecc.)
 * per la company dell'utente autenticato, per una data stream
 * (transactional | marketing).
 *
 * Usato dall'UI del diario cliente per mostrare chiaramente "Da:
 * Nome Azienda <no-reply@dominio.it>" prima di inviare un'email,
 * e per permettere di override il reply-to prima dell'invio.
 *
 * Body: { stream?: "transactional" | "marketing" }  (default transactional)
 */
import { requireAuth } from "../_shared/auth.ts";
import { resolveSender, type EmailStream } from "../_shared/resolveSender.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json().catch(() => ({}));
    const stream: EmailStream = body?.stream === "marketing" ? "marketing" : "transactional";

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.company_id) {
      return errorResponse("Utente senza azienda associata", 403);
    }

    const resolved = await resolveSender(profile.company_id as string, stream, supabaseAdmin);

    // Fetch preferences (per mostrare anche reply_to custom, sender_name modificabile)
    const { data: prefs } = await supabaseAdmin
      .from("company_email_preferences")
      .select("sender_name, sender_prefix, reply_to_email, transactional_domain_id, marketing_domain_id")
      .eq("company_id", profile.company_id)
      .maybeSingle();

    return jsonResponse({
      success: true,
      stream,
      from: resolved.from,
      from_email: resolved.fromEmail,
      from_name: resolved.fromName ?? null,
      reply_to: resolved.replyTo,
      using_custom_domain: resolved.usingCustomDomain,
      domain: resolved.domain,
      source: resolved.source,
      preferences: prefs ?? null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("resolve-email-sender error:", msg);
    return errorResponse(msg, 500);
  }
});
