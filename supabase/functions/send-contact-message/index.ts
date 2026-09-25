import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";
import { numeroWhatsApp } from "../_shared/sequenzaContatto.ts";
import { getErrorMessage } from "../_shared/metaAuth.ts";
import { erroreInvioWhatsApp, richiestaWhatsAppSend } from "./invioWhatsApp.ts";
import type { EsitoWhatsAppSend } from "./invioWhatsApp.ts";

import { getCorsHeaders } from "../_shared/headers.ts";

/**
 * Il numero da cui parte il WhatsApp, con la regola di resolveWhatsAppSender:
 * quello scelto nel composer se è ancora dell'azienda e ha il token,
 * altrimenti il più recente attivo e verificato. null = il vecchio numero
 * unico (messaging_whatsapp_config), che whatsapp-send cerca da sé.
 */
async function numeroMittente(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  scelto: unknown,
): Promise<string | null> {
  const numeri = () =>
    admin
      .from("ai_whatsapp_numbers")
      .select("id")
      .eq("company_id", companyId)
      .not("phone_number_id", "is", null)
      .not("access_token_encrypted", "is", null)
      .is("deleted_at", null);
  if (typeof scelto === "string" && scelto) {
    const { data } = await numeri().eq("id", scelto).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data } = await numeri()
    .eq("stato", "active")
    .eq("webhook_verified", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // 2026-05-27 (richiesta utente CC/BCC nei contatti marketing):
    //   cc[]  → destinatari in conoscenza (visibili a tutti)
    //   bcc[] → destinatari in conoscenza nascosta (invio separato per ogni
    //           indirizzo per preservare la natura "nascosta")
    // Validazione array di stringhe email lowercase. Limit 20 per lato per
    // evitare abuso/spam (l'utente che vuole inviare a >20 usi una campagna).
    const { contact_id, channel, content, subject, cc, bcc, wa_number_id, template } = await req.json();
    // template (solo whatsapp): { name, language, variables?: string[] } → invio type:template.
    const waTemplate = (channel === "whatsapp" && template && typeof template === "object" && template.name)
      ? {
          name: String(template.name),
          language: String(template.language || "it"),
          variables: Array.isArray(template.variables) ? template.variables.map((v: unknown) => String(v ?? "")) : [],
        }
      : null;
    const ccList: string[] = Array.isArray(cc)
      ? (cc as unknown[])
          .map((x) => String(x ?? "").trim().toLowerCase())
          .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))
          .slice(0, 20)
      : [];
    const bccList: string[] = Array.isArray(bcc)
      ? (bcc as unknown[])
          .map((x) => String(x ?? "").trim().toLowerCase())
          .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))
          .slice(0, 20)
      : [];

    if (!contact_id || !channel || (!content && !waTemplate)) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: contact_id, channel, content" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!["whatsapp", "email", "sms"].includes(channel)) {
      return new Response(
        JSON.stringify({ error: "Canale non valido" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if ((content ?? "").length > 5000) {
      return new Response(
        JSON.stringify({ error: "Messaggio troppo lungo (max 5000 caratteri)" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch contact + verify company ownership
    const { data: contact, error: contactError } = await adminClient
      .from("marketing_contacts")
      .select("id, company_id, email, phone, first_name, last_name, optout_email, optout_whatsapp, optout_sms, unsubscribed")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: "Contatto non trovato" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // DND check
    if (channel === "email" && (contact.optout_email || contact.unsubscribed)) {
      return new Response(
        JSON.stringify({ error: "Il contatto ha disattivato le comunicazioni email" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    if (channel === "whatsapp" && contact.optout_whatsapp) {
      return new Response(
        JSON.stringify({ error: "Il contatto ha disattivato le comunicazioni WhatsApp" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    if (channel === "sms" && contact.optout_sms) {
      return new Response(
        JSON.stringify({ error: "Il contatto ha disattivato le comunicazioni SMS" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Verify user belongs to same company
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isSuperAdmin = roleData?.role === "super_admin";
    if (!isSuperAdmin && profile?.company_id !== contact.company_id) {
      return new Response(
        JSON.stringify({ error: "Non autorizzato per questo contatto" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Un utente bloccato non scrive più ai contatti (25/09/2026). Qui tutto
    // gira col service role, e il WhatsApp va a whatsapp-send con la chiave di
    // servizio: senza questa domanda il blocco valeva solo alla scadenza del
    // suo accesso. È la stessa che whatsapp-send fa a chi arriva dall'app.
    const { data: bloccato, error: erroreBlocco } = await supabase.rpc("utente_bloccato");
    if (erroreBlocco || bloccato === true) {
      return new Response(
        JSON.stringify({
          error: erroreBlocco
            ? "Non riesco a verificare il tuo accesso in questo momento: riprova tra poco."
            : "Il tuo accesso è bloccato: non puoi inviare messaggi.",
        }),
        { status: erroreBlocco ? 503 : 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── WhatsApp: passa da whatsapp-send (25/09/2026) ──
    // Come Conversazioni, l'invio rapido e le automazioni: carta, add-on,
    // finestra delle 24 ore, credito (con gli omaggi di
    // company_billing_overrides) e il messaggio registrato in whatsapp_messages
    // col suo contatto, dove il webhook scrive l'esito della consegna. Qui non
    // si scrive più contact_messages: Conversazioni e la scheda leggono già
    // whatsapp_messages, e il messaggio comparirebbe due volte.
    if (channel === "whatsapp") {
      if (!contact.phone) {
        return new Response(
          JSON.stringify({ error: "Il contatto non ha un numero di telefono" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const to = numeroWhatsApp(contact.phone);
      if (!to) {
        return new Response(
          JSON.stringify({ error: `Il numero ${contact.phone} non è valido per WhatsApp` }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      const invio = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify(richiestaWhatsAppSend({
          companyId: contact.company_id,
          waNumberId: await numeroMittente(adminClient, contact.company_id, wa_number_id),
          to,
          contactId: contact.id,
          testo: content ?? "",
          modello: waTemplate,
        })),
      });
      const esito = (await invio.json().catch(() => ({}))) as EsitoWhatsAppSend;
      const inviato = invio.ok && esito.success === true;
      const errore = inviato ? null : erroreInvioWhatsApp(invio.status, esito);

      // Nelle attività del contatto, come prima: il messaggio partito e quello
      // che Meta ha rifiutato (502). Finestra, credito e carta fermano l'invio
      // prima che parta, e come prima non lasciano traccia.
      if (inviato || invio.status === 502) {
        await adminClient.from("marketing_contact_activities").insert({
          contact_id,
          company_id: contact.company_id,
          activity_type: "message_sent",
          description: `Messaggio whatsapp inviato${inviato ? "" : " (fallito)"}`,
          metadata: {
            channel,
            status: inviato ? "sent" : "failed",
            error: errore?.error ?? null,
            meta_message_id: esito.meta_message_id ?? null,
            modello: waTemplate?.name ?? null,
          },
          created_by: userId,
        });
      }

      if (errore) {
        return new Response(
          JSON.stringify({
            success: false,
            status: "failed",
            error: errore.error,
            code: errore.code,
            ...(typeof esito.saldo_eur === "number" ? { saldo_eur: esito.saldo_eur } : {}),
          }),
          { status: errore.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, status: "sent", error: null, meta_message_id: esito.meta_message_id ?? null }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    let status = "sent";
    let errorDetail: string | null = null;

    // ── SEND by channel ──
    if (channel === "email") {
      // Check billing override for email
      const emailBilling = await getCompanyBillingConfig(adminClient, contact.company_id, "email");
      if (!emailBilling.isEnabled) {
        return new Response(
          JSON.stringify({ error: "Servizio email disabilitato per questa azienda" }),
          { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      if (!contact.email) {
        return new Response(
          JSON.stringify({ error: "Il contatto non ha un indirizzo email" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      const emailSubject = subject || "Messaggio";
      const html = `<html><body><p>${content.replace(/\n/g, "<br>")}</p></body></html>`;

      // 2026-05-27: to + cc come destinatari visibili in unico invio.
      // sendEmailUnified shared layer accetta solo `to: string[]` (no cc/bcc
      // separati), quindi tutti i CC finiscono nel campo "To" del client
      // ricevente — comportamento accettabile per pochi destinatari.
      // Per BCC nascosti veri facciamo invii separati uno per indirizzo.
      const visibleRecipients = [contact.email, ...ccList.filter((e) => e !== contact.email)];

      let result = await sendEmailUnified({
        companyId:    contact.company_id,
        stream:       "transactional",
        to:           visibleRecipients,
        subject:      emailSubject,
        html,
        templateName: "contact_message",
        skipCredits:  false,
        adminClient:  adminClient,
        metadata:     { contact_id: contact.id, cc_count: ccList.length, bcc_count: bccList.length },
      });

      const providerError =
        typeof result.body === "object" && result.body && "error" in result.body
          ? String((result.body as { error?: unknown }).error ?? "")
          : "";
      if (!result.ok && /no provider configured/i.test(providerError)) {
        result = await sendEmailUnified({
          companyId:    contact.company_id,
          stream:       "marketing",
          to:           visibleRecipients,
          subject:      emailSubject,
          html,
          templateName: "contact_message",
          skipCredits:  false,
          adminClient:  adminClient,
          metadata:     { contact_id: contact.id, fallback_stream: true, cc_count: ccList.length, bcc_count: bccList.length },
        });
      }

      if (!result.ok) {
        status = "failed";
        errorDetail = JSON.stringify(result.body);
      } else if (bccList.length > 0) {
        // BCC nascosti: invio separato per ogni indirizzo (best-effort, no
        // throw se uno fallisce — il primario è già passato).
        for (const bccAddr of bccList) {
          if (bccAddr === contact.email || ccList.includes(bccAddr)) continue;
          try {
            await sendEmailUnified({
              companyId:    contact.company_id,
              stream:       "transactional",
              to:           [bccAddr],
              subject:      emailSubject,
              html,
              templateName: "contact_message",
              skipCredits:  true, // BCC è "copia per archivio", no double-billing
              adminClient:  adminClient,
              metadata:     { contact_id: contact.id, bcc_relay: true, bcc_of: contact.email },
            });
          } catch (e) {
            console.warn(`[send-contact-message] BCC fallito per ${bccAddr}:`, e);
          }
        }
      }
    } else if (channel === "sms") {
      if (!contact.phone) {
        return new Response(
          JSON.stringify({ error: "Il contatto non ha un numero di telefono" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      // Send SMS via Telnyx proxy
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const cronKey = Deno.env.get("INTERNAL_CRON_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      try {
        const smsRes = await fetch(`${supabaseUrl}/functions/v1/telnyx-proxy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": cronKey,
          },
          body: JSON.stringify({
            action: "send_sms",
            company_id: contact.company_id,
            payload: {
              to: contact.phone,
              body: content,
              contact_id: contact_id,
            },
          }),
        });
        const smsResult = await smsRes.json();
        if (!smsRes.ok || smsResult?.error) {
          status = "failed";
          errorDetail = smsResult?.error || `HTTP ${smsRes.status}`;
        }
      } catch (smsErr: unknown) {
        status = "failed";
        errorDetail = getErrorMessage(smsErr);
      }
    }

    // Insert message record (email e SMS: il WhatsApp è registrato da whatsapp-send)
    const { error: insertError } = await adminClient
      .from("contact_messages")
      .insert({
        contact_id,
        company_id: contact.company_id,
        channel,
        content,
        subject: channel === "email" ? (subject || "Messaggio") : null,
        status,
        sent_by: userId,
      });

    if (insertError) {
      console.error("Failed to insert contact_message:", insertError);
    }

    // Log activity
    await adminClient.from("marketing_contact_activities").insert({
      contact_id,
      company_id: contact.company_id,
      activity_type: "message_sent",
      description: `Messaggio ${channel} inviato${status === "failed" ? " (fallito)" : ""}`,
      metadata: { channel, status, error: errorDetail },
      created_by: userId,
    });

    return new Response(
      JSON.stringify({ success: status !== "failed", status, error: errorDetail }),
      {
        status: status === "failed" ? 502 : 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
