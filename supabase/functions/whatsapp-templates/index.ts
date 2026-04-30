import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  example?: unknown;
  [key: string]: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { action, company_id } = body;

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id richiesto" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await assertMetaCompanyAdminAccess(adminClient, userId, company_id);

    // Get WhatsApp config (need waba_id for template API)
    const { data: waConfig } = await adminClient
      .from("messaging_whatsapp_config")
      .select("waba_id, access_token_encrypted")
      .eq("company_id", company_id)
      .eq("is_connected", true)
      .maybeSingle();

    if (!waConfig?.waba_id || !waConfig?.access_token_encrypted) {
      return new Response(
        JSON.stringify({ error: "WhatsApp Business Account non configurato" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const encKey = getEncryptionKey();
    const accessToken = await decryptMaybeEncrypted(waConfig.access_token_encrypted, encKey);

    // ── LIST templates ──
    if (action === "list") {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${waConfig.waba_id}/message_templates?limit=100`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const data = await res.json();

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || "Errore Meta API" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ templates: data.data || [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE template ──
    if (action === "create") {
      const { template } = body;
      if (!template?.name || !template?.category || !template?.components) {
        return new Response(
          JSON.stringify({ error: "Dati template incompleti" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const components = addTemplateExamples(template.components as TemplateComponent[]);
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${waConfig.waba_id}/message_templates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: template.name,
            category: template.category,
            language: template.language || "it",
            components,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || "Errore creazione template" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true, template: data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE template ──
    if (action === "delete") {
      const { template_name } = body;
      if (!template_name) {
        return new Response(
          JSON.stringify({ error: "template_name richiesto" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const res = await fetch(
        `https://graph.facebook.com/v21.0/${waConfig.waba_id}/message_templates?name=${encodeURIComponent(template_name)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || "Errore eliminazione template" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Azione non valida. Usa: list, create, delete" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[whatsapp-templates] Error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: getErrorStatus(err), headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function addTemplateExamples(components: TemplateComponent[]): TemplateComponent[] {
  return (components || []).map((component) => {
    if (component.example || typeof component.text !== "string") return component;

    const placeholders = component.text.match(/\{\{\d+\}\}/g) || [];
    if (placeholders.length === 0) return component;

    if (component.type === "BODY") {
      return {
        ...component,
        example: {
          body_text: [placeholders.map((_, index) => `Esempio ${index + 1}`)],
        },
      };
    }

    if (component.type === "HEADER" && component.format === "TEXT") {
      return {
        ...component,
        example: {
          header_text: ["Esempio"],
        },
      };
    }

    return component;
  });
}
