import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { type, referrer_id, data } = await req.json();

    if (!type || !referrer_id) {
      return errorResponse("type and referrer_id required");
    }

    // Fetch referrer with tier
    const { data: referrer, error: refErr } = await supabase
      .from("referrers")
      .select("*, referral_tiers(*)")
      .eq("id", referrer_id)
      .single();

    if (refErr || !referrer) {
      return errorResponse("Referrer not found", 404);
    }

    let subject = "";
    let htmlBody = "";

    switch (type) {
      case "welcome":
        subject = "🎉 Benvenuto nel Programma Partner!";
        htmlBody = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2>Ciao ${referrer.name}!</h2>
            <p>Sei ufficialmente un partner <strong>${referrer.referral_tiers?.name ?? "Bronze"}</strong>.</p>
            <p>Il tuo codice referral personale è: <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;font-size:16px">${referrer.referral_code}</code></p>
            <p>Ogni volta che un'azienda si registra con il tuo link, guadagnerai
              ${referrer.commission_type === "percentage"
                ? referrer.commission_value + "% del piano mensile"
                : "€" + referrer.commission_value + " fissi al mese"
              }.
            </p>
          </div>`;
        break;

      case "conversion":
        subject = `🚀 Nuova conversione! ${data?.company_name} si è registrata`;
        htmlBody = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2>Ottimo lavoro, ${referrer.name}!</h2>
            <p><strong>${data?.company_name}</strong> si è appena registrata usando il tuo link.</p>
            <p>Inizierai a guadagnare commissioni a partire dal prossimo ciclo di calcolo.</p>
          </div>`;
        break;

      case "commission_calculated":
        subject = `💰 Le tue commissioni di ${data?.month_name} sono pronte`;
        htmlBody = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2>Commissioni ${data?.month_name} ${data?.year}</h2>
            <p>Ciao ${referrer.name}, abbiamo calcolato le tue commissioni:</p>
            <div style="text-align:center;padding:20px;background:#f3f4f6;border-radius:8px;margin:16px 0">
              <div style="font-size:28px;font-weight:bold">€${data?.total_amount}</div>
              <div style="color:#6b7280">${data?.company_count} aziende attive</div>
            </div>
            <p>Vai alla tua dashboard per richiedere il pagamento.</p>
          </div>`;
        break;

      case "payout_approved":
        subject = `✅ Pagamento di €${data?.amount} approvato`;
        htmlBody = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2>Pagamento approvato!</h2>
            <p>Il tuo pagamento di <strong>€${data?.amount}</strong> è stato approvato.</p>
            <p>Riceverai il bonifico entro 3-5 giorni lavorativi.</p>
            <p>Riferimento: ${data?.reference ?? "In elaborazione"}</p>
          </div>`;
        break;

      case "tier_upgrade":
        subject = `🎉 Sei salito a ${data?.new_tier}!`;
        htmlBody = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2>Complimenti ${referrer.name}! 🎊</h2>
            <p>Hai raggiunto il tier <strong>${data?.new_tier} ${data?.tier_icon}</strong>!</p>
            <p>Ora guadagni il <strong>${data?.multiplier}x</strong> su ogni commissione.</p>
            ${data?.perks?.length ? `<ul>${data.perks.map((p: string) => `<li>${p}</li>`).join("")}</ul>` : ""}
          </div>`;
        break;

      default:
        return errorResponse(`Unknown notification type: ${type}`);
    }

    // Get platform email settings
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_email", "smtp_from_name"]);

    const settings: Record<string, string> = {};
    platformSettings?.forEach((s: any) => {
      settings[s.key] = s.value;
    });

    if (settings.smtp_host && settings.smtp_user && settings.smtp_pass) {
      // Send email via platform SMTP (simplified — reuse existing send logic)
      console.log(`[partner-notification] Sending ${type} email to ${referrer.email}: ${subject}`);
      
      // Use the send-test-email pattern or direct SMTP
      const emailPayload = {
        to: referrer.email,
        subject,
        html: htmlBody,
        from_email: settings.smtp_from_email || settings.smtp_user,
        from_name: settings.smtp_from_name || "Partner Program",
      };

      // Invoke the existing email sending function
      await supabase.functions.invoke("send-test-email", {
        body: emailPayload,
      });
    } else {
      console.log(`[partner-notification] SMTP not configured, skipping email for ${type} to ${referrer.email}`);
    }

    return jsonResponse({ success: true, type, referrer_email: referrer.email });
  } catch (err) {
    console.error("[partner-notification] Error:", err);
    return errorResponse(err.message || "Internal error", 500);
  }
});
