/**
 * provision-custom-domain — Automatizza aggiunta custom domain su Cloudflare Pages.
 * Input: { company_id, custom_domain }
 * Auth: company_owner o super_admin
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeadersSync, errorResponse } from "../_shared/headers.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const BLOCKED_DOMAINS = ["ediliziaincloud.it", "ediliziaincloud.com", "supabase.co", "supabase.com"];

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

    if (!cfToken || !cfAccountId) {
      return errorResponse("Cloudflare API non configurata. Contatta il supporto.", 503);
    }

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return errorResponse("Non autenticato", 401);

    const { company_id, custom_domain } = await req.json();
    if (!company_id || !custom_domain) {
      return errorResponse("company_id e custom_domain sono obbligatori");
    }

    // Validazione dominio
    const domain = custom_domain.trim().toLowerCase();
    if (!DOMAIN_REGEX.test(domain)) {
      return errorResponse("Formato dominio non valido");
    }
    if (BLOCKED_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) {
      return errorResponse("Non puoi usare un dominio della piattaforma");
    }

    // Verifica permessi: company_owner o super_admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const isSuperAdmin = role?.role === "super_admin";
    const isCompanyOwner = profile?.company_id === company_id && role?.role === "company_admin";
    if (!isSuperAdmin && !isCompanyOwner) {
      return errorResponse("Permessi insufficienti", 403);
    }

    // Gate: verifica tier white-label
    const { data: branding } = await supabase
      .from("company_branding")
      .select("whitelabel_tier, custom_domain")
      .eq("company_id", company_id)
      .maybeSingle();

    const tier = branding?.whitelabel_tier ?? "none";
    if (tier !== "full" && tier !== "agency") {
      return errorResponse("Il tuo piano non include il dominio custom. Effettua l'upgrade.", 403);
    }

    // Verifica dominio non già in uso
    const { data: existing } = await supabase
      .from("company_branding")
      .select("id")
      .eq("custom_domain", domain)
      .neq("company_id", company_id)
      .maybeSingle();

    if (existing) {
      return errorResponse("Questo dominio è già associato a un'altra azienda");
    }

    // P2-5: Cloudflare API con timeout 30s — evita hangare edge function.
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/pages/projects/${cfProjectName}/domains`;
    const cfRes = await fetchWithTimeout(cfUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
      timeoutMs: 30_000,
    });

    const cfData = await cfRes.json();
    if (!cfRes.ok && !cfData?.result?.name) {
      // Se il dominio è già aggiunto (409), prosegui comunque
      if (cfRes.status !== 409) {
        console.error("Cloudflare error:", cfData);
        return errorResponse("Errore durante l'aggiunta del dominio su Cloudflare. Riprova.", 502);
      }
    }

    // CNAME target: per Cloudflare Pages è tipicamente <project>.pages.dev
    const cnameTarget = `${cfProjectName}.pages.dev`;

    // Aggiorna company_branding
    await supabase
      .from("company_branding")
      .update({
        custom_domain: domain,
        custom_domain_cname: cnameTarget,
        custom_domain_verified: false,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", company_id);

    // Audit log
    await supabase.from("whitelabel_audit_log").insert({
      company_id,
      action: "domain_added",
      actor_id: user.id,
      new_value: { domain, cname_target: cnameTarget },
    });

    return new Response(
      JSON.stringify({
        success: true,
        cname_target: cnameTarget,
        instructions: `Configura un record CNAME per "${domain}" che punta a "${cnameTarget}". La propagazione DNS può richiedere fino a 24 ore.`,
      }),
      { status: 200, headers: { ...getCorsHeadersSync(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("provision-custom-domain error:", err);
    return errorResponse("Errore interno", 500);
  }
});
