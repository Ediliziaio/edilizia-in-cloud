/**
 * validate-preview-token — IMP "Visualizza Come"
 * Valida e consuma (monouso) un token preview SuperAdmin.
 * NON richiede Authorization JWT — la sicurezza è garantita dall'entropia
 * del token (32 byte random hex = 256 bit, brute-force computazionalmente impossibile).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface PreviewTokenRow {
  id: string;
  token: string;
  target_user_id: string;
  target_role: string;
  company_id: string;
  used_at: string | null;
  expires_at: string;
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Parsing payload ─────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as { token?: string };
  const { token } = body;

  if (!token || typeof token !== "string" || token.length < 32) {
    return new Response(
      JSON.stringify({ valid: false, reason: "Token mancante o malformato" }),
      { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Lookup token ─────────────────────────────────────────────────────────────
  const { data: tokenRow, error: lookupError } = await (adminClient
    .from("superadmin_preview_tokens" as never)
    .select("id, token, target_user_id, target_role, company_id, used_at, expires_at")
    .eq("token" as never, token)
    .maybeSingle() as unknown as Promise<{
      data: PreviewTokenRow | null;
      error: { message: string } | null;
    }>);

  if (lookupError) {
    console.error("[validate-preview-token] Lookup error:", lookupError.message);
    return new Response(
      JSON.stringify({ valid: false, reason: "Errore server" }),
      { status: 500, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  if (!tokenRow) {
    return new Response(
      JSON.stringify({ valid: false, reason: "Token non trovato" }),
      { headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  // ── Controllo scadenza ───────────────────────────────────────────────────────
  if (new Date(tokenRow.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ valid: false, reason: "Token scaduto (TTL 15 minuti)" }),
      { headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  // ── Controllo monouso ────────────────────────────────────────────────────────
  if (tokenRow.used_at !== null) {
    return new Response(
      JSON.stringify({ valid: false, reason: "Token già utilizzato" }),
      { headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  // ── Marca il token come usato (monouso) ──────────────────────────────────────
  const { error: updateError } = await (adminClient
    .from("superadmin_preview_tokens" as never)
    .update({ used_at: new Date().toISOString() } as never)
    .eq("id" as never, tokenRow.id) as unknown as Promise<{
      error: { message: string } | null;
    }>);

  if (updateError) {
    console.error("[validate-preview-token] Update error:", updateError.message);
    // Non blocchiamo la risposta — l'operazione principale ha avuto successo
  }

  return new Response(
    JSON.stringify({
      valid: true,
      targetUserId: tokenRow.target_user_id,
      targetRole:   tokenRow.target_role,
      companyId:    tokenRow.company_id,
    }),
    { headers: { ...corsH, "Content-Type": "application/json" } }
  );
});
