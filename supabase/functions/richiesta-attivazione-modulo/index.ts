import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface RequestPayload {
  companyId: string;
  userId: string;
  moduloSlug: string;
  moduloNome: string;
  featureKey: string;
}

const RESEND_API = "https://api.resend.com/emails";
const STAFF_NOTIFY_EMAIL = Deno.env.get("STAFF_NOTIFY_EMAIL") ?? "info@ediliziaincloud.it";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@ediliziaincloud.it";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const cors = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Configurazione Supabase mancante");
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = (await req.json()) as RequestPayload;
    const { companyId, userId, moduloSlug, moduloNome, featureKey } = payload;
    if (!companyId || !userId || !moduloSlug || !featureKey) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti" }),
        { status: 400, headers: cors },
      );
    }

    // Verifica che l'utente abbia accesso a quella company
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Utente non trovato" }),
        { status: 403, headers: cors },
      );
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id, name, email")
      .eq("id", companyId)
      .maybeSingle();

    if (!company) {
      return new Response(
        JSON.stringify({ error: "Company non trovata" }),
        { status: 404, headers: cors },
      );
    }

    // 1) Log su tabella audit (idempotente: una richiesta per company/modulo/giorno)
    const { error: insertErr } = await supabase
      .from("modulo_richieste_attivazione")
      .insert({
        company_id: companyId,
        user_id: userId,
        modulo_slug: moduloSlug,
        modulo_nome: moduloNome,
        feature_key: featureKey,
        status: "pending",
        requested_by_email: profile.email ?? null,
        requested_by_name: profile.full_name ?? null,
      });

    if (insertErr) {
      // Se la tabella non esiste o conflict, non blocchiamo l'email
      console.warn("[richiesta-attivazione-modulo] insert audit failed:", insertErr.message);
    }

    // 2) Invio email staff via Resend (best-effort)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const subject = `[EiC] Richiesta attivazione modulo ${moduloNome} — ${company.name}`;
      const html = `
        <h2>Nuova richiesta attivazione modulo verticale</h2>
        <p><strong>Company:</strong> ${escapeHtml(company.name)} (id: <code>${companyId}</code>)</p>
        <p><strong>Modulo richiesto:</strong> ${escapeHtml(moduloNome)} (<code>${featureKey}</code>)</p>
        <p><strong>Richiedente:</strong> ${escapeHtml(profile.full_name ?? "—")} &lt;${escapeHtml(profile.email ?? "")}&gt;</p>
        <hr/>
        <p style="font-size:12px;color:#666">
          Apri il pannello SuperAdmin → Companies → ${escapeHtml(company.name)} → Subscription
          per attivare l'override del feature flag <code>${featureKey}</code>.
        </p>
      `;
      const resendResp = await fetch(RESEND_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [STAFF_NOTIFY_EMAIL],
          reply_to: profile.email ?? undefined,
          subject,
          html,
        }),
      });
      if (!resendResp.ok) {
        const errText = await resendResp.text();
        console.warn("[richiesta-attivazione-modulo] Resend error:", errText);
      }
    } else {
      console.info("[richiesta-attivazione-modulo] RESEND_API_KEY non configurata, skip email");
    }

    return new Response(
      JSON.stringify({ ok: true, message: "Richiesta inviata" }),
      { status: 200, headers: cors },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("[richiesta-attivazione-modulo] error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: cors },
    );
  }
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
