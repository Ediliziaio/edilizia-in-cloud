import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";
import { getCorsHeaders, secureHeaders } from "../_shared/headers.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";

type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  example?: unknown;
  [key: string]: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: secureHeaders,
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: claimsError } = await supabaseUser.auth.getUser(token);
    if (claimsError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: secureHeaders,
      });
    }
    const userId = user.id;

    const body = await req.json();
    // wa_number_id: numero/WABA specifico su cui operare (template per-WABA, niente mischiate).
    // variable_mapping: mappa posizione variabile → campo contatto (es {"1":"nome"}).
    const { action, company_id, wa_number_id, variable_mapping } = body;

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id richiesto" }),
        { status: 400, headers: secureHeaders }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await assertMetaCompanyAdminAccess(adminClient, userId, company_id);

    // Get WhatsApp config (need waba_id for template API) — sul NUMERO/WABA scelto
    // (wa_number_id), così i template non si mischiano tra numeri/aziende diverse.
    const sender = await resolveWhatsAppSender(adminClient, company_id, wa_number_id);
    if (!sender?.wabaId) {
      return new Response(
        JSON.stringify({ error: "WhatsApp Business Account non configurato" }),
        { status: 400, headers: secureHeaders }
      );
    }

    const accessToken = sender.accessToken;
    const wabaId = sender.wabaId;

    // ── LIST templates ──
    if (action === "list") {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const data = await res.json();

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || "Errore Meta API" }),
          { status: 502, headers: secureHeaders }
        );
      }

      return new Response(JSON.stringify({ templates: data.data || [] }), {
        status: 200,
        headers: secureHeaders,
      });
    }

    // ── CREATE template ──
    if (action === "create") {
      const { template } = body;
      if (!template?.name || !template?.category || !template?.components) {
        return new Response(
          JSON.stringify({ error: "Dati template incompleti" }),
          { status: 400, headers: secureHeaders }
        );
      }

      const components = addTemplateExamples(template.components as TemplateComponent[]);
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
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
          { status: 502, headers: secureHeaders }
        );
      }

      // Salva la riga locale con la mappatura variabili (preservata dal sync).
      // Solo se conosciamo il numero/WABA: senza wa_number_id non potremmo
      // attribuire la riga (evita righe orfane con wa_number_id NULL).
      if (wa_number_id) {
        await persistTemplateRow(adminClient, {
          companyId: company_id,
          waNumberId: wa_number_id,
          name: template.name,
          language: template.language || "it",
          category: template.category,
          components,
          status: "PENDING",
          variableMapping: variable_mapping ?? null,
        });
      }

      return new Response(JSON.stringify({ success: true, template: data }), {
        status: 200,
        headers: secureHeaders,
      });
    }

    // ── EDIT template ──
    // Meta consente la modifica di un template esistente via POST sull'ID del
    // template (non sulla WABA). Si possono cambiare components e category; il
    // nome e la lingua NON sono modificabili (in tal caso va creato un nuovo
    // template). Dopo la modifica il template torna in stato PENDING.
    if (action === "edit") {
      const { template } = body;
      if (!template?.id || !Array.isArray(template?.components)) {
        return new Response(
          JSON.stringify({ error: "Per modificare servono id template e components" }),
          { status: 400, headers: secureHeaders }
        );
      }

      const components = addTemplateExamples(template.components as TemplateComponent[]);
      const editPayload: Record<string, unknown> = { components };
      if (template.category) editPayload.category = template.category;

      const res = await fetch(
        `https://graph.facebook.com/v21.0/${template.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(editPayload),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || "Errore modifica template" }),
          { status: 502, headers: secureHeaders }
        );
      }

      // Aggiorna la riga locale (mappatura variabili + componenti) se conosciamo
      // nome e lingua del template (passati dal client in modifica).
      if (wa_number_id && template.name && template.language) {
        await persistTemplateRow(adminClient, {
          companyId: company_id,
          waNumberId: wa_number_id,
          name: template.name,
          language: template.language,
          category: template.category,
          components,
          status: "PENDING",
          variableMapping: variable_mapping ?? null,
        });
      }

      return new Response(JSON.stringify({ success: true, template: data }), {
        status: 200,
        headers: secureHeaders,
      });
    }

    // ── DELETE template ──
    if (action === "delete") {
      const { template_name } = body;
      if (!template_name) {
        return new Response(
          JSON.stringify({ error: "template_name richiesto" }),
          { status: 400, headers: secureHeaders }
        );
      }

      const res = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/message_templates?name=${encodeURIComponent(template_name)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || "Errore eliminazione template" }),
          { status: 502, headers: secureHeaders }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: secureHeaders,
      });
    }

    return new Response(
      JSON.stringify({ error: "Azione non valida. Usa: list, create, edit, delete" }),
      { status: 400, headers: secureHeaders }
    );
  } catch (err: unknown) {
    console.error("[whatsapp-templates] Error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: getErrorStatus(err), headers: secureHeaders }
    );
  }
});

// Upsert della riga locale wa_meta_templates con la mappatura variabili.
// onConflict (wa_number_id, template_name, template_language) = stessa chiave del
// sync, così crea/aggiorna senza duplicare. variable_mapping è preservata dal sync.
async function persistTemplateRow(
  adminClient: ReturnType<typeof createClient>,
  args: {
    companyId: string;
    waNumberId: string;
    name: string;
    language: string;
    category?: string;
    components: TemplateComponent[];
    status: string;
    variableMapping: Record<string, string> | null;
  },
): Promise<void> {
  try {
    const bodyComp = (args.components || []).find((c) => c.type === "BODY");
    const bodyText = typeof bodyComp?.text === "string" ? bodyComp.text : "";
    // Conta i numeri distinti dei placeholder ({{1}},{{2}}…) — coerente con
    // sync-meta-templates (entrambi usano la cifra catturata).
    const variablesCount = new Set(
      [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]),
    ).size;

    await adminClient.from("wa_meta_templates").upsert({
      company_id: args.companyId,
      wa_number_id: args.waNumberId,
      template_name: args.name,
      template_language: args.language,
      category: args.category ?? null,
      status: args.status,
      components_json: args.components,
      variables_count: variablesCount,
      variable_mapping: args.variableMapping,
      synced_at: new Date().toISOString(),
    }, { onConflict: "wa_number_id,template_name,template_language" });
  } catch (e) {
    console.error("[whatsapp-templates] persistTemplateRow:", e);
  }
}

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
