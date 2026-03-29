/**
 * send-optin-confirmation — GAP-15 Double Opt-in GDPR
 *
 * POST: Creates an opt-in token and sends the confirmation email.
 *       Body: { contactId: string }
 *       Auth: Bearer JWT (company_admin or super_admin)
 *
 * GET:  Confirms the opt-in by token.
 *       Query: ?token=<token>
 *       Public endpoint — no auth required (user clicks link in email).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendViaProvider } from "../_shared/emailProvider.ts";
import { corsHeaders } from "../_shared/headers.ts";

const TOKEN_EXPIRY_HOURS = 48;

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const adminClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── GET: public confirmation endpoint ──────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return confirmationPage(false, "Token mancante.");
    }

    const { data: record, error } = await adminClient
      .from("email_optin_tokens")
      .select("id, contact_id, company_id, email, confirmed_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error || !record) {
      return confirmationPage(false, "Token non valido o già utilizzato.");
    }
    if (new Date(record.expires_at) < new Date()) {
      return confirmationPage(false, "Il link di conferma è scaduto. Richiedi un nuovo invito.");
    }
    if (record.confirmed_at) {
      return confirmationPage(true, "Email già confermata in precedenza.");
    }

    // Mark as confirmed
    await adminClient
      .from("email_optin_tokens")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", record.id);

    // Update the contact: confirmed = true
    await adminClient
      .from("marketing_contacts")
      .update({ email_unsubscribed: false, email_unsubscribed_at: null })
      .eq("id", record.contact_id);

    return confirmationPage(true, "Iscrizione confermata! Potrai ora ricevere le nostre comunicazioni.");
  }

  // ── POST: send opt-in email ─────────────────────────────────────────────
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { contactId } = body;

    if (!contactId) {
      return new Response(JSON.stringify({ error: "contactId obbligatorio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch contact
    const { data: contact, error: contactError } = await adminClient
      .from("marketing_contacts")
      .select("id, email, first_name, last_name, company_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact?.email) {
      return new Response(JSON.stringify({ error: "Contatto non trovato o senza email" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load provider settings (transactional stream for system emails)
    let settings = await loadProviderSettings("transactional");
    if (!settings.apiKey) settings = await loadProviderSettings("marketing");
    if (!settings.apiKey) {
      return new Response(JSON.stringify({ error: "Nessun provider email configurato" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create token (upsert: invalidate previous pending tokens for same contact)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 3600 * 1000).toISOString();

    await adminClient.from("email_optin_tokens").insert({
      token,
      contact_id: contact.id,
      company_id: contact.company_id,
      email: contact.email,
      expires_at: expiresAt,
    });

    const confirmUrl = `${supabaseUrl}/functions/v1/send-optin-confirmation?token=${token}`;
    const firstName = contact.first_name || "Utente";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conferma iscrizione</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:40px 20px}
  .card{background:#fff;border-radius:12px;padding:40px;max-width:480px;margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,0.08)}
  h1{font-size:22px;margin:0 0 12px;color:#111}
  p{color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px}
  .btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px}
  .footer{margin-top:32px;font-size:12px;color:#9ca3af}
  a.plain{color:#6b7280;font-size:12px;word-break:break-all}
</style></head>
<body><div class="card">
  <h1>Conferma la tua iscrizione</h1>
  <p>Ciao ${firstName},<br>
  Clicca il pulsante qui sotto per confermare la tua iscrizione e iniziare a ricevere le nostre comunicazioni.</p>
  <a href="${confirmUrl}" class="btn">Conferma iscrizione</a>
  <div class="footer">
    <p>Il link scade tra ${TOKEN_EXPIRY_HOURS} ore. Se non hai richiesto questa iscrizione, ignora questa email.</p>
    <p>Oppure copia questo link nel browser:<br><a href="${confirmUrl}" class="plain">${confirmUrl}</a></p>
  </div>
</div></body></html>`;

    const result = await sendViaProvider(settings.provider, settings.apiKey, {
      from: settings.fromDefault,
      to: [contact.email],
      subject: "Conferma la tua iscrizione alla newsletter",
      html,
    }, { domain: settings.domain });

    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: "Errore invio email", detail: result.body }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, email: contact.email, expiresAt }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function confirmationPage(success: boolean, message: string): Response {
  const icon = success ? "✅" : "❌";
  const title = success ? "Iscrizione confermata" : "Errore di conferma";
  const color = success ? "#16a34a" : "#dc2626";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
  .card{background:#fff;border-radius:12px;padding:48px 40px;max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.08)}
  .icon{font-size:48px;margin-bottom:16px}
  h1{font-size:22px;margin:0 0 12px;color:${color}}
  p{color:#6b7280;font-size:15px;line-height:1.5;margin:0}
</style></head>
<body><div class="card">
  <div class="icon">${icon}</div>
  <h1>${title}</h1>
  <p>${message}</p>
</div></body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
