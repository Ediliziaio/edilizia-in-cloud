import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// encrypt/decrypt/getEncryptionKey imported from _shared/encryption.ts

async function getRedirectUri(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/google-calendar-auth?action=callback`;
}

// ---- ACTION HANDLERS ----

async function handleStart(userId: string, companyId: string): Promise<Response> {
  const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
  if (!clientId) {
    return new Response(JSON.stringify({ error: "Google Calendar non configurato. Contatta l'amministratore." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const redirectUri = await getRedirectUri();
  const state = btoa(JSON.stringify({ userId, companyId, ts: Date.now() }));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return new Response(JSON.stringify({ url }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !stateParam) {
    return buildCallbackHtml("error", error || "Missing code");
  }

  let state: { userId: string; companyId: string };
  try {
    state = JSON.parse(atob(stateParam));
  } catch {
    return buildCallbackHtml("error", "Invalid state");
  }

  const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_calendar_client_secret", "GOOGLE_CALENDAR_CLIENT_SECRET");
  const redirectUri = await getRedirectUri();

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("Token exchange failed:", err);
    return buildCallbackHtml("error", "Token exchange failed");
  }

  const tokens = await tokenRes.json();
  const encKey = getEncryptionKey();

  // Get user info from Google
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  const userInfo = userInfoRes.ok ? await userInfoRes.json() : {};

  const admin = getSupabaseAdmin();

  // Upsert connection
  const { error: upsertErr } = await admin
    .from("google_calendar_connections")
    .upsert(
      {
        company_id: state.companyId,
        user_id: state.userId,
        google_account_email: userInfo.email || null,
        google_sub: userInfo.id || null,
        access_token_encrypted: encrypt(tokens.access_token, encKey),
        refresh_token_encrypted: tokens.refresh_token ? encrypt(tokens.refresh_token, encKey) : null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        status: "connected",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,user_id" }
    );

  if (upsertErr) {
    console.error("Upsert connection error:", upsertErr);
    return buildCallbackHtml("error", "Database error");
  }

  // Ensure settings row exists
  await admin.from("google_calendar_settings").upsert(
    {
      company_id: state.companyId,
      user_id: state.userId,
      connection_id: undefined, // will be linked after
    },
    { onConflict: "company_id,user_id", ignoreDuplicates: true }
  );

  // Link connection_id to settings
  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("id")
    .eq("company_id", state.companyId)
    .eq("user_id", state.userId)
    .single();

  if (conn) {
    await admin
      .from("google_calendar_settings")
      .update({ connection_id: conn.id })
      .eq("company_id", state.companyId)
      .eq("user_id", state.userId);
  }

  return buildCallbackHtml("success");
}

async function handleDisconnect(userId: string, companyId: string): Promise<Response> {
  const admin = getSupabaseAdmin();

  // Try to revoke token first
  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("access_token_encrypted")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();

  if (conn?.access_token_encrypted) {
    try {
      const encKey = getEncryptionKey();
      const token = decrypt(conn.access_token_encrypted, encKey);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: "POST", signal: AbortSignal.timeout(10000) });
    } catch (e) {
      console.warn("Token revoke failed (non-critical):", e);
    }
  }

  // Delete all related data
  await admin.from("google_calendar_busy_slots").delete().eq("company_id", companyId).eq("user_id", userId);
  await admin.from("google_calendar_event_map").delete().eq("company_id", companyId).eq("user_id", userId);
  await admin.from("google_calendar_settings").delete().eq("company_id", companyId).eq("user_id", userId);
  await admin.from("google_calendar_connections").delete().eq("company_id", companyId).eq("user_id", userId);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleRefresh(userId: string, companyId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const encKey = getEncryptionKey();

  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();

  if (!conn?.refresh_token_encrypted) {
    return new Response(JSON.stringify({ error: "No refresh token" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_calendar_client_secret", "GOOGLE_CALENDAR_CLIENT_SECRET");
  const refreshToken = decrypt(conn.refresh_token_encrypted, encKey);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!tokenRes.ok) {
    await admin
      .from("google_calendar_connections")
      .update({ status: "token_expired", last_error: "Refresh token failed" })
      .eq("id", conn.id);
    return new Response(JSON.stringify({ error: "Refresh failed" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tokens = await tokenRes.json();
  await admin
    .from("google_calendar_connections")
    .update({
      access_token_encrypted: encrypt(tokens.access_token, encKey),
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : conn.token_expires_at,
      status: "connected",
      last_error: null,
    })
    .eq("id", conn.id);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleListCalendars(userId: string, companyId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const encKey = getEncryptionKey();

  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();

  if (!conn) {
    return new Response(JSON.stringify({ error: "Not connected" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check if token needs refresh
  let accessToken = decrypt(conn.access_token_encrypted, encKey);
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
    const refreshRes = await handleRefresh(userId, companyId);
    if (!refreshRes.ok) {
      return refreshRes;
    }
    // Re-fetch updated token
    const { data: updated } = await admin
      .from("google_calendar_connections")
      .select("access_token_encrypted")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .single();
    if (updated) accessToken = decrypt(updated.access_token_encrypted, encKey);
  }

  const calRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }
  );

  if (!calRes.ok) {
    const errText = await calRes.text();
    console.error("Google Calendar list failed:", errText);
    return new Response(JSON.stringify({ error: "Failed to fetch calendars" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const calData = await calRes.json();
  const calendars = (calData.items || []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    primary: c.primary || false,
    backgroundColor: c.backgroundColor,
    accessRole: c.accessRole,
  }));

  return new Response(JSON.stringify({ calendars }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildCallbackHtml(status: string, error?: string): Response {
  // Use Supabase URL origin as a safe fallback for postMessage target
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  // Extract the project ref to build the preview/published origins
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
  const allowedOrigins = [
    `https://${projectRef}.supabase.co`,
    "https://edilizia-in-cloud.lovable.app",
  ];
  const html = `<!DOCTYPE html><html><body><script>
    var allowedOrigins = ${JSON.stringify(allowedOrigins)};
    var msg = { type: "GOOGLE_OAUTH_RESULT", status: "${status}", error: ${JSON.stringify(error || null)} };
    if (window.opener) {
      allowedOrigins.forEach(function(origin) {
        try { window.opener.postMessage(msg, origin); } catch(e) {}
      });
      // Also try current origin for preview URLs
      try { window.opener.postMessage(msg, window.location.origin); } catch(e) {}
    }
    window.close();
  </script><p>${status === "success" ? "Connesso! Puoi chiudere questa finestra." : "Errore: " + (error || "sconosciuto")}</p></body></html>`;
  return new Response(html, {
    headers: { ...corsHeaders, "Content-Type": "text/html" },
  });
}

// ---- MAIN HANDLER ----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Callback is GET (redirect from Google)
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.searchParams.has("code") || url.searchParams.has("error")) {
        return handleCallback(req);
      }
      return new Response("OK", { headers: corsHeaders });
    }

    // All other actions are POST with JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const body = await req.json();
    const { action, companyId } = body;

    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // P0 Security: Validate companyId matches authenticated user's profile
    const { data: profile } = getSupabaseAdmin()
      ? await getSupabaseAdmin().from("profiles").select("company_id").eq("id", userId).single()
      : { data: null };
    if (!profile || profile.company_id !== companyId) {
      return new Response(JSON.stringify({ error: "Company mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "start":
        return handleStart(userId, companyId);
      case "disconnect":
        return handleDisconnect(userId, companyId);
      case "refresh":
        return handleRefresh(userId, companyId);
      case "list-calendars":
        return handleListCalendars(userId, companyId);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("google-calendar-auth error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
