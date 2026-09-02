import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";

/**
 * IMP07 — Reminder automatico scadenza preventivi
 *
 * Cerca i preventivi in status "inviata" che scadono tra GIORNI_PREAVVISO giorni
 * e invia un'email di reminder al creator e, se configurato, al cliente.
 *
 * Sicurezza: richiede header x-cron-secret (stesso pattern di check-scadenze-alerts).
 * Schedulato ogni giorno alle 08:00 tramite pg_cron.
 */

const GIORNI_PREAVVISO = [3, 1]; // invia reminder a 3 e 1 giorno dalla scadenza

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Auth cron: richiede secret header. Accetta gli stessi segreti delle altre
  // edge chiamate da pg_cron (CRON_SECRET / PROACTIVE_CRON_SECRET): prima
  // leggeva solo INTERNAL_CRON_SECRET, mai impostato, e rispondeva 401 a tutto.
  const segretiValidi = ["INTERNAL_CRON_SECRET", "CRON_SECRET", "PROACTIVE_CRON_SECRET"]
    .map((k) => Deno.env.get(k) ?? "")
    .filter((v) => v.length > 0);
  const requestSecret = req.headers.get("x-cron-secret") ?? "";
  if (requestSecret.length === 0 || !segretiValidi.includes(requestSecret)) {
    console.error("quote-expiry-reminder: accesso non autorizzato");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const defaultSiteUrl = Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
    const now = new Date();
    const results: { quote_id: string; days_left: number; reminders_sent: number }[] = [];
    let totalSent = 0;

    for (const giorniAnticipo of GIORNI_PREAVVISO) {
      // Trova preventivi che scadono esattamente tra giorniAnticipo giorni (±30 minuti)
      const targetStart = new Date(now);
      targetStart.setDate(targetStart.getDate() + giorniAnticipo);
      targetStart.setHours(0, 0, 0, 0);

      const targetEnd = new Date(targetStart);
      targetEnd.setDate(targetEnd.getDate() + 1);

      const { data: quotes, error: qErr } = await supabase
        .from("quotes")
        .select(`
          id, quote_number, title, status, expires_at,
          client_name, client_email, total, company_id,
          created_by, signature_token,
          companies:company_id (name, email)
        `)
        .eq("status", "inviata")
        .gte("expires_at", targetStart.toISOString())
        .lt("expires_at", targetEnd.toISOString());

      if (qErr) {
        console.error("quote-expiry-reminder: errore query quotes", qErr);
        continue;
      }

      if (!quotes || quotes.length === 0) continue;

      for (const quote of quotes) {
        let remindersSent = 0;
        const companyName = (quote.companies as any)?.name || "Azienda";
        const companyEmail = (quote.companies as any)?.email || "";

        // ── Notifica interna: crea notification row per il creator ──
        if (quote.created_by) {
          const { error: notifErr } = await supabase.rpc("create_notification", {
            p_company_id: quote.company_id,
            p_user_id: quote.created_by,
            p_type: "quote_expiring",
            p_title: `Offerta ${quote.quote_number} in scadenza`,
            p_body: `Il preventivo ${quote.quote_number} scade tra ${giorniAnticipo} giorn${giorniAnticipo === 1 ? "o" : "i"}. Nessuna risposta dal cliente.`,
            p_entity_type: "quote",
            p_entity_id: quote.id,
            p_action_url: `/azienda/marketing/preventivi/${quote.id}`,
          });
          if (notifErr) {
            console.warn("quote-expiry-reminder: notifica fallita per", quote.id, notifErr);
          } else {
            remindersSent++;
          }
        }

        // ── Email reminder al cliente (solo se ha email + signature_token) ──
        if (quote.client_email && quote.signature_token) {
          const quoteBranding = await getBrandingForCompany(supabase, quote.company_id);
          const siteUrl = quoteBranding.siteUrl || defaultSiteUrl;
          const signUrl = `${siteUrl}/preventivo/${quote.id}?token=${quote.signature_token}`;
          const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <h2 style="color:#1E40AF;">Reminder: Offerta commerciale in scadenza</h2>
              <p>Gentile ${quote.client_name || "Cliente"},</p>
              <p>
                Le ricordiamo che l'offerta commerciale
                <strong>${quote.quote_number}</strong>
                ${quote.title ? `— <em>${quote.title}</em>` : ""}
                è in scadenza tra <strong>${giorniAnticipo} giorn${giorniAnticipo === 1 ? "o" : "i"}</strong>.
              </p>
              <p>
                Per accettare o rifiutare l'offerta, clicchi sul pulsante qui sotto:
              </p>
              <p style="text-align:center;margin:32px 0;">
                <a href="${signUrl}"
                   style="background:#1E40AF;color:#fff;padding:14px 28px;border-radius:8px;
                          text-decoration:none;font-weight:bold;font-size:16px;">
                  Visualizza e firma l'offerta
                </a>
              </p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
              <p style="font-size:12px;color:#6b7280;">
                Questo è un messaggio automatico inviato da ${companyName}.
                Per assistenza, rispondi a questa email o contatta direttamente l'azienda.
              </p>
            </div>
          `;

          const result = await sendEmailUnified({
            companyId:    quote.company_id,
            stream:       "transactional",
            to:           [quote.client_email],
            subject:      `⏰ Promemoria offerta ${quote.quote_number} — scade tra ${giorniAnticipo} giorn${giorniAnticipo === 1 ? "o" : "i"}`,
            html,
            templateName: "quote_expiry",
            skipCredits:  false,
            adminClient:  supabase,
            metadata:     { quote_id: quote.id, days_left: giorniAnticipo },
          });

          if (result.ok) {
            remindersSent++;
          } else {
            console.warn("quote-expiry-reminder: email fallita per", quote.id, result.status, result.body);
          }
        }

        results.push({ quote_id: quote.id, days_left: giorniAnticipo, reminders_sent: remindersSent });
        totalSent += remindersSent;
      }
    }

    console.log(`quote-expiry-reminder: processati ${results.length} preventivi, ${totalSent} reminder inviati`);
    return jsonResponse({ success: true, processed: results.length, reminders_sent: totalSent, details: results });

  } catch (e) {
    if (e instanceof Response) return e;
    console.error("quote-expiry-reminder error:", e);
    return new Response(
      JSON.stringify({ error: "Errore interno" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
