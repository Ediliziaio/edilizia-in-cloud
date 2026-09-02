/**
 * outlook-calendar-sync — sincronizza eventi da Outlook Calendar via Microsoft Graph
 *
 * POST /functions/v1/outlook-calendar-sync
 * Body: { calendar_id?: string, from?: ISO, to?: ISO }
 *   calendar_id: override del calendario sincronizzato (default: primary)
 *   from/to: range temporale (default: oggi → +60 giorni)
 *
 * API: GET /me/calendars/{id}/calendarView?startDateTime=..&endDateTime=..
 * Token refresh automatico via refresh_token.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getMsOAuthCredentials } from "../_shared/msOAuth.ts";

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getFreshAccessToken(connectionId: string): Promise<string> {
  const db = admin();
  const { data: conn } = await db
    .from("outlook_calendar_connections")
    .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (!conn) throw new Error("Connection not found");

  const encKey = getEncryptionKey();
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60_000 && conn.access_token_encrypted) {
    return await decrypt(conn.access_token_encrypted, encKey);
  }
  if (!conn.refresh_token_encrypted) throw new Error("No refresh token");

  const { clientId, clientSecret } = await getMsOAuthCredentials();
  if (!clientId || !clientSecret) throw new Error("OAuth credentials missing");

  const refreshToken = await decrypt(conn.refresh_token_encrypted, encKey);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "openid profile offline_access User.Read Calendars.ReadWrite",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`refresh failed: ${await res.text()}`);
  const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };

  await db.from("outlook_calendar_connections").update({
    access_token_encrypted: await encrypt(tokens.access_token, encKey),
    refresh_token_encrypted: tokens.refresh_token ? await encrypt(tokens.refresh_token, encKey) : undefined,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq("id", connectionId);

  return tokens.access_token;
}

interface GraphEvent {
  id: string;
  iCalUId?: string;
  subject?: string;
  bodyPreview?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  organizer?: { emailAddress?: { address?: string; name?: string } };
  attendees?: Array<{
    emailAddress?: { address?: string; name?: string };
    status?: { response?: string };
  }>;
  showAs?: string;
  seriesMasterId?: string;
  isCancelled?: boolean;
  webLink?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      calendar_id?: string;
      from?: string;
      to?: string;
    };

    const db = admin();
    const { data: conn } = await db
      .from("outlook_calendar_connections")
      .select("id, company_id, user_id, primary_calendar_id, synced_calendar_ids")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conn) {
      return new Response(JSON.stringify({ error: "Outlook non collegato" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const calendarId = body.calendar_id ?? conn.primary_calendar_id;
    if (!calendarId) {
      return new Response(JSON.stringify({ error: "Nessun calendario selezionato" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Default range: today → +60 days
    const now = new Date();
    const from = body.from ?? now.toISOString();
    const toDefault = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const to = body.to ?? toDefault.toISOString();

    const accessToken = await getFreshAccessToken(conn.id);

    // Paginated fetch via @odata.nextLink
    const eventsAll: GraphEvent[] = [];
    let url: string | null = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView`
      + `?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}`
      + "&$top=100&$select=id,iCalUId,subject,bodyPreview,start,end,isAllDay,location,organizer,attendees,showAs,seriesMasterId,isCancelled,webLink";
    let pages = 0;

    while (url && pages < 20) {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const errText = await res.text();
        await db.from("outlook_calendar_connections").update({
          last_error: `Graph ${res.status}: ${errText.slice(0, 200)}`,
        }).eq("id", conn.id);
        throw new Error(`Graph fetch failed: ${res.status} ${errText.slice(0, 200)}`);
      }
      const json = await res.json() as { value?: GraphEvent[]; "@odata.nextLink"?: string };
      eventsAll.push(...(json.value ?? []));
      url = json["@odata.nextLink"] ?? null;
      pages++;
    }

    // Upsert
    if (eventsAll.length > 0) {
      const rows = eventsAll.map((e) => ({
        connection_id: conn.id,
        company_id: conn.company_id,
        user_id: conn.user_id,
        outlook_event_id: e.id,
        outlook_calendar_id: calendarId,
        outlook_ical_uid: e.iCalUId ?? null,
        subject: e.subject ?? null,
        body_preview: e.bodyPreview ?? null,
        start_time: e.start?.dateTime ? new Date(e.start.dateTime + "Z").toISOString() : null,
        end_time: e.end?.dateTime ? new Date(e.end.dateTime + "Z").toISOString() : null,
        is_all_day: e.isAllDay ?? false,
        location_display_name: e.location?.displayName ?? null,
        organizer_email: e.organizer?.emailAddress?.address ?? null,
        attendees: (e.attendees ?? []).map((a) => ({
          email: a.emailAddress?.address ?? null,
          name: a.emailAddress?.name ?? null,
          response_status: a.status?.response ?? null,
        })),
        show_as: e.showAs ?? null,
        series_master_id: e.seriesMasterId ?? null,
        is_cancelled: e.isCancelled ?? false,
        web_link: e.webLink ?? null,
        raw: e,
      }));

      const { error: upsertErr } = await db.from("outlook_calendar_events").upsert(rows, {
        onConflict: "connection_id,outlook_event_id",
      });
      if (upsertErr) {
        console.error("[outlook-calendar-sync] upsert error:", upsertErr);
        throw upsertErr;
      }
    }

    await db.from("outlook_calendar_connections").update({
      last_sync_at: new Date().toISOString(),
      last_sync_event_count: eventsAll.length,
      last_error: null,
    }).eq("id", conn.id);

    return new Response(JSON.stringify({ ok: true, synced: eventsAll.length, calendar_id: calendarId }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[outlook-calendar-sync] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
