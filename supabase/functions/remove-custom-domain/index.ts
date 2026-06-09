/**
 * remove-custom-domain — Rimuove un custom domain da Cloudflare Pages
 * e pulisce i campi in company_branding.
 * Input: { company_id }
 * Auth: company_owner o super_admin
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeadersSync, errorResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeadersSync(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const cfProjectName = Deno.env.get("CLOUDFLARE_PROJECT_NAME") ?? "edilizia-in-cloud";

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return errorResponse("Non autenticato", 401);

    const { company_id } = await req.json();
    if (!company_id) return errorResponse("company_id obbligatorio");

    // Verifica permessi
    // user_roles può avere N righe per utente → niente .single() (romperebbe i multi-ruolo).
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roleSet = new Set((roleRows ?? []).map((r: { role: string }) => r.role));

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    const isSuperAdmin = roleSet.has("super_admin");
    const isOwnerOrProduttore = profile?.company_id === company_id
      && (roleSet.has("company_admin") || roleSet.has("produttore_admin"));
    if (!isSuperAdmin && !isOwnerOrProduttore) {
      return errorResponse("Permessi insufficienti", 403);
    }

    // Leggi dominio corrente
    const { data: branding } = await supabase
      .from("company_branding")
      .select("custom_domain")
      .eq("company_id", company_id)
      .maybeSingle();

    const domain = branding?.custom_domain;
    if (!domain) {
      return errorResponse("Nessun dominio custom configurato");
    }

    // Rimuovi da Cloudflare Pages (se configurato)
    if (cfToken && cfAccountId) {
      try {
        const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/pages/projects/${cfProjectName}/domains/${domain}`;
        await fetch(cfUrl, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${cfToken}` },
        });
      } catch (err) {
        console.warn("Cloudflare domain removal failed (non-blocking):", err);
      }
    }

    // Pulisci campi in company_branding
    await supabase
      .from("company_branding")
      .update({
        custom_domain: null,
        custom_domain_cname: null,
        custom_domain_verified: false,
        custom_domain_verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", company_id);

    // Audit log
    await supabase.from("whitelabel_audit_log").insert({
      company_id,
      action: "domain_removed",
      actor_id: user.id,
      old_value: { domain },
    });

    return new Response(
      JSON.stringify({ success: true, message: `Dominio ${domain} rimosso con successo.` }),
      { status: 200, headers: { ...getCorsHeadersSync(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("remove-custom-domain error:", err);
    return errorResponse("Errore interno", 500);
  }
});
