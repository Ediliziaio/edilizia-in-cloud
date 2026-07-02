import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secureHeaders } from "../_shared/headers.ts";
import { normalizeEmailAddress } from "../_shared/emailSuppression.ts";
import { getEmailTrackingSecret, verifyTrackingSig } from "../_shared/emailTrackingSignature.ts";

// 1x1 transparent GIF
const PIXEL_GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

function pixelResponse(): Response {
  return new Response(PIXEL_GIF, {
    status: 200,
    headers: {
      ...secureHeaders,
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

function decodeSafeHttpUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const url = new URL(decoded);
    return url.protocol === "http:" || url.protocol === "https:" ? decoded : null;
  } catch {
    return null;
  }
}

function unsubscribeConfirmationHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Disiscrizione</title>
    <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb}
    .card{background:white;border-radius:12px;padding:40px;max-width:400px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.08)}
    h1{font-size:24px;margin-bottom:8px}p{color:#6b7280;font-size:14px}</style></head>
    <body><div class="card"><h1>Disiscrizione completata</h1><p>Non riceverai più email marketing da questa azienda.</p></div></body></html>`;
}

async function unsubscribeContact(
  adminClient: ReturnType<typeof createClient>,
  contactId: string,
  companyId: string,
  now: string,
  metadata: Record<string, unknown>,
) {
  const { data: contact } = await adminClient
    .from("marketing_contacts")
    .select("email")
    .eq("id", contactId)
    .eq("company_id", companyId)
    .maybeSingle();

  await adminClient
    .from("marketing_contacts")
    .update({ optout_email: true })
    .eq("id", contactId)
    .eq("company_id", companyId);

  if (contact?.email) {
    await adminClient
      .from("email_suppressions")
      .upsert({
        email: normalizeEmailAddress(contact.email),
        company_id: companyId,
        reason: "unsubscribe",
        suppressed_at: now,
        source_provider: "manual",
        source_event_id: typeof metadata.campaign_id === "string" ? metadata.campaign_id : null,
        metadata,
      }, {
        onConflict: "company_id,email_normalized,reason",
        ignoreDuplicates: true,
      });
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // open | click | unsub | automation_unsub | automation_open
  const campaignId = url.searchParams.get("cid");
  const contactId = url.searchParams.get("rid");
  const companyId = url.searchParams.get("co");
  const redirectUrl = url.searchParams.get("url");
  const isAutomationTracking = type === "automation_unsub" || type === "automation_open";
  // Unsub "diretto" (cold outreach): il footer/List-Unsubscribe punta qui SENZA
  // cid (non c'è una campagna email_logs dietro). La soppressione usa solo
  // marketing_contacts + email_suppressions, quindi il cid non serve. Senza
  // questo ramo il gate sotto rispondeva 400 e il link di disiscrizione era rotto.
  const isDirectUnsub = type === "unsub" && !campaignId;

  if (!type || !contactId || !companyId || (!campaignId && !isAutomationTracking && !isDirectUnsub)) {
    return new Response("Missing params", { status: 400, headers: secureHeaders });
  }

  // SEC: verifica firma HMAC. Questa function è unauthenticated (verify_jwt=false):
  // senza firma chiunque indovini gli UUID co/rid/cid potrebbe disiscrivere
  // contatti arbitrari (type=unsub) o forgiare eventi open/click. Firmiamo
  // "co|rid|cid|type" in generazione e qui lo verifichiamo (constant-time).
  // Backward-compat: se EMAIL_TRACKING_SECRET non è configurato accettiamo i
  // link legacy non firmati; appena il secret è impostato, link assenti/invalidi
  // vengono rifiutati. Vedi _shared/emailTrackingSignature.ts.
  const trackingSecret = getEmailTrackingSecret();
  const sigValid = trackingSecret
    ? await verifyTrackingSig(
        trackingSecret,
        { co: companyId, rid: contactId, cid: campaignId, type },
        url.searchParams.get("sig"),
      )
    : true; // legacy mode (secret non configurato) → accetta

  if (!sigValid) {
    console.warn("email-tracking: firma assente/non valida — richiesta rifiutata", {
      type,
      companyId,
      contactId,
      campaignId,
    });
    // open: restituiamo comunque il pixel per non rompere il rendering, ma
    // senza registrare nulla (niente inquinamento analytics).
    if (type === "open" || type === "automation_open") {
      return pixelResponse();
    }
    // click: preserviamo la navigazione (redirect sicuro http/https) senza
    // registrare l'evento, così i link legacy già inviati continuano a portare
    // l'utente a destinazione ma non possono inquinare gli eventi.
    if (type === "click") {
      const safeRedirect = decodeSafeHttpUrl(redirectUrl);
      return safeRedirect
        ? new Response(null, { status: 302, headers: { ...secureHeaders, Location: safeRedirect } })
        : new Response("OK", { status: 200, headers: secureHeaders });
    }
    // unsub / automation_unsub (azione distruttiva) → rifiuto netto.
    return new Response("Link non valido o scaduto", { status: 403, headers: secureHeaders });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date().toISOString();

  try {
    if (type === "automation_open") {
      await adminClient.from("automation_trigger_events").insert({
        company_id: companyId,
        trigger_event: "email_opened",
        entity_id: contactId,
        entity_type: "contact",
        payload: { contact_id: contactId, company_id: companyId, source: "automation_email" },
      });
      return pixelResponse();
    }

    if (type === "automation_unsub") {
      await unsubscribeContact(adminClient, contactId, companyId, now, {
        source: "automation_email_tracking",
        contact_id: contactId,
      });
      return new Response(unsubscribeConfirmationHtml(), {
        status: 200,
        headers: { ...secureHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Unsub diretto cold outreach (nessun cid): sopprime il contatto senza il
    // lookup email_logs (che l'outreach non scrive). Gestisce sia il click GET
    // (pagina di conferma) sia il POST one-click RFC 8058 (204). Prima questo
    // percorso cadeva nel gate 400 / 404 e la disiscrizione non funzionava.
    if (isDirectUnsub) {
      await unsubscribeContact(adminClient, contactId, companyId, now, {
        source: "outreach_unsub",
        contact_id: contactId,
      });
      if (req.method === "POST") {
        return new Response(null, { status: 204, headers: secureHeaders });
      }
      return new Response(unsubscribeConfirmationHtml(), {
        status: 200,
        headers: { ...secureHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const { data: logRow } = await adminClient
      .from("email_logs")
      .select("id, company_id, campaign_id, contact_id")
      .eq("campaign_id", campaignId!)
      .eq("contact_id", contactId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!logRow) {
      return type === "open" ? pixelResponse() : new Response("Link non valido o scaduto", {
        status: 404,
        headers: secureHeaders,
      });
    }

    switch (type) {
      case "open": {
        // Update opened_at if not already set
        await adminClient
          .from("email_logs")
          .update({ opened_at: now })
          .eq("campaign_id", campaignId!)
          .eq("contact_id", contactId)
          .is("opened_at", null);

        // Fire automation trigger event
        await adminClient.from("automation_trigger_events").insert({
          company_id: companyId,
          trigger_event: "email_opened",
          entity_id: contactId,
          entity_type: "contact",
          payload: { campaign_id: campaignId!, contact_id: contactId, company_id: companyId },
        });

        // BUG-10: auto_tag — add "opened:<campaignId>" tag to contact
        const { data: campOpen } = await adminClient
          .from("email_campaigns")
          .select("auto_tag")
          .eq("id", campaignId!)
          .eq("company_id", companyId)
          .maybeSingle();
        if (campOpen?.auto_tag) {
          const { data: ctOpen } = await adminClient
            .from("marketing_contacts")
            .select("tags")
            .eq("id", contactId)
            .eq("company_id", companyId)
            .maybeSingle();
          const updatedTags = [...new Set([...(ctOpen?.tags || []), `opened:${campaignId!}`])];
          await adminClient
            .from("marketing_contacts")
            .update({ tags: updatedTags })
            .eq("id", contactId)
            .eq("company_id", companyId);
        }

        return pixelResponse();
      }

      case "click": {
        // Update clicked_at if not already set
        await adminClient
          .from("email_logs")
          .update({ clicked_at: now })
          .eq("campaign_id", campaignId!)
          .eq("contact_id", contactId)
          .is("clicked_at", null);

        // Also mark as opened if not yet
        await adminClient
          .from("email_logs")
          .update({ opened_at: now })
          .eq("campaign_id", campaignId!)
          .eq("contact_id", contactId)
          .is("opened_at", null);

        // Fire automation trigger event
        await adminClient.from("automation_trigger_events").insert({
          company_id: companyId,
          trigger_event: "email_clicked",
          entity_id: contactId,
          entity_type: "contact",
          payload: { campaign_id: campaignId!, contact_id: contactId, company_id: companyId, link_url: redirectUrl ? decodeURIComponent(redirectUrl) : null },
        });

        // BUG-10: auto_tag — add "clicked:<campaignId>" tag to contact
        const { data: campClick } = await adminClient
          .from("email_campaigns")
          .select("auto_tag")
          .eq("id", campaignId!)
          .eq("company_id", companyId)
          .maybeSingle();
        if (campClick?.auto_tag) {
          const { data: ctClick } = await adminClient
            .from("marketing_contacts")
            .select("tags")
            .eq("id", contactId)
            .eq("company_id", companyId)
            .maybeSingle();
          const updatedTags = [...new Set([...(ctClick?.tags || []), `clicked:${campaignId!}`])];
          await adminClient
            .from("marketing_contacts")
            .update({ tags: updatedTags })
            .eq("id", contactId)
            .eq("company_id", companyId);
        }

        // Redirect to original URL
        const safeRedirect = decodeSafeHttpUrl(redirectUrl);
        if (safeRedirect) {
          return new Response(null, {
            status: 302,
            headers: { ...secureHeaders, Location: safeRedirect },
          });
        }
        return new Response("OK", { status: 200, headers: secureHeaders });
      }

      case "unsub": {
        await unsubscribeContact(adminClient, contactId, companyId, now, {
          source: "email_tracking",
          campaign_id: campaignId!,
          contact_id: contactId,
        });

        // Update email_log status
        await adminClient
          .from("email_logs")
          .update({ status: "unsubscribed" })
          .eq("campaign_id", campaignId!)
          .eq("contact_id", contactId);

        // Return a simple confirmation page
        return new Response(unsubscribeConfirmationHtml(), {
          status: 200,
          headers: { ...secureHeaders, "Content-Type": "text/html; charset=utf-8" },
        });
      }

      default:
        return new Response("Unknown type", { status: 400, headers: secureHeaders });
    }
  } catch (err: any) {
    console.error("email-tracking error:", err);
    // For opens, still return the pixel to not break email rendering
    if (type === "open") {
      return pixelResponse();
    }
    return new Response("Error", { status: 500, headers: secureHeaders });
  }
});
