/**
 * Edge Function: send-customer-email
 *
 * Invia un'email a un cliente dal diario (CustomerDiaryPanel) e
 * registra l'interazione in customer_messages con channel='email'.
 *
 * Body payload:
 *   {
 *     customer_id: string,
 *     subject: string,
 *     body_html: string,   // HTML
 *     body_text?: string,  // fallback plain
 *     reply_to?: string
 *   }
 */
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json().catch(() => ({}));

    const customerId = body?.customer_id as string | undefined;
    const subject = String(body?.subject ?? "").trim();
    const bodyHtml = String(body?.body_html ?? "").trim();
    const bodyText = body?.body_text ? String(body.body_text).trim() : undefined;
    const replyTo = body?.reply_to ? String(body.reply_to).trim() : undefined;

    if (!customerId || !subject || !bodyHtml) {
      return errorResponse("Parametri mancanti: customer_id, subject, body_html.");
    }
    if (subject.length > 200) {
      return errorResponse("Subject troppo lungo (max 200)");
    }

    // Load staff profile (company_id + display name)
    const { data: staffProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    if (!staffProfile?.company_id) {
      return errorResponse("Staff senza azienda associata", 403);
    }
    const companyId = staffProfile.company_id as string;

    // Load customer profile (email + scope check)
    const { data: customer } = await supabaseAdmin
      .from("profiles")
      .select("id, email, first_name, last_name, company_id")
      .eq("id", customerId)
      .maybeSingle();

    if (!customer) return errorResponse("Cliente non trovato", 404);
    if (customer.company_id !== companyId) {
      return errorResponse("Cliente non appartiene alla tua azienda", 403);
    }
    if (!customer.email) {
      return errorResponse("Il cliente non ha un indirizzo email", 400);
    }

    // Send email via unified pipeline
    let sendResult;
    try {
      sendResult = await sendEmailUnified({
        companyId,
        stream: "transactional",
        to: [customer.email],
        subject,
        html: bodyHtml,
        text: bodyText,
        replyTo,
        templateName: "customer_diary_email",
        skipCredits: false,
        adminClient: supabaseAdmin,
        metadata: {
          customer_id: customerId,
          sender_user_id: userId,
          source: "customer_diary",
        },
      });
    } catch (emailErr) {
      const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error("sendEmailUnified failed:", errMsg);
      // Log anche il tentativo fallito nel diary (così lo staff vede cosa è successo)
      await supabaseAdmin.from("customer_messages").insert({
        company_id: companyId,
        customer_id: customerId,
        sender_role: "staff",
        sender_id: userId,
        channel: "email",
        subject,
        body: bodyHtml,
        delivery_status: "failed",
        delivery_metadata: { error: errMsg },
      });
      return errorResponse(`Invio email fallito: ${errMsg}`, 502);
    }

    // Log successo in customer_messages
    const { error: logErr } = await supabaseAdmin.from("customer_messages").insert({
      company_id: companyId,
      customer_id: customerId,
      sender_role: "staff",
      sender_id: userId,
      channel: "email",
      subject,
      body: bodyHtml,
      delivery_status: "sent",
      delivery_metadata: {
        delivery_log_id: sendResult.deliveryLogId ?? null,
        to: customer.email,
        reply_to: replyTo ?? null,
        credits_before: sendResult.creditsBefore ?? null,
        credits_after: sendResult.creditsAfter ?? null,
        charged_eur: sendResult.chargedEur ?? null,
      },
    });

    if (logErr) {
      console.error("customer_messages insert error:", logErr);
      // Non blocchiamo: email già inviata
    }

    return jsonResponse({
      success: true,
      delivery_log_id: sendResult.deliveryLogId ?? null,
      charged_eur: sendResult.chargedEur ?? 0,
      sent_this_month: sendResult.sentThisMonth ?? null,
      effective_limit: sendResult.effectiveLimit ?? null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-customer-email error:", msg);
    return errorResponse(msg, 500);
  }
});
