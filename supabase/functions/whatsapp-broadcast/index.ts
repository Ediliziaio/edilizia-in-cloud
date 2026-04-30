import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BroadcastContact = {
  id: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
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
    const { company_id, segment, segment_config, template_name, message_text, template_language, template_parameters } = body;

    if (!company_id || !template_name) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: company_id, template_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await assertMetaCompanyAdminAccess(adminClient, userId, company_id);

    // Get WhatsApp config
    const { data: waConfig } = await adminClient
      .from("messaging_whatsapp_config")
      .select("phone_number_id, access_token_encrypted")
      .eq("company_id", company_id)
      .eq("is_connected", true)
      .maybeSingle();

    if (!waConfig?.phone_number_id || !waConfig?.access_token_encrypted) {
      return new Response(
        JSON.stringify({ error: "WhatsApp non configurato per questa azienda" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt token
    const encKey = getEncryptionKey();
    const accessToken = await decryptMaybeEncrypted(waConfig.access_token_encrypted, encKey);

    // Build contact query based on segment
    let query = adminClient
      .from("marketing_contacts")
      .select("id, phone, first_name, last_name, email")
      .eq("company_id", company_id)
      .not("phone", "is", null)
      .eq("unsubscribed", false)
      .or("optout_whatsapp.is.null,optout_whatsapp.eq.false");

    const seg = segment || "tutti";
    const segCfg = segment_config || {};

    if (seg === "tag" && !segCfg.tag) {
      return new Response(
        JSON.stringify({ error: "Seleziona un tag prima di inviare il broadcast" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (seg === "source" && !segCfg.source) {
      return new Response(
        JSON.stringify({ error: "Seleziona una fonte prima di inviare il broadcast" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (seg === "pipeline") {
      return new Response(
        JSON.stringify({ error: "Il segmento pipeline non è ancora collegato ai contatti marketing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (seg === "tag" && segCfg.tag) {
      query = query.contains("tags", [segCfg.tag]);
    } else if (seg === "source" && segCfg.source) {
      query = query.eq("source", segCfg.source);
    } else if (seg === "lead_caldi") {
      query = query.contains("tags", ["hot"]);
    } else if (seg === "nuovi") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      query = query.gte("created_at", sevenDaysAgo);
    }
    // "tutti" uses all opted-in contacts with phone.

    const { data: contacts, error: contactsErr } = await query.limit(1000);

    if (contactsErr) {
      return new Response(
        JSON.stringify({ error: "Errore recupero contatti: " + contactsErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nessun contatto trovato per il segmento selezionato" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create broadcast record
    const { data: broadcast, error: broadcastErr } = await adminClient
      .from("whatsapp_broadcasts")
      .insert({
        company_id,
        segment: seg,
        segment_config: segCfg,
        template_name,
        message_text: message_text || "",
        total_contacts: contacts.length,
        status: "sending",
        created_by: userId,
      })
      .select("id")
      .single();

    if (broadcastErr || !broadcast) {
      return new Response(
        JSON.stringify({ error: "Errore creazione broadcast: " + (broadcastErr?.message || "unknown") }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send to each contact
    let sentCount = 0;
    let failedCount = 0;

    for (const contact of contacts as BroadcastContact[]) {
      const cleanPhone = (contact.phone || "").replace(/[^0-9]/g, "");
      if (!cleanPhone) {
        failedCount++;
        continue;
      }

      // Build template payload
      const components: Array<Record<string, unknown>> = [];
      const parameterValues = Array.isArray(template_parameters)
        ? template_parameters
            .map((value: unknown) => resolveVariables(String(value || ""), contact))
            .filter((value) => value.trim().length > 0)
        : [];

      if (parameterValues.length > 0) {
        components.push({
          type: "body",
          parameters: parameterValues.map((text) => ({ type: "text", text })),
        });
      } else if (message_text) {
        const resolvedText = (message_text || "")
          .replace(/\{\{nome\}\}/g, contact.first_name || "")
          .replace(/\{\{cognome\}\}/g, contact.last_name || "")
          .replace(/\{\{email\}\}/g, contact.email || "")
          .replace(/\{\{telefono\}\}/g, contact.phone || "")
          .replace(/\{\{azienda\}\}/g, "");

        components.push({
          type: "body",
          parameters: [{ type: "text", text: resolvedText }],
        });
      }

      const messagePayload = {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: template_name,
          language: { code: template_language || "it" },
          components: components.length > 0 ? components : undefined,
        },
      };

      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(messagePayload),
          }
        );

        const result = await res.json();

        if (res.ok) {
          sentCount++;
          await adminClient.from("whatsapp_broadcast_recipients").insert({
            broadcast_id: broadcast.id,
            contact_id: contact.id,
            phone: cleanPhone,
            status: "sent",
            meta_message_id: result.messages?.[0]?.id || null,
            sent_at: new Date().toISOString(),
          });
        } else {
          failedCount++;
          await adminClient.from("whatsapp_broadcast_recipients").insert({
            broadcast_id: broadcast.id,
            contact_id: contact.id,
            phone: cleanPhone,
            status: "failed",
            error_message: result.error?.message || "Unknown error",
          });
        }
      } catch (err: unknown) {
        failedCount++;
        await adminClient.from("whatsapp_broadcast_recipients").insert({
          broadcast_id: broadcast.id,
          contact_id: contact.id,
          phone: cleanPhone,
          status: "failed",
          error_message: getErrorMessage(err),
        });
      }

      // Basic rate limiting: ~50 msgs/sec
      if ((sentCount + failedCount) % 50 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Update broadcast status
    const finalStatus = failedCount === contacts.length ? "failed" : failedCount > 0 ? "partial_failed" : "completed";
    await adminClient
      .from("whatsapp_broadcasts")
      .update({
        sent_count: sentCount,
        failed_count: failedCount,
        status: finalStatus,
        completed_at: new Date().toISOString(),
      })
      .eq("id", broadcast.id);

    return new Response(
      JSON.stringify({
        success: true,
        broadcast_id: broadcast.id,
        total_contacts: contacts.length,
        sent: sentCount,
        failed: failedCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[whatsapp-broadcast] Error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: getErrorStatus(err), headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function resolveVariables(text: string, contact: BroadcastContact): string {
  return text
    .replace(/\{\{nome\}\}/g, contact.first_name || "")
    .replace(/\{\{cognome\}\}/g, contact.last_name || "")
    .replace(/\{\{email\}\}/g, contact.email || "")
    .replace(/\{\{telefono\}\}/g, contact.phone || "")
    .replace(/\{\{azienda\}\}/g, "");
}
