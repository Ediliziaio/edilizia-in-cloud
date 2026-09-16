import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";

function json(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : {}), "Content-Type": "application/json" },
  });
}

function getAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// CalDAV HTTP helper con Basic Auth
async function caldavRequest(
  url: string,
  method: string,
  appleId: string,
  appPassword: string,
  body?: string,
  depth?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    "Authorization": "Basic " + btoa(`${appleId}:${appPassword}`),
    "Content-Type": "application/xml; charset=utf-8",
  };
  if (depth) headers["Depth"] = depth;
  return fetch(url, {
    method,
    headers,
    body,
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
}

// Estrae href da XML CalDAV
function extractHref(xml: string, tagPattern: string): string | null {
  const re = new RegExp(`<[^>]*${tagPattern}[^>]*>[\\s\\S]*?<[^>]*href[^>]*>([^<]+)`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() || null;
}

// Discovery CalDAV: trova principal URL e calendar-home-set
async function discoverCalDAV(appleId: string, appPassword: string) {
  // Step 1: well-known discovery
  const wellKnownRes = await caldavRequest(
    "https://caldav.icloud.com/.well-known/caldav",
    "PROPFIND",
    appleId,
    appPassword,
    `<?xml version='1.0' encoding='UTF-8'?>
<d:propfind xmlns:d='DAV:'>
  <d:prop><d:current-user-principal/></d:prop>
</d:propfind>`,
    "0"
  );

  if (wellKnownRes.status === 401 || wellKnownRes.status === 403) {
    throw new Error("Credenziali non valide. Verifica Apple ID e App-Specific Password.");
  }

  const wellKnownText = await wellKnownRes.text();

  // Estrai principal URL
  let principalUrl = extractHref(wellKnownText, "current-user-principal");
  if (!principalUrl) {
    principalUrl = wellKnownRes.url || "https://caldav.icloud.com/";
  }
  if (!principalUrl.startsWith("http")) {
    principalUrl = "https://caldav.icloud.com" + principalUrl;
  }

  // Step 2: PROPFIND sul principal per calendar-home-set
  const principalRes = await caldavRequest(
    principalUrl,
    "PROPFIND",
    appleId,
    appPassword,
    `<?xml version='1.0' encoding='UTF-8'?>
<d:propfind xmlns:d='DAV:' xmlns:c='urn:ietf:params:xml:ns:caldav'>
  <d:prop><c:calendar-home-set/></d:prop>
</d:propfind>`,
    "0"
  );

  const principalText = await principalRes.text();
  let homeUrl = extractHref(principalText, "calendar-home-set");
  if (homeUrl && !homeUrl.startsWith("http")) {
    homeUrl = "https://caldav.icloud.com" + homeUrl;
  }

  return { principalUrl, homeUrl };
}

// Lista calendari via PROPFIND
async function listCalendars(appleId: string, appPassword: string, homeUrl: string) {
  const res = await caldavRequest(
    homeUrl,
    "PROPFIND",
    appleId,
    appPassword,
    `<?xml version='1.0' encoding='UTF-8'?>
<d:propfind xmlns:d='DAV:' xmlns:c='urn:ietf:params:xml:ns:caldav'
  xmlns:cs='http://calendarserver.org/ns/'
  xmlns:ic='http://apple.com/ns/ical/'>
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <ic:calendar-color/>
    <cs:getctag/>
  </d:prop>
</d:propfind>`,
    "1"
  );

  const text = await res.text();
  const calendars: Array<{ url: string; name: string; color: string; ctag: string }> = [];

  const responses = text.split(/<[dD]:response>/i).slice(1);
  for (const resp of responses) {
    // Solo calendari CalDAV
    if (!resp.match(/<[^>]*calendar\s*\/>/i)) continue;
    const hrefMatch = resp.match(/<[dD]:href>([^<]+)/i);
    const href = hrefMatch?.[1]?.trim() || "";
    if (href.includes("inbox") || href.includes("outbox") || href.includes("notification")) continue;

    const nameMatch = resp.match(/<[dD]:displayname>([^<]*)/i);
    const colorMatch = resp.match(/<[^>]*calendar-color>([^<]*)/i);
    const ctagMatch = resp.match(/<[^>]*getctag>([^<]*)/i);

    let url = href;
    if (!url.startsWith("http")) url = "https://caldav.icloud.com" + url;

    calendars.push({
      url,
      name: nameMatch?.[1]?.trim() || "Senza nome",
      color: (colorMatch?.[1]?.trim() || "0078D4").replace("#", ""),
      ctag: ctagMatch?.[1]?.trim() || "",
    });
  }
  return calendars;
}

// Handler: connessione con Apple ID + App-Specific Password
async function handleConnect(req: Request, userId: string, companyId: string): Promise<Response> {
  const body = await req.clone().json().catch(() => ({}));
  const { appleId, appPassword } = body;

  if (!appleId || !appPassword) {
    return json({ error: "appleId e appPassword richiesti" }, 400, req);
  }

  let discovery;
  try {
    discovery = await discoverCalDAV(appleId, appPassword);
  } catch (e: any) {
    return json({ error: e.message || "Connessione fallita" }, 401, req);
  }

  if (!discovery.homeUrl) {
    return json({ error: "Impossibile trovare i calendari. Verifica le credenziali." }, 400, req);
  }

  const admin = getAdmin();
  const encKey = getEncryptionKey();

  const { error: salvataggioErr } = await admin.from("apple_calendar_connections").upsert({
    company_id: companyId,
    user_id: userId,
    apple_id_email: appleId,
    app_password_encrypted: await encrypt(appPassword, encKey),
    caldav_principal_url: discovery.principalUrl,
    caldav_home_url: discovery.homeUrl,
    status: "connected",
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,user_id" });
  // Prima l'errore non si guardava: l'interfaccia diceva «collegato» anche
  // quando la riga non era stata salvata.
  if (salvataggioErr) {
    console.error("[apple-calendar-auth] salvataggio connessione fallito:", salvataggioErr.message);
    return json({ error: "Collegamento non salvato: riprova tra poco." }, 500, req);
  }

  // Ensure settings row
  await admin.from("apple_calendar_settings").upsert({
    company_id: companyId,
    user_id: userId,
  }, { onConflict: "company_id,user_id", ignoreDuplicates: true });

  // Link connection_id
  const { data: conn } = await admin
    .from("apple_calendar_connections")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();

  if (conn) {
    await admin.from("apple_calendar_settings")
      .update({ connection_id: conn.id })
      .eq("company_id", companyId)
      .eq("user_id", userId);
  }

  return json({ success: true, principalUrl: discovery.principalUrl, homeUrl: discovery.homeUrl }, 200, req);
}

// Handler: disconnessione
async function handleDisconnect(req: Request, userId: string, companyId: string): Promise<Response> {
  const admin = getAdmin();

  await admin.from("apple_calendar_event_map").delete()
    .eq("company_id", companyId).eq("user_id", userId);
  await admin.from("apple_calendar_busy_slots").delete()
    .eq("company_id", companyId).eq("user_id", userId);
  await admin.from("apple_calendar_settings").delete()
    .eq("company_id", companyId).eq("user_id", userId);
  await admin.from("apple_calendar_connections").delete()
    .eq("company_id", companyId).eq("user_id", userId);

  return json({ success: true }, 200, req);
}

// Handler: lista calendari disponibili
async function handleListCalendars(req: Request, userId: string, companyId: string): Promise<Response> {
  const admin = getAdmin();
  const encKey = getEncryptionKey();

  const { data: conn } = await admin
    .from("apple_calendar_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn || conn.status !== "connected") {
    return json({ error: "Apple Calendar non connesso" }, 400, req);
  }

  const appPassword = await decrypt(conn.app_password_encrypted, encKey);
  try {
    const calendars = await listCalendars(conn.apple_id_email, appPassword, conn.caldav_home_url);
    return json({ calendars }, 200, req);
  } catch (e: any) {
    return json({ error: e.message || "Errore nel recupero dei calendari" }, 500, req);
  }
}

// Handler: test connessione
async function handleTestConnection(req: Request, userId: string, companyId: string): Promise<Response> {
  const admin = getAdmin();
  const encKey = getEncryptionKey();

  const { data: conn } = await admin
    .from("apple_calendar_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn) return json({ connected: false }, 200, req);

  const appPassword = await decrypt(conn.app_password_encrypted, encKey);
  try {
    await discoverCalDAV(conn.apple_id_email, appPassword);
    return json({ connected: true }, 200, req);
  } catch {
    await admin.from("apple_calendar_connections")
      .update({ status: "auth_failed", updated_at: new Date().toISOString() })
      .eq("company_id", companyId).eq("user_id", userId);
    return json({ connected: false }, 200, req);
  }
}

// MAIN HANDLER
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const actionFromQuery = url.searchParams.get("action");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) return json({ error: "Unauthorized" }, 401, req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !user) return json({ error: "Unauthorized" }, 401, req);

    const userId = user.id;

    // Parse body
    const body = await req.clone().json().catch(() => ({}));
    const action = actionFromQuery || body.action;

    // Ottieni company_id dall'utente
    const admin = getAdmin();
    const companyId = body.companyId;
    if (!companyId) return json({ error: "companyId richiesto" }, 400, req);

    // Security: validate the active tenant, including multi-company access.
    if (!(await canAccessCompany(admin, userId, companyId))) {
      return json({ error: "Company mismatch" }, 403, req);
    }

    switch (action) {
      case "connect": return handleConnect(req, userId, companyId);
      case "disconnect": return handleDisconnect(req, userId, companyId);
      case "list-calendars": return handleListCalendars(req, userId, companyId);
      case "test-connection": return handleTestConnection(req, userId, companyId);
      default: return json({ error: `Azione sconosciuta: ${action}` }, 400, req);
    }
  } catch (e: any) {
    console.error("apple-calendar-auth error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
