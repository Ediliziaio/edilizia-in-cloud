import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdapter } from "../_shared/billingAdapter.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FIC_CLIENT_ID     = Deno.env.get("FIC_CLIENT_ID") || "";
const FIC_CLIENT_SECRET = Deno.env.get("FIC_CLIENT_SECRET") || "";
const FIC_REDIRECT_URI  = Deno.env.get("FIC_REDIRECT_URI") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  let action = url.searchParams.get("action");

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Fix #1: Parse body once and read action from body as fallback
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch { /* empty body is ok for GET-like actions */ }
    if (!action && typeof body.action === "string") {
      action = body.action;
    }
  }

  const { data: cu } = await supabase
    .from("company_users").select("company_id").eq("user_id", user.id).single();
  if (!cu?.company_id) return new Response("Company not found", { status: 404 });
  const companyId = cu.company_id;

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  // ── OAuth2 FIC: ottieni URL autorizzazione
  if (action === "get_fic_auth_url") {
    const state = btoa(JSON.stringify({ company_id: companyId, ts: Date.now() }));
    const authUrl = `https://api.fattureincloud.it/v2/oauth/authorize?` +
      `client_id=${FIC_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(FIC_REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=issued_documents:r+issued_documents:w+clients:r+clients:w+info:r` +
      `&state=${state}`;
    return json({ auth_url: authUrl });
  }

  // ── OAuth2 FIC: scambia codice con token
  if (action === "fic_oauth_callback" && req.method === "POST") {
    const { code } = body as { code: string };
    const tokenRes = await fetch("https://api.fattureincloud.it/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: FIC_CLIENT_ID,
        client_secret: FIC_CLIENT_SECRET,
        redirect_uri: FIC_REDIRECT_URI,
        code,
      }),
    });
    if (!tokenRes.ok) return json({ error: "Token exchange failed" }, 400);
    const td = await tokenRes.json();

    const compRes = await fetch("https://api.fattureincloud.it/v2/user/companies", {
      headers: { Authorization: `Bearer ${td.access_token}` },
    });
    const compData = compRes.ok ? await compRes.json() : null;
    const ficCo = compData?.data?.companies?.[0];

    await supabase.from("billing_integrations").upsert({
      company_id: companyId,
      provider: "fattureincloud",
      is_active: true,
      access_token: td.access_token,
      refresh_token: td.refresh_token,
      token_expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString(),
      company_external_id: ficCo?.id?.toString(),
      provider_company_name: ficCo?.name,
      provider_vat_number: ficCo?.vat_number,
      auto_sync: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,provider" });

    return json({ success: true, company_name: ficCo?.name, vat_number: ficCo?.vat_number });
  }

  // ── Configura provider con API key
  if (action === "configure_apikey" && req.method === "POST") {
    const { provider, api_key } = body as { provider: string; api_key: string };
    const adapter = createAdapter({ provider, api_key });
    const test = await adapter.testConnection();
    if (!test.success) return json({ error: test.error || "API key non valida" }, 400);

    await supabase.from("billing_integrations").upsert({
      company_id: companyId,
      provider,
      is_active: true,
      api_key,
      provider_company_name: test.companyName,
      auto_sync: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,provider" });

    return json({ success: true, company_name: test.companyName });
  }

  // ── Configura Aruba (Bearer token)
  if (action === "configure_aruba" && req.method === "POST") {
    const { bearer_token } = body as { bearer_token: string };
    const adapter = createAdapter({ provider: "aruba", api_key: bearer_token });
    const test = await adapter.testConnection();
    if (!test.success) return json({ error: "Bearer token Aruba non valido" }, 400);

    await supabase.from("billing_integrations").upsert({
      company_id: companyId,
      provider: "aruba",
      is_active: true,
      api_key: bearer_token,
      provider_company_name: test.companyName,
      auto_sync: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,provider" });

    return json({ success: true, company_name: test.companyName });
  }

  // ── Testa connessione provider esistente
  if (action === "test_connection" && req.method === "POST") {
    const { provider } = body as { provider: string };
    const { data: integ } = await supabase
      .from("billing_integrations").select("*")
      .eq("company_id", companyId).eq("provider", provider).single();
    if (!integ) return json({ error: "Provider non configurato" }, 404);

    const adapter = createAdapter(integ);
    const result = await adapter.testConnection();

    await supabase.from("billing_integrations").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: result.success ? "success" : "error",
      last_sync_error: result.error || null,
    }).eq("id", integ.id);

    return json(result);
  }

  // ── Fix #7: Imposta provider primario — atomico (set new first, then unset others)
  if (action === "set_primary" && req.method === "POST") {
    const { provider } = body as { provider: string };
    // First set the new one as primary
    const { error: setErr } = await supabase.from("billing_integrations")
      .update({ is_primary: true })
      .eq("company_id", companyId).eq("provider", provider);
    if (setErr) return json({ error: "Errore aggiornamento primario" }, 500);
    // Then unset all others
    await supabase.from("billing_integrations")
      .update({ is_primary: false })
      .eq("company_id", companyId).neq("provider", provider);
    return json({ success: true });
  }

  // ── Toggle auto-sync
  if (action === "toggle_auto_sync" && req.method === "POST") {
    const { provider, auto_sync } = body as { provider: string; auto_sync: boolean };
    await supabase.from("billing_integrations")
      .update({ auto_sync })
      .eq("company_id", companyId).eq("provider", provider);
    return json({ success: true });
  }

  // ── Disconnetti provider
  if (action === "disconnect" && req.method === "POST") {
    const { provider } = body as { provider: string };
    await supabase.from("billing_integrations")
      .update({ is_active: false, access_token: null, refresh_token: null, api_key: null, is_primary: false })
      .eq("company_id", companyId).eq("provider", provider);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 404);
});
