import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const { company_id } = await req.json();
    if (!company_id) return errorResponse("company_id richiesto");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Non autorizzato", 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user?.id) {
      return errorResponse("Token non valido", 401);
    }

    const userId = user.id;

    // Verify caller belongs to the company (or is super_admin)
    const { data: callerRoles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isSuperAdmin = (callerRoles || []).some((r: any) => r.role === "super_admin");
    if (!isSuperAdmin) {
      const { data: callerProfile } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
      if (!callerProfile || callerProfile.company_id !== company_id) {
        return errorResponse("Non autorizzato", 403);
      }
    }

    // Load branding
    const { data: branding, error } = await supabase
      .from("company_branding")
      .select("custom_domain, custom_domain_cname")
      .eq("company_id", company_id)
      .single();

    if (error || !branding?.custom_domain || !branding?.custom_domain_cname) {
      return errorResponse("Nessun dominio configurato");
    }

    // Verify CNAME via Cloudflare DNS-over-HTTPS
    const dnsUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(branding.custom_domain)}&type=CNAME`;
    const dnsResp = await fetch(dnsUrl, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(10_000),
    });
    const dnsData = await dnsResp.json();

    const cnameAnswer = dnsData.Answer?.find((a: { type: number }) => a.type === 5);
    const resolvedCname = cnameAnswer?.data?.replace(/\.$/, "").toLowerCase();
    const expectedCname = branding.custom_domain_cname.toLowerCase().replace(/\.$/, "");
    const verified = resolvedCname === expectedCname;

    if (verified) {
      await supabase
        .from("company_branding")
        .update({
          custom_domain_verified: true,
          custom_domain_verified_at: new Date().toISOString(),
        })
        .eq("company_id", company_id);

      return jsonResponse({ verified: true });
    }

    return jsonResponse({
      verified: false,
      error: `CNAME trovato: ${resolvedCname || "nessuno"} — atteso: ${expectedCname}`,
    });
  } catch (err) {
    return errorResponse("Errore interno: " + String(err), 500);
  }
});
