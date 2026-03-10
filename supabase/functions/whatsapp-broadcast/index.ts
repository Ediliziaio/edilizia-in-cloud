import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { corsHeaders, secureHeaders } from "../_shared/headers.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";

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
    const { company_id, segment, segment_config, template_name, message_text } = body;

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

    // Verify user belongs to company
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    const isSuperAdmin = claimsData.claims.user_role === "super_admin";
    if (!isSuperAdmin && profile?.company_id !== company_id) {
      return new Response(
        JSON.stringify({ error: "Non autorizzato" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check WhatsApp billing
    const waBilling = await getCompanyBillingConfig(adminClient, company_id, "whatsapp");
    if (!waBilling.isEnabled) {
      return new Response(
        JSON.stringify({ error: "Servizio WhatsApp disabilitato per questa azienda" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const accessToken = await decrypt(waConfig.access_token_encrypted, encKey);

    // Build contact query based on segment
    let query = adminClient
      .from("marketing_contacts")
      .select("id, phone, first_name, last_name, email")
      .eq("company_id", company_id)
      .not("phone", "is", null);

    const seg = segment || "tutti";
    const segCfg = segment_config || {};

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
    // "tutti" and "pipeline" use all contacts with phone

    const { data: rawContacts, error: contactsErr } = await query.limit(10000);

    if (contactsErr) {
      return new Response(
        JSON.stringify({ error: "Errore recupero contatti: " + contactsErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rawContacts || rawContacts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nessun contatto trovato per il segmento selezionato" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    for (const contact of contacts) {
      const cleanPhone = (contact.phone || "").replace(/[^0-9]/g, "");
      if (!cleanPhone) {
        failedCount++;
        continue;
      }

      // Build template payload
      const components: any[] = [];
      if (message_text) {
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
          language: { code: "it" },
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
      } catch (err: any) {
        failedCount++;
        await adminClient.from("whatsapp_broadcast_recipients").insert({
          broadcast_id: broadcast.id,
          contact_id: contact.id,
          phone: cleanPhone,
          status: "failed",
          error_message: err.message,
        });
      }

      // Basic rate limiting: ~50 msgs/sec
      if ((sentCount + failedCount) % 50 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Update broadcast status
    await adminClient
      .from("whatsapp_broadcasts")
      .update({
        sent_count: sentCount,
        failed_count: failedCount,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", broadcast.id);

    // Deduct WhatsApp credits for sent messages
    if (!waBilling.isFree && sentCount > 0) {
      const pricePerMsg = waBilling.pricePerUnitEur ?? 0.0006;
      const totalCost = Number((sentCount * pricePerMsg).toFixed(4));

      const { data: waCredits } = await adminClient
        .from("whatsapp_credits")
        .select("balance_eur, total_spent_eur")
        .eq("company_id", company_id)
        .maybeSingle();

      const balanceBefore = waCredits?.balance_eur ?? 0;
      const balanceAfter = Number((balanceBefore - totalCost).toFixed(4));

      if (waCredits) {
        await adminClient
          .from("whatsapp_credits")
          .update({
            balance_eur: balanceAfter,
            total_spent_eur: Number(((waCredits.total_spent_eur ?? 0) + totalCost).toFixed(4)),
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", company_id);
      } else {
        await adminClient.from("whatsapp_credits").insert({
          company_id,
          balance_eur: -totalCost,
          total_spent_eur: totalCost,
        });
      }

      await adminClient.from("whatsapp_credits_log").insert({
        company_id,
        type: "deduction",
        amount_eur: -totalCost,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Broadcast: ${sentCount} messaggi inviati`,
        broadcast_id: broadcast.id,
      });
    }

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
  } catch (err: any) {
    console.error("[whatsapp-broadcast] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
