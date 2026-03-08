import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { corsHeaders, secureHeaders } from "../_shared/headers.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    const { conversation_id, content } = await req.json();

    if (!conversation_id || !content?.trim()) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: conversation_id, content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get conversation
    const { data: conv, error: convErr } = await adminClient
      .from("messaging_conversations")
      .select("id, company_id, phone_number, contact_name")
      .eq("id", conversation_id)
      .single();

    if (convErr || !conv) {
      return new Response(
        JSON.stringify({ error: "Conversazione non trovata" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify user belongs to same company
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    const isSuperAdmin = claimsData.claims.user_role === "super_admin";
    if (!isSuperAdmin && profile?.company_id !== conv.company_id) {
      return new Response(
        JSON.stringify({ error: "Non autorizzato per questa conversazione" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get WhatsApp config
    const { data: waConfig } = await adminClient
      .from("messaging_whatsapp_config")
      .select("phone_number_id, access_token_encrypted")
      .eq("company_id", conv.company_id)
      .eq("is_connected", true)
      .maybeSingle();

    if (!waConfig?.phone_number_id || !waConfig?.access_token_encrypted) {
      return new Response(
        JSON.stringify({ error: "WhatsApp non configurato per questa azienda" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3b. Check WhatsApp billing
    const waBilling = await getCompanyBillingConfig(adminClient, conv.company_id, "whatsapp");
    if (!waBilling.isEnabled) {
      return new Response(
        JSON.stringify({ error: "Servizio WhatsApp disabilitato per questa azienda" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Decrypt access token
    const encKey = getEncryptionKey();
    const accessToken = await decrypt(waConfig.access_token_encrypted, encKey);

    // 5. Send via Meta API
    const cleanPhone = (conv.phone_number || "").replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      return new Response(
        JSON.stringify({ error: "Numero di telefono non disponibile nella conversazione" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body: content.trim() },
        }),
      }
    );

    const metaResult = await metaRes.json();

    if (!metaRes.ok) {
      console.error("[send-whatsapp-reply] Meta API error:", metaResult);
      // Still save the message as failed
      await adminClient.from("messaging_messages").insert({
        conversation_id,
        sender_type: "operator",
        sender_name: "Operatore",
        message_type: "text",
        content: content.trim(),
      });

      return new Response(
        JSON.stringify({
          error: metaResult.error?.message || "Errore invio WhatsApp",
          meta_error: metaResult.error,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Save message in messaging_messages
    const metaMessageId = metaResult.messages?.[0]?.id || null;
    const { error: msgErr } = await adminClient.from("messaging_messages").insert({
      conversation_id,
      sender_type: "operator",
      sender_name: "Operatore",
      message_type: "text",
      content: content.trim(),
      meta_message_id: metaMessageId,
      delivery_status: "sent",
    });

    if (msgErr) {
      console.error("[send-whatsapp-reply] DB insert error:", msgErr);
    }

    // 7. Update conversation last_message_at
    await adminClient
      .from("messaging_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return new Response(
      JSON.stringify({
        success: true,
        meta_message_id: metaResult.messages?.[0]?.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-whatsapp-reply] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
