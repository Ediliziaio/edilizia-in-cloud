import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";

type BroadcastContact = {
  id: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
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

    const body = await req.json();
    const {
      company_id,
      segment,
      segment_config,
      template_name,
      message_text,
      template_language,
      template_parameters,
    } = body;

    if (!company_id || !template_name) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: company_id, template_name" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await assertMetaCompanyAdminAccess(adminClient, userId, company_id);

    // Check WhatsApp billing
    const waBilling = await getCompanyBillingConfig(adminClient, company_id, "whatsapp");
    if (!waBilling.isEnabled) {
      return new Response(
        JSON.stringify({ error: "Servizio WhatsApp disabilitato per questa azienda" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get WhatsApp config (nuovo multi-numero con fallback legacy)
    const sender = await resolveWhatsAppSender(adminClient, company_id);
    if (!sender) {
      return new Response(
        JSON.stringify({ error: "WhatsApp non configurato per questa azienda" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Access token (già decifrato dall'helper)
    const accessToken = sender.accessToken;

    // Build contact query based on segment — rispetta opt-out GDPR
    let query = adminClient
      .from("marketing_contacts")
      .select("id, phone, first_name, last_name, email")
      .eq("company_id", company_id)
      .not("phone", "is", null)
      .or("optout_whatsapp.is.null,optout_whatsapp.eq.false")
      .or("unsubscribed.is.null,unsubscribed.eq.false")
      .or("opt_out.is.null,opt_out.eq.false");

    const seg = segment || "tutti";
    const segCfg = segment_config || {};

    if (seg === "tag" && !segCfg.tag) {
      return new Response(
        JSON.stringify({ error: "Seleziona un tag prima di inviare il broadcast" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    if (seg === "source" && !segCfg.source) {
      return new Response(
        JSON.stringify({ error: "Seleziona una fonte prima di inviare il broadcast" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    if (seg === "pipeline") {
      return new Response(
        JSON.stringify({ error: "Il segmento pipeline non è ancora collegato ai contatti marketing" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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

    const { data: rawContacts, error: contactsErr } = await query.limit(10000);

    // Log count for audit
    if (rawContacts?.length) {
      console.log(`[WhatsApp Broadcast] ${rawContacts.length} contatti trovati per segmento "${seg}"`);
    }

    if (contactsErr) {
      return new Response(
        JSON.stringify({ error: "Errore recupero contatti: " + contactsErr.message }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!rawContacts || rawContacts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nessun contatto trovato per il segmento selezionato" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Deduplicate contacts by normalized phone number
    const seenPhones = new Set<string>();
    const contacts = rawContacts.filter((c) => {
      const clean = (c.phone || "").replace(/[^0-9]/g, "");
      if (!clean || seenPhones.has(clean)) return false;
      seenPhones.add(clean);
      return true;
    });

    // Pre-check crediti PRIMA di erogare: il costo del broadcast è noto
    // (destinatari × prezzo/msg). Il vecchio flusso inviava TUTTO e scalava
    // dopo — su wallet assente l'insert negativo violava il CHECK >= 0 in
    // silenzio: broadcast interi di fatto gratuiti. Ora senza saldo adeguato
    // si blocca qui con 402 chiaro, prima di toccare Meta.
    if (!waBilling.isFree) {
      const pricePerMsg = waBilling.pricePerUnitEur ?? 0.0006;
      const totalEstimatedCost = Number((contacts.length * pricePerMsg).toFixed(4));
      const { data: wallet } = await adminClient
        .from("whatsapp_credits")
        .select("balance_eur, sends_blocked")
        .eq("company_id", company_id)
        .maybeSingle();
      const balance = Number(wallet?.balance_eur ?? 0);
      if (wallet?.sends_blocked || balance < totalEstimatedCost) {
        return new Response(
          JSON.stringify({
            error: "insufficient_credits",
            message: `Crediti WhatsApp insufficienti per questo broadcast: servono ~€${totalEstimatedCost.toFixed(2)} per ${contacts.length} destinatari (saldo: €${balance.toFixed(2)}). Ricarica da Impostazioni → Crediti.`,
          }),
          { status: 402, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
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
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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
        const resolvedText = resolveVariables(message_text || "", contact);
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
          `https://graph.facebook.com/v21.0/${sender.phoneNumberId}/messages`,
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
    const finalStatus =
      failedCount === contacts.length ? "failed" : failedCount > 0 ? "partial_failed" : "completed";
    await adminClient
      .from("whatsapp_broadcasts")
      .update({
        sent_count: sentCount,
        failed_count: failedCount,
        status: finalStatus,
        completed_at: new Date().toISOString(),
      })
      .eq("id", broadcast.id);

    // Deduct WhatsApp credits for sent messages — RPC atomica (FOR UPDATE + log).
    // Sostituisce il read-modify-write che su wallet mancante inseriva un saldo
    // NEGATIVO (violava il CHECK >= 0 in silenzio → broadcast gratuiti). Il
    // pre-check sul costo totale è già stato fatto prima del loop; se un invio
    // concorrente ha eroso il saldo, il deficit viene loggato (i messaggi sono
    // già partiti, non ha senso bloccare qui).
    if (!waBilling.isFree && sentCount > 0) {
      const pricePerMsg = waBilling.pricePerUnitEur ?? 0.0006;
      const totalCost = Number((sentCount * pricePerMsg).toFixed(4));
      const { data: consumeRes, error: consumeErr } = await adminClient.rpc("consume_credits", {
        p_company_id: company_id,
        p_credit_type: "whatsapp",
        p_amount: totalCost,
        p_description: `Broadcast: ${sentCount} messaggi inviati`,
        p_metadata: { broadcast_id: broadcast.id, sent_count: sentCount },
      });
      if (consumeErr || (consumeRes as { success?: boolean } | null)?.success === false) {
        console.error(
          "[whatsapp-broadcast] deduct fallito post-invio (deficit da riconciliare):",
          consumeErr?.message ?? JSON.stringify(consumeRes),
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        broadcast_id: broadcast.id,
        total_contacts: contacts.length,
        sent: sentCount,
        failed: failedCount,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[whatsapp-broadcast] Error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: getErrorStatus(err), headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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
