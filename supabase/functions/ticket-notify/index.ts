import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProvider, loadProviderSettings } from "../_shared/emailProvider.ts";
import { corsHeaders, secureHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated user
    await requireAuth(req, corsHeaders);

    const payload = await req.json();
    const { type, ticket_id, sender_id, old_status, new_status } = payload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: ticket, error: ticketErr } = await admin
      .from("tickets")
      .select("id, subject, customer_id, assigned_to, company_id")
      .eq("id", ticket_id)
      .single();

    if (ticketErr || !ticket) {
      console.error("Ticket not found:", ticketErr);
      return jsonResponse({ ok: false });
    }

    let recipientIds: string[] = [];
    let emailSubject = "";
    let emailBody = "";

    if (type === "new_message" && sender_id) {
      const isCustomer = sender_id === ticket.customer_id;
      if (isCustomer) {
        if (ticket.assigned_to) recipientIds = [ticket.assigned_to];
      } else {
        recipientIds = [ticket.customer_id];
      }
      emailSubject = `Nuova risposta: ${ticket.subject}`;
      emailBody = `<p>Hai ricevuto una nuova risposta sul ticket "<strong>${ticket.subject}</strong>".</p><p>Accedi alla piattaforma per visualizzarla.</p>`;
    } else if (type === "status_change") {
      recipientIds = [ticket.customer_id];
      const statusLabels: Record<string, string> = {
        aperto: "Aperto",
        in_lavorazione: "In Lavorazione",
        risolto: "Risolto",
      };
      emailSubject = `Ticket aggiornato: ${ticket.subject}`;
      emailBody = `<p>Lo stato del tuo ticket "<strong>${ticket.subject}</strong>" è stato aggiornato da "${statusLabels[old_status] || old_status}" a "${statusLabels[new_status] || new_status}".</p>`;
    }

    if (recipientIds.length === 0) {
      return jsonResponse({ ok: true, skipped: true });
    }

    const { data: recipients } = await admin
      .from("profiles")
      .select("id, email, first_name")
      .in("id", recipientIds);

    if (!recipients || recipients.length === 0) {
      return jsonResponse({ ok: true, no_recipients: true });
    }

    // Load transactional provider, fallback to marketing
    let settings = await loadProviderSettings("transactional");
    if (!settings.apiKey) {
      settings = await loadProviderSettings("marketing");
    }

    const sent: string[] = [];

    if (settings.apiKey) {
      for (const recipient of recipients) {
        if (!recipient.email) continue;
        try {
          await sendViaProvider(settings.provider, settings.apiKey, {
            from: settings.fromDefault,
            fromName: settings.fromName,
            to: [recipient.email],
            subject: emailSubject,
            html: `<html><body>${emailBody}</body></html>`,
          });
          sent.push(recipient.email);
        } catch (err) {
          console.error(`Failed to send to ${recipient.email}:`, err);
        }
      }
    } else {
      // Fallback: log only
      for (const recipient of recipients) {
        console.log(`[ticket-notify] Would send to ${recipient.email}: "${emailSubject}"`);
      }
    }

    return jsonResponse({ ok: true, notified: sent.length > 0 ? sent : recipients.map((r) => r.email) });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("ticket-notify error:", err);
    return errorResponse(String(err), 500);
  }
});
