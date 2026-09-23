// supabase/functions/send-ads-alert/index.ts
//
// Invio alert al titolare per eventi critici modulo Pubblicità.
//
// CANALI:
//   • Email (via send-transactional-email se esiste)
//   • WhatsApp (via whatsapp-send se configurato)
//   • In-app: gestito separatamente da useAdsNotifications (realtime)
//
// EVENTI:
//   • autopause          — campagna pausata dallo spend guard
//   • approval_request   — campagna creata sopra soglia → notifica titolare
//   • spend_anomaly      — spesa giornaliera 3x media → freeze
//
// SICUREZZA:
//   • Service role only (chiamata interna da spend-check / approval flow)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface AlertRequest {
  company_id: string;
  alert_type: "autopause" | "approval_request" | "spend_anomaly" | "campaign_disapproved";
  campaign_id?: string;
  campaign_name?: string;
  detail?: string;
  amount_cents?: number;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  // Service role only
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: "service_role_required" }, 401, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    let body: AlertRequest;
    try {
      body = (await req.json()) as AlertRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }

    if (!body.company_id || !body.alert_type) {
      return json({ error: "missing_required_fields" }, 400, corsHeaders);
    }

    // Carica titolare azienda
    const { data: company } = await admin
      .from("companies")
      .select("id, name, owner_email")
      .eq("id", body.company_id)
      .maybeSingle();
    if (!company) return json({ error: "company_not_found" }, 404, corsHeaders);

    // Carica email titolare se non già in company
    let ownerEmail = (company as { owner_email?: string }).owner_email ?? null;
    if (!ownerEmail) {
      const { data: ownerProfile } = await admin
        .from("profiles")
        .select("email")
        .eq("company_id", body.company_id)
        .eq("role", "company_admin")
        .maybeSingle();
      ownerEmail = ownerProfile?.email ?? null;
    }

    // Carica spend_guard per email override
    const { data: guard } = await admin
      .from("ad_spend_guard")
      .select("alert_email")
      .eq("company_id", body.company_id)
      .is("ad_account_id", null)
      .maybeSingle();
    if (guard?.alert_email) ownerEmail = guard.alert_email;

    // Build messaggio
    const { subject, bodyText, bodyHtml, whatsappText } = buildAlertMessages(
      body,
      company.name ?? "la tua azienda",
    );

    const sent: { email: boolean; whatsapp: boolean; errors: string[] } = {
      email: false,
      whatsapp: false,
      errors: [],
    };

    // Email
    if (ownerEmail) {
      try {
        const { error } = await admin.functions.invoke("send-transactional-email", {
          body: {
            to: ownerEmail,
            subject,
            html: bodyHtml,
            text: bodyText,
          },
        });
        if (!error) sent.email = true;
        else sent.errors.push(`email:${error.message}`);
      } catch (e) {
        sent.errors.push(`email_exception:${String(e)}`);
      }
    } else {
      sent.errors.push("no_owner_email");
    }

    // WhatsApp — chiama whatsapp-send con il numero del titolare se configurato
    try {
      // Cerca numero WhatsApp del company_admin
      const { data: adminWa } = await admin
        .from("profiles")
        .select("phone_number")
        .eq("company_id", body.company_id)
        .eq("role", "company_admin")
        .limit(1)
        .maybeSingle();

      if (adminWa?.phone_number) {
        const { error: waErr } = await admin.functions.invoke("whatsapp-send", {
          body: {
            company_id: body.company_id,
            to: adminWa.phone_number,
            text: whatsappText,
          },
        });
        if (!waErr) sent.whatsapp = true;
        else sent.errors.push(`whatsapp:${waErr.message}`);
      }
    } catch (e) {
      sent.errors.push(`whatsapp_exception:${String(e)}`);
    }

    return json({ success: sent.email || sent.whatsapp, sent }, 200, corsHeaders);
  } catch (e) {
    console.error("[send-ads-alert] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function buildAlertMessages(input: AlertRequest, companyName: string): {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  whatsappText: string;
} {
  const campName = input.campaign_name ?? "una campagna";
  const amountStr = input.amount_cents != null ? `${(input.amount_cents / 100).toFixed(0)}€` : "";

  switch (input.alert_type) {
    case "autopause":
      return {
        subject: `Campagne pubblicitarie in pausa automatica — ${companyName}`,
        bodyText: `Lo Spend Guard ha messo in pausa le campagne attive di ${companyName}.\n\nMotivo: ${input.detail ?? "cap di spesa superato"}\n\nApri il modulo Pubblicità per verificare e riattivare manualmente.`,
        bodyHtml: `<p>Lo <strong>Spend Guard</strong> ha messo in pausa le campagne attive di <strong>${companyName}</strong>.</p><p>Motivo: ${input.detail ?? "cap di spesa superato"}</p><p><a href="https://app.ediliziaincloud.com/azienda/marketing/pubblicita">Apri il modulo Pubblicità</a> per verificare e riattivare manualmente.</p>`,
        whatsappText: `⚠️ ${companyName}: campagne pubblicitarie pausate automaticamente. Motivo: ${input.detail ?? "cap superato"}. Verifica nel modulo Pubblicità.`,
      };
    case "approval_request":
      return {
        subject: `Approvazione richiesta — ${campName}`,
        bodyText: `Un operatore ha creato una nuova campagna che richiede la tua approvazione (budget ${amountStr}/giorno).\n\nCampagna: ${campName}\n\nApri il modulo Pubblicità per approvare o rifiutare.`,
        bodyHtml: `<p>Un operatore ha creato una nuova campagna che richiede la tua approvazione.</p><p><strong>${campName}</strong> · Budget ${amountStr}/giorno</p><p><a href="https://app.ediliziaincloud.com/azienda/marketing/pubblicita">Vai al modulo Pubblicità</a></p>`,
        whatsappText: `🔔 ${companyName}: nuova campagna "${campName}" (${amountStr}/g) attende la tua approvazione.`,
      };
    case "spend_anomaly":
      return {
        subject: `Anomalia spesa pubblicitaria — ${companyName}`,
        bodyText: `Rilevata anomalia: spesa giornaliera ${amountStr} è 3x la media. ${input.detail ?? ""}`,
        bodyHtml: `<p>🚨 <strong>Anomalia spesa pubblicitaria</strong></p><p>Spesa giornaliera ${amountStr} è 3x la media. ${input.detail ?? ""}</p>`,
        whatsappText: `🚨 ${companyName}: anomalia spesa pubblicitaria ${amountStr}/giorno. Verifica subito.`,
      };
    case "campaign_disapproved":
      return {
        subject: `Campagna rifiutata da Meta — ${campName}`,
        bodyText: `Meta ha rifiutato la campagna "${campName}". Motivo: ${input.detail ?? "non specificato"}`,
        bodyHtml: `<p>❌ Meta ha rifiutato la campagna <strong>${campName}</strong>.</p><p>Motivo: ${input.detail ?? "non specificato"}</p>`,
        whatsappText: `❌ ${companyName}: campagna "${campName}" rifiutata da Meta. Motivo: ${input.detail ?? "non specificato"}`,
      };
  }
}

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
