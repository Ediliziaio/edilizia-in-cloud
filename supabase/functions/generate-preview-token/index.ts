/**
 * generate-preview-token — IMP "Visualizza Come"
 * Genera un token monouso (TTL 15 min) per aprire un portale in modalità
 * SuperAdmin-preview. Richiede autenticazione come super_admin.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Autenticazione: solo super_admin ────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Non autorizzato" }), {
      status: 401, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Sessione non valida" }), {
      status: 401, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  // Verifica ruolo super_admin
  const { data: roleRow } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();

  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Accesso negato — solo super_admin" }), {
      status: 403, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  // ── Parsing payload ─────────────────────────────────────────────────────────
  const body = await req.json() as {
    targetUserId?: string;
    targetRole?: string;
    companyId?: string;
  };

  const { targetUserId, targetRole, companyId } = body;

  if (!targetUserId || !targetRole || !companyId) {
    return new Response(
      JSON.stringify({ error: "targetUserId, targetRole e companyId sono obbligatori" }),
      { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  const allowedRoles = ["employee", "subcontractor", "customer"];
  if (!allowedRoles.includes(targetRole)) {
    return new Response(
      JSON.stringify({ error: `targetRole non supportato. Valori ammessi: ${allowedRoles.join(", ")}` }),
      { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  // ── Verifica che l'utente target appartenga alla company ────────────────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: targetProfile } = await adminClient
    .from("profiles")
    .select("id, company_id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!targetProfile) {
    return new Response(JSON.stringify({ error: "Utente target non trovato" }), {
      status: 404, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  if (targetProfile.company_id !== companyId) {
    return new Response(
      JSON.stringify({ error: "L'utente target non appartiene alla company indicata" }),
      { status: 403, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  // ── Crea il token preview ────────────────────────────────────────────────────
  const { data: tokenRow, error: insertError } = await (adminClient
    .from("superadmin_preview_tokens" as never)
    .insert({
      created_by:     user.id,
      target_user_id: targetUserId,
      target_role:    targetRole,
      company_id:     companyId,
    } as never)
    .select("token")
    .single() as unknown as Promise<{
      data: { token: string } | null;
      error: { message: string } | null;
    }>);

  if (insertError || !tokenRow) {
    console.error("[generate-preview-token] Insert error:", insertError?.message);
    return new Response(JSON.stringify({ error: "Errore creazione token" }), {
      status: 500, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ token: tokenRow.token }),
    { headers: { ...corsH, "Content-Type": "application/json" } }
  );
});
