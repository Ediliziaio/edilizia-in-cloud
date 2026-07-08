import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";
import { assertCompanyMemberAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { conversation_id, content } = await req.json();

    if (!conversation_id || !content?.trim()) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: conversation_id, content" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    await assertCompanyMemberAccess(adminClient, userId, conv.company_id, {
      requiredPermission: "can_view_marketing_whatsapp",
    });

    // 3. Get WhatsApp config (nuovo multi-numero con fallback legacy)
    const sender = await resolveWhatsAppSender(adminClient, conv.company_id);
    if (!sender) {
      return new Response(
        JSON.stringify({ error: "WhatsApp non configurato per questa azienda" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // 3b. Check WhatsApp billing
    const waBilling = await getCompanyBillingConfig(adminClient, conv.company_id, "whatsapp");
    if (!waBilling.isEnabled) {
      return new Response(
        JSON.stringify({ error: "Servizio WhatsApp disabilitato per questa azienda" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // 3c. Pre-check crediti PRIMA di erogare. Il vecchio flusso inviava su Meta
    // e tentava il deduct DOPO: su wallet assente inseriva un saldo negativo che
    // violava il CHECK >= 0 in silenzio → messaggi di fatto gratuiti e nessun
    // errore all'utente. Ora, se l'azienda non è comped, senza saldo si blocca
    // qui con un 402 chiaro (gestito dal PaymentGateDialog nel frontend).
    if (!waBilling.isFree) {
      const pricePerMsg = waBilling.pricePerUnitEur ?? 0.0006;
      const { data: wallet } = await adminClient
        .from("whatsapp_credits")
        .select("balance_eur, sends_blocked")
        .eq("company_id", conv.company_id)
        .maybeSingle();
      const balance = Number(wallet?.balance_eur ?? 0);
      if (wallet?.sends_blocked || balance < pricePerMsg) {
        return new Response(
          JSON.stringify({
            error: "insufficient_credits",
            message: "Crediti WhatsApp esauriti. Ricarica il wallet da Impostazioni → Crediti per continuare a inviare messaggi.",
          }),
          { status: 402, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    }

    // 4. Access token (già decifrato dall'helper)
    const accessToken = sender.accessToken;

    // 5. Send via Meta API
    const cleanPhone = (conv.phone_number || "").replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      return new Response(
        JSON.stringify({ error: "Numero di telefono non disponibile nella conversazione" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${sender.phoneNumberId}/messages`,
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
      // Save the message as failed so UI can show error indicator
      await adminClient.from("messaging_messages").insert({
        conversation_id,
        sender_type: "operator",
        sender_name: "Operatore",
        message_type: "text",
        content: content.trim(),
        delivery_status: "failed",
      });

      return new Response(
        JSON.stringify({
          error: metaResult.error?.message || "Errore invio WhatsApp",
          meta_error: metaResult.error,
        }),
        { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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

    // 8. Deduct WhatsApp credit (if not free) — RPC atomica (FOR UPDATE + log).
    // Sostituisce il vecchio read-modify-write che su wallet mancante inseriva
    // un saldo NEGATIVO (violava il CHECK >= 0 in silenzio → nessun addebito).
    // Il pre-check al punto 3c garantisce il saldo; se nel frattempo un invio
    // concorrente l'ha azzerato, qui si logga il deficit senza bloccare la
    // risposta (il messaggio è già partito).
    if (!waBilling.isFree) {
      const pricePerMsg = waBilling.pricePerUnitEur ?? 0.0006;
      const { data: consumeRes, error: consumeErr } = await adminClient.rpc("consume_credits", {
        p_company_id: conv.company_id,
        p_credit_type: "whatsapp",
        p_amount: pricePerMsg,
        p_description: "Messaggio WhatsApp inviato",
        p_metadata: { conversation_id, meta_message_id: metaMessageId },
      });
      if (consumeErr || (consumeRes as { success?: boolean } | null)?.success === false) {
        console.error(
          "[send-whatsapp-reply] deduct fallito post-invio (deficit da riconciliare):",
          consumeErr?.message ?? JSON.stringify(consumeRes),
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        meta_message_id: metaResult.messages?.[0]?.id,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[send-whatsapp-reply] Error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: getErrorStatus(err), headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
