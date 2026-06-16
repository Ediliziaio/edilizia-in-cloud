// ============================================================================
// payments-connect — Onboarding Stripe Connect (Express) per l'azienda
// ============================================================================
// Ogni azienda diventa un "connected account": incassa carta/link, EiC trattiene
// una application_fee (markup, modello tipo TS Pay). Qui SOLO onboarding/stato:
// nessun movimento di denaro. Il pay-link (incasso) è il passo successivo.
// Auth: JWT utente; consentito ad admin azienda (setup finanziario).
// Secret: stripe_secret_key (platform_settings) / STRIPE_SECRET_KEY.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: cors });
const RETURN_BASE = "https://app.ediliziaincloud.com/azienda/impostazioni/integrazioni";

function flatten(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripePost(path: string, params: Record<string, unknown>, secret: string) {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" },
    body: flatten(params),
  });
  return { status: r.status, data: await r.json() };
}
async function stripeGet(path: string, secret: string) {
  const r = await fetch("https://api.stripe.com/v1/" + path, { headers: { Authorization: "Bearer " + secret } });
  return { status: r.status, data: await r.json() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: profile } = await admin.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    const companyId = (profile as { company_id?: string } | null)?.company_id;
    if (!companyId) return json({ error: "Azienda non identificata" }, 403);

    // Setup pagamenti = azione amministrativa → solo admin azienda / super admin.
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = ((roles ?? []) as Array<{ role: string }>).some((r) => r.role === "super_admin" || r.role === "company_admin");
    if (!isAdmin) return json({ error: "Permesso negato: solo gli amministratori possono configurare i pagamenti." }, 403);

    const secret = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!secret) return json({ error: "Stripe non configurato (manca STRIPE_SECRET_KEY)." }, 400);

    const { data: company } = await admin.from("companies")
      .select("id, name, email, stripe_connect_account_id").eq("id", companyId).maybeSingle();
    const comp = company as { id: string; name: string; email: string | null; stripe_connect_account_id: string | null } | null;
    if (!comp) return json({ error: "Azienda non trovata" }, 404);

    const { action } = await req.json().catch(() => ({ action: "" }));

    if (action === "onboard") {
      let acctId = comp.stripe_connect_account_id;
      if (!acctId) {
        const { status, data } = await stripePost("accounts", {
          type: "express", country: "IT", email: comp.email ?? undefined, business_type: "company",
          capabilities: { card_payments: { requested: "true" }, transfers: { requested: "true" } },
          business_profile: { name: comp.name },
          metadata: { company_id: comp.id },
        }, secret);
        if (status !== 200 || !data?.id) return json({ error: data?.error?.message || "Errore creazione account Stripe" }, 400);
        acctId = data.id;
        await admin.from("companies").update({ stripe_connect_account_id: acctId }).eq("id", companyId);
      }
      const { status: ls, data: link } = await stripePost("account_links", {
        account: acctId, refresh_url: RETURN_BASE + "?stripe=refresh", return_url: RETURN_BASE + "?stripe=connected",
        type: "account_onboarding",
      }, secret);
      if (ls !== 200 || !link?.url) return json({ error: link?.error?.message || "Errore link onboarding" }, 400);
      return json({ url: link.url });
    }

    if (action === "status") {
      if (!comp.stripe_connect_account_id) return json({ connected: false, charges_enabled: false });
      const { data } = await stripeGet("accounts/" + comp.stripe_connect_account_id, secret);
      const charges = data?.charges_enabled === true;
      await admin.from("companies").update({ stripe_connect_enabled: charges }).eq("id", companyId);
      return json({
        connected: true, charges_enabled: charges,
        details_submitted: data?.details_submitted === true, payouts_enabled: data?.payouts_enabled === true,
      });
    }

    return json({ error: "Azione sconosciuta" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
