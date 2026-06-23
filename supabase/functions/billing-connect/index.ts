import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdapter, ArubaAdapter, AcubeAdapter } from "../_shared/billingAdapter.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { resolveEffectiveCompanyId, canAccessCompany } from "../_shared/effectiveCompany.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FIC_CLIENT_ID     = Deno.env.get("FIC_CLIENT_ID") || "";
const FIC_CLIENT_SECRET = Deno.env.get("FIC_CLIENT_SECRET") || "";
const FIC_REDIRECT_URI  = Deno.env.get("FIC_REDIRECT_URI") || "";

Deno.serve(async (req) => {
  const CORS = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
  const url = new URL(req.url);
  let action = url.searchParams.get("action");

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Non autenticato" }, 401);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json({ error: "Sessione non valida" }, 401);

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

  // Risoluzione azienda — NON esiste alcuna tabella company_users. Usiamo l'azienda
  // passata dal client (verificata con canAccessCompany: super_admin/impersonation/
  // multi-company) oppure, in fallback, quella effettiva (profiles.company_id + impersonation).
  let companyId: string | null =
    (typeof body.company_id === "string" && body.company_id) ? body.company_id : null;
  if (companyId) {
    const ok = await canAccessCompany(supabase, user.id, companyId);
    if (!ok) return json({ error: "Accesso negato a questa azienda" }, 403);
  } else {
    companyId = await resolveEffectiveCompanyId(supabase, user.id);
  }
  if (!companyId) return json({ error: "Nessuna azienda associata all'utente" }, 404);

  // ── OAuth2 FIC: ottieni URL autorizzazione
  if (action === "get_fic_auth_url") {
    const state = btoa(JSON.stringify({ company_id: companyId, ts: Date.now() }));
    const authUrl = `https://api-v2.fattureincloud.it/oauth/authorize?` +
      `client_id=${FIC_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(FIC_REDIRECT_URI)}` +
      `&response_type=code` +
      // Sola lettura (import/monitoraggio). Scope GRANULARI validi FIC v2 (verificati su
      // developers.fattureincloud.it/docs/basics/scopes): NON esiste "issued_documents:r"
      // né "info:r". Servono invoices + credit_notes (documenti emessi importati) +
      // entity.clients (anagrafica cliente embeddata nelle fatture). Separatore = spazio (qui "+").
      `&scope=issued_documents.invoices:r+issued_documents.credit_notes:r+entity.clients:r` +
      `&state=${state}`;
    return json({ auth_url: authUrl });
  }

  // ── OAuth2 FIC: scambia codice con token
  if (action === "fic_oauth_callback" && req.method === "POST") {
    const { code } = body as { code: string };
    const tokenRes = await fetch("https://api-v2.fattureincloud.it/oauth/token", {
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

    const compRes = await fetch("https://api-v2.fattureincloud.it/user/companies", {
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

  // ── Configura Aruba (username + password account Fatturazione Elettronica)
  // Aruba usa OAuth2 password grant: salviamo user (company_external_id) + password
  // (api_key, serve per il re-signin quando scade il refresh) + il token ottenuto nel
  // test, così l'import non rifà un secondo signin entro il minuto (limite 1/min).
  if (action === "configure_aruba" && req.method === "POST") {
    const { username, password } = body as { username: string; password: string };
    if (!username || !password) return json({ error: "Username e password Aruba richiesti" }, 400);

    const adapter = new ArubaAdapter(username, password);
    const test = await adapter.testConnection();
    if (!test.success) return json({ error: test.error || "Credenziali Aruba non valide" }, 400);

    await supabase.from("billing_integrations").upsert({
      company_id: companyId,
      provider: "aruba",
      is_active: true,
      company_external_id: username,
      api_key: password,
      access_token: adapter.lastToken?.access_token ?? null,
      refresh_token: adapter.lastToken?.refresh_token ?? null,
      token_expires_at: adapter.lastToken
        ? new Date(Date.now() + adapter.lastToken.expires_in * 1000).toISOString()
        : null,
      provider_company_name: test.companyName,
      auto_sync: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,provider" });

    return json({ success: true, company_name: test.companyName });
  }

  // ── Configura A-Cube (email + password account A-Cube) — BETA
  // Login email/password → JWT 24h: salviamo email (company_external_id) + password
  // (api_key, per il re-login) + il token ottenuto nel test (valido 24h).
  if (action === "configure_acube" && req.method === "POST") {
    const { email, password } = body as { email: string; password: string };
    if (!email || !password) return json({ error: "Email e password A-Cube richieste" }, 400);

    const adapter = new AcubeAdapter(email, password);
    const test = await adapter.testConnection();
    if (!test.success) return json({ error: test.error || "Credenziali A-Cube non valide" }, 400);

    await supabase.from("billing_integrations").upsert({
      company_id: companyId,
      provider: "acube",
      is_active: true,
      company_external_id: email,
      api_key: password,
      access_token: adapter.lastToken ?? null,
      token_expires_at: adapter.lastToken
        ? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
        : null,
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
  } catch (e) {
    console.error("billing-connect error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
