import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF
const PIXEL_GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // open | click | unsub
  const campaignId = url.searchParams.get("cid");
  const contactId = url.searchParams.get("rid");
  const companyId = url.searchParams.get("co");
  const redirectUrl = url.searchParams.get("url");

  if (!type || !campaignId || !contactId || !companyId) {
    return new Response("Missing params", { status: 400 });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date().toISOString();

  try {
    switch (type) {
      case "open": {
        // Update opened_at if not already set
        await adminClient
          .from("email_logs")
          .update({ opened_at: now })
          .eq("campaign_id", campaignId)
          .eq("contact_id", contactId)
          .is("opened_at", null);

        // Fire automation trigger event
        await adminClient.from("automation_trigger_events").insert({
          company_id: companyId,
          trigger_event: "email_opened",
          entity_id: contactId,
          entity_type: "contact",
          payload: { campaign_id: campaignId, contact_id: contactId, company_id: companyId },
        });

        return new Response(PIXEL_GIF, {
          status: 200,
          headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        });
      }

      case "click": {
        // Update clicked_at if not already set
        await adminClient
          .from("email_logs")
          .update({ clicked_at: now })
          .eq("campaign_id", campaignId)
          .eq("contact_id", contactId)
          .is("clicked_at", null);

        // Also mark as opened if not yet
        await adminClient
          .from("email_logs")
          .update({ opened_at: now })
          .eq("campaign_id", campaignId)
          .eq("contact_id", contactId)
          .is("opened_at", null);

        // Fire automation trigger event
        await adminClient.from("automation_trigger_events").insert({
          company_id: companyId,
          trigger_event: "email_clicked",
          entity_id: contactId,
          entity_type: "contact",
          payload: { campaign_id: campaignId, contact_id: contactId, company_id: companyId, link_url: redirectUrl ? decodeURIComponent(redirectUrl) : null },
        });

        // Redirect to original URL
        if (redirectUrl) {
          return new Response(null, {
            status: 302,
            headers: { Location: decodeURIComponent(redirectUrl) },
          });
        }
        return new Response("OK", { status: 200 });
      }

      case "unsub": {
        // Mark contact as unsubscribed
        await adminClient
          .from("marketing_contacts")
          .update({ email_unsubscribed: true, email_unsubscribed_at: now })
          .eq("id", contactId)
          .eq("company_id", companyId);

        // Update email_log status
        await adminClient
          .from("email_logs")
          .update({ status: "unsubscribed" })
          .eq("campaign_id", campaignId)
          .eq("contact_id", contactId);

        // Return a simple confirmation page
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Disiscrizione</title>
          <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb}
          .card{background:white;border-radius:12px;padding:40px;max-width:400px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.08)}
          h1{font-size:24px;margin-bottom:8px}p{color:#6b7280;font-size:14px}</style></head>
          <body><div class="card"><h1>✅ Disiscrizione completata</h1><p>Non riceverai più email marketing da questa azienda.</p></div></body></html>`;

        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      default:
        return new Response("Unknown type", { status: 400 });
    }
  } catch (err: any) {
    console.error("email-tracking error:", err);
    // For opens, still return the pixel to not break email rendering
    if (type === "open") {
      return new Response(PIXEL_GIF, {
        status: 200,
        headers: { "Content-Type": "image/gif" },
      });
    }
    return new Response("Error", { status: 500 });
  }
});
