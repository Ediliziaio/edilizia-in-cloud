import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";
import { cancelloAddonWhatsApp } from "../_shared/whatsappAddon.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const jsonHeaders = { ...cors, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  try {
    const { company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id richiesto" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await assertMetaCompanyAdminAccess(adminClient, claimsData.claims.sub as string, company_id);

    // Add-on WhatsApp Business: senza, il popup di Meta non parte nemmeno.
    const bloccoAddon = await cancelloAddonWhatsApp(adminClient, company_id, cors);
    if (bloccoAddon) return bloccoAddon;

    const { metaAppId } = await getMetaCredentials();
    const whatsappConfigId =
      (await getPlatformSetting("whatsapp_config_id", "WHATSAPP_CONFIG_ID")) ||
      (await getPlatformSetting("meta_whatsapp_config_id", "META_WHATSAPP_CONFIG_ID"));

    return new Response(
      JSON.stringify({
        meta_app_id: metaAppId,
        whatsapp_config_id: whatsappConfigId,
        is_configured: Boolean(metaAppId && whatsappConfigId),
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: getErrorMessage(err) }), {
      status: getErrorStatus(err),
      headers: jsonHeaders,
    });
  }
});
