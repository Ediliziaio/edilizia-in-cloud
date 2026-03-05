import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, ticket_id, sender_id, old_status, new_status } = payload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Get ticket info
    const { data: ticket, error: ticketErr } = await admin
      .from("tickets")
      .select("id, subject, customer_id, assigned_to, company_id")
      .eq("id", ticket_id)
      .single();

    if (ticketErr || !ticket) {
      console.error("Ticket not found:", ticketErr);
      return new Response(JSON.stringify({ ok: false }), {
        headers: corsHeaders,
      });
    }

    let recipientIds: string[] = [];
    let emailSubject = "";
    let emailBody = "";

    if (type === "new_message" && sender_id) {
      // Determine if sender is customer or staff
      const isCustomer = sender_id === ticket.customer_id;

      if (isCustomer) {
        // Customer sent message → notify assigned staff (or company admin)
        if (ticket.assigned_to) {
          recipientIds = [ticket.assigned_to];
        }
      } else {
        // Staff sent message → notify customer
        recipientIds = [ticket.customer_id];
      }

      emailSubject = `Nuova risposta: ${ticket.subject}`;
      emailBody = `Hai ricevuto una nuova risposta sul ticket "${ticket.subject}". Accedi alla piattaforma per visualizzarla.`;
    } else if (type === "status_change") {
      // Notify customer about status change
      recipientIds = [ticket.customer_id];

      const statusLabels: Record<string, string> = {
        aperto: "Aperto",
        in_lavorazione: "In Lavorazione",
        risolto: "Risolto",
      };

      emailSubject = `Ticket aggiornato: ${ticket.subject}`;
      emailBody = `Lo stato del tuo ticket "${ticket.subject}" è stato aggiornato da "${statusLabels[old_status] || old_status}" a "${statusLabels[new_status] || new_status}".`;
    }

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: corsHeaders,
      });
    }

    // Get recipient emails
    const { data: recipients } = await admin
      .from("profiles")
      .select("id, email, first_name")
      .in("id", recipientIds);

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, no_recipients: true }), {
        headers: corsHeaders,
      });
    }

    // Log notification (we don't have a transactional email service yet,
    // so we log the intent for future integration)
    for (const recipient of recipients) {
      console.log(
        `[ticket-notify] Would send email to ${recipient.email}: "${emailSubject}" — ${emailBody}`
      );
    }

    // TODO: Integrate with a transactional email service (e.g. Resend, SendGrid)
    // when configured. For now, notifications are logged server-side.

    return new Response(
      JSON.stringify({
        ok: true,
        notified: recipients.map((r) => r.email),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ticket-notify error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
