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
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { getMsOAuthCredentials } from "../_shared/msOAuth.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
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
  if (!res.ok) {
    // Come per Google: `invalid_grant` significa consenso revocato (la
    // connessione e' finita), tutto il resto e' un intoppo passeggero e non
    // deve marcare la connessione, altrimenti nessun cron riprova piu'.
    const corpo = await res.text().catch(() => "unknown");
    const permanente = /invalid_grant|invalid_client|unauthorized_client/i.test(corpo);
    await db
      .from("outlook_calendar_connections")
      .update({
        last_error: `Refresh token failed: ${corpo.substring(0, 200)}`,
        ...(permanente ? { status: "token_expired" } : {}),
      })
      .eq("id", connectionId);
    throw new Error(`refresh failed: ${corpo}`);
  }
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

interface ConnRow {
  id: string; company_id: string; user_id: string;
  primary_calendar_id: string | null; synced_calendar_ids?: string[] | null;
}

/**
 * Sincronizza UN calendario di UNA connessione (finestra default: oggi → +60
 * giorni). Usata sia dalla chiamata dell'utente sia dal cron: prima esisteva
 * solo dentro il handler utente, quindi Outlook si aggiornava SOLO quando
 * qualcuno premeva "Sincronizza" — Google invece gira ogni 15 minuti.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncConnection(db: any, conn: ConnRow, calendarId: string, opts: { from?: string; to?: string }): Promise<number> {
  // Default range: today → +60 days
  const now = new Date();
  const from = opts.from ?? now.toISOString();
  const toDefault = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const to = opts.to ?? toDefault.toISOString();

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
  return eventsAll.length;
}

/** Cron: tutte le connessioni col calendario scelto, una alla volta, errori isolati. */
async function cronFullSync(): Promise<Response> {
  const db = admin();
  const { data: conns } = await db
    .from("outlook_calendar_connections")
    .select("id, company_id, user_id, primary_calendar_id, synced_calendar_ids")
    .not("primary_calendar_id", "is", null);
  const esito = { connessioni: (conns ?? []).length, ok: 0, errori: 0, eventi: 0 };
  for (const conn of (conns ?? []) as ConnRow[]) {
    try {
      // Il principale, gli altri scelti nelle impostazioni e i calendari
      // agganciati ai calendari di marketing (passo 3): fino al 09/09/2026 quella
      // scelta si salvava e poi non la leggeva nessuno.
      const { data: agganciati } = await db
        .from("marketing_calendars")
        .select("external_calendar_id")
        .eq("external_connection_id", conn.id)
        .eq("external_provider", "outlook")
        .eq("is_active", true);
      const calendari = new Set<string>([conn.primary_calendar_id!]);
      for (const id of conn.synced_calendar_ids ?? []) if (id) calendari.add(id);
      for (const a of (agganciati ?? []) as Array<{ external_calendar_id: string | null }>) if (a.external_calendar_id) calendari.add(a.external_calendar_id);
      for (const calendarId of calendari) {
        esito.eventi += await syncConnection(db, conn, calendarId, {});
      }
      esito.ok++;
    } catch (e) {
      // L'errore e' gia' annotato su last_error dalla sync: qui si passa oltre,
      // una connessione rotta non deve fermare le altre.
      console.error("[outlook-calendar-sync] cron, connessione", conn.id, (e as Error)?.message);
      esito.errori++;
    }
  }
  return new Response(JSON.stringify({ ok: true, ...esito }), { headers: { "Content-Type": "application/json" } });
}

serveConMetriche("outlook-calendar-sync", async (req) => {
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
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      companyId?: string;
      calendar_id?: string;
      from?: string;
      to?: string;
    };

    // Cron: solo col segreto interno (x-cron-secret dal Vault, job
    // outlook-calendar-sync-every-15min). Prima bastava la chiave anon, che è
    // pubblica: chiunque poteva far sincronizzare tutti i calendari.
    if (body.action === "cron-full-sync") {
      if (!cronSecretValido(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return await cronFullSync();
    }

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

    const db = admin();
    // Un collegamento per azienda: si usa quello dell'azienda attiva.
    const companyId = typeof body.companyId === "string" && body.companyId ? body.companyId : null;
    let q = db
      .from("outlook_calendar_connections")
      .select("id, company_id, user_id, primary_calendar_id, synced_calendar_ids")
      .eq("user_id", user.id);
    if (companyId) q = q.eq("company_id", companyId);
    const { data: righe } = await q.limit(2);
    const conn = (righe ?? []).length === 1 ? righe![0] : null;
    if (!conn) {
      return new Response(JSON.stringify({ error: (righe ?? []).length > 1 ? "Indica l'azienda da sincronizzare" : "Outlook non collegato" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Tutti i calendari spuntati, come fa il giro automatico. Prima la sync
    // manuale leggeva solo il principale e ignorava le spunte.
    let calendari: string[];
    if (body.calendar_id) {
      calendari = [body.calendar_id];
    } else {
      const { data: agganciati } = await db
        .from("marketing_calendars")
        .select("external_calendar_id")
        .eq("external_connection_id", conn.id)
        .eq("external_provider", "outlook")
        .eq("is_active", true);
      calendari = Array.from(new Set([
        conn.primary_calendar_id,
        ...((conn.synced_calendar_ids as string[] | null) ?? []),
        ...((agganciati ?? []) as Array<{ external_calendar_id: string | null }>).map((a) => a.external_calendar_id),
      ].filter((x): x is string => !!x)));
    }
    if (calendari.length === 0) {
      return new Response(JSON.stringify({ error: "Nessun calendario selezionato" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let synced = 0;
    for (const calendarId of calendari) {
      synced += await syncConnection(db, conn as ConnRow, calendarId, { from: body.from, to: body.to });
    }

    return new Response(JSON.stringify({ ok: true, synced, calendari: calendari.length }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[outlook-calendar-sync] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
