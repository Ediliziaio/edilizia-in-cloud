import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function getEncryptionKey(): string {
  const key = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (key) return key;
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "default-dev-key";
  return srk.substring(0, 32);
}

function encrypt(text: string, key: string): string {
  const textBytes = new TextEncoder().encode(text);
  const keyBytes = new TextEncoder().encode(key);
  const encrypted = new Uint8Array(textBytes.length);
  for (let i = 0; i < textBytes.length; i++) {
    encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return btoa(String.fromCharCode(...encrypted));
}

function decrypt(encoded: string, key: string): string {
  const encrypted = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(key);
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(decrypted);
}

// Get a valid access token, refreshing if expired
async function getValidAccessToken(
  admin: ReturnType<typeof getSupabaseAdmin>,
  conn: any
): Promise<string | null> {
  const encKey = getEncryptionKey();

  if (!conn.access_token_encrypted) return null;

  // Check if token still valid (with 2 min buffer)
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
  if (expiresAt && expiresAt > new Date(Date.now() + 120_000)) {
    return decrypt(conn.access_token_encrypted, encKey);
  }

  // Need refresh
  if (!conn.refresh_token_encrypted) return null;

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
  });

  if (!tokenRes.ok) {
    await admin
      .from("google_calendar_connections")
      .update({ status: "token_expired", last_error: "Refresh token failed" })
      .eq("id", conn.id);
    return null;
  }

  const tokens = await tokenRes.json();
  const newAccessToken = tokens.access_token;
  await admin
    .from("google_calendar_connections")
    .update({
      access_token_encrypted: encrypt(newAccessToken, encKey),
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : conn.token_expires_at,
      status: "connected",
      last_error: null,
    })
    .eq("id", conn.id);

  return newAccessToken;
}

async function getConnection(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, companyId: string) {
  const { data } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("status", "connected")
    .single();
  return data;
}

async function getSettings(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, companyId: string) {
  const { data } = await admin
    .from("google_calendar_settings")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();
  return data;
}

// ---- PULL BUSY SLOTS ----
async function pullBusySlots(userId: string, companyId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const conn = await getConnection(admin, userId, companyId);
  if (!conn) return json({ error: "Not connected to Google Calendar" }, 404);

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return json({ error: "Token expired, reconnect required" }, 401);

  const settings = await getSettings(admin, userId, companyId);
  const calendarIds = settings?.conflict_calendar_ids || [];
  if (calendarIds.length === 0) {
    return json({ pulled: 0, message: "No conflict calendars configured" });
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

  let totalPulled = 0;
  const allGoogleEventIds: string[] = [];

  for (const calId of calendarIds) {
    try {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Failed to fetch events for calendar ${calId}:`, errText);
        continue;
      }

      const data = await res.json();
      const events = data.items || [];

      for (const event of events) {
        if (event.status === "cancelled") continue;

        const isAllDay = !!event.start?.date;
        const startAt = isAllDay ? event.start.date + "T00:00:00Z" : event.start?.dateTime;
        const endAt = isAllDay ? event.end.date + "T00:00:00Z" : event.end?.dateTime;
        if (!startAt || !endAt) continue;

        const googleEventId = event.id;
        allGoogleEventIds.push(googleEventId);

        await admin.from("google_calendar_busy_slots").upsert(
          {
            company_id: companyId,
            user_id: userId,
            google_event_id: googleEventId,
            google_calendar_id: calId,
            summary: event.summary || null,
            start_at: startAt,
            end_at: endAt,
            is_all_day: isAllDay,
          },
          { onConflict: "company_id,user_id,google_event_id" }
        );
        totalPulled++;
      }
    } catch (e) {
      console.error(`Error pulling calendar ${calId}:`, e);
    }
  }

  // Clean up stale slots
  if (allGoogleEventIds.length > 0) {
    await admin
      .from("google_calendar_busy_slots")
      .delete()
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .not("google_event_id", "in", `(${allGoogleEventIds.map(id => `"${id}"`).join(",")})`);
  }

  // Update last_sync_at
  await admin
    .from("google_calendar_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", conn.id);

  return json({ pulled: totalPulled });
}

// ---- PUSH EVENT ----
async function pushEvent(userId: string, companyId: string, appointmentId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const conn = await getConnection(admin, userId, companyId);
  if (!conn) return json({ error: "Not connected" }, 404);

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return json({ error: "Token expired" }, 401);

  const settings = await getSettings(admin, userId, companyId);
  if (!settings?.primary_calendar_id) return json({ error: "No primary calendar configured" }, 400);

  // Get appointment
  const { data: apt } = await admin
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();
  if (!apt) return json({ error: "Appointment not found" }, 404);

  // Check if mapping already exists
  const { data: existing } = await admin
    .from("google_calendar_event_map")
    .select("id")
    .eq("appointment_id", appointmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return json({ error: "Already synced", mappingId: existing.id }, 409);

  // Build Google event
  const googleEvent = buildGoogleEvent(apt);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(settings.primary_calendar_id)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(googleEvent),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("Push event failed:", errText);
    if (res.status === 401 || res.status === 403) {
      await admin.from("google_calendar_connections").update({ status: "token_expired" }).eq("id", conn.id);
    }
    return json({ error: "Failed to create Google event" }, 502);
  }

  const created = await res.json();

  // Save mapping
  await admin.from("google_calendar_event_map").insert({
    company_id: companyId,
    user_id: userId,
    appointment_id: appointmentId,
    google_event_id: created.id,
    google_calendar_id: settings.primary_calendar_id,
    etag: created.etag || null,
    source: "crm",
    last_synced_at: new Date().toISOString(),
    last_updated_by: "crm",
  });

  return json({ success: true, googleEventId: created.id });
}

// ---- UPDATE EVENT ----
async function updateEvent(userId: string, companyId: string, appointmentId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const conn = await getConnection(admin, userId, companyId);
  if (!conn) return json({ error: "Not connected" }, 404);

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return json({ error: "Token expired" }, 401);

  // Get mapping
  const { data: mapping } = await admin
    .from("google_calendar_event_map")
    .select("*")
    .eq("appointment_id", appointmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!mapping) return json({ error: "No mapping found, use push-event" }, 404);

  // Get appointment
  const { data: apt } = await admin
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();
  if (!apt) return json({ error: "Appointment not found" }, 404);

  const googleEvent = buildGoogleEvent(apt);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(mapping.google_calendar_id!)}/events/${encodeURIComponent(mapping.google_event_id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(googleEvent),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("Update event failed:", errText);
    return json({ error: "Failed to update Google event" }, 502);
  }

  const updated = await res.json();
  await admin
    .from("google_calendar_event_map")
    .update({
      etag: updated.etag || null,
      last_synced_at: new Date().toISOString(),
      last_updated_by: "crm",
    })
    .eq("id", mapping.id);

  return json({ success: true });
}

// ---- DELETE EVENT ----
async function deleteEvent(userId: string, companyId: string, appointmentId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const conn = await getConnection(admin, userId, companyId);
  if (!conn) return json({ error: "Not connected" }, 404);

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return json({ error: "Token expired" }, 401);

  const { data: mapping } = await admin
    .from("google_calendar_event_map")
    .select("*")
    .eq("appointment_id", appointmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!mapping) return json({ success: true, message: "No mapping found" });

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(mapping.google_calendar_id!)}/events/${encodeURIComponent(mapping.google_event_id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const errText = await res.text();
      console.error("Delete event failed:", errText);
    }
  } catch (e) {
    console.error("Delete event error:", e);
  }

  // Remove mapping regardless
  await admin.from("google_calendar_event_map").delete().eq("id", mapping.id);

  return json({ success: true });
}

// ---- FULL SYNC ----
async function fullSync(userId: string, companyId: string): Promise<Response> {
  const pullRes = await pullBusySlots(userId, companyId);
  const pullData = await pullRes.json();

  return json({ ...pullData, action: "full-sync" });
}

// ---- HELPERS ----
function buildGoogleEvent(apt: any) {
  const hasTime = !!apt.appointment_time;
  const dateStr = apt.appointment_date;

  let start: any;
  let end: any;

  if (hasTime) {
    const startDateTime = `${dateStr}T${apt.appointment_time}:00`;
    // Default 1 hour duration
    const endTime = apt.appointment_end_time
      ? `${dateStr}T${apt.appointment_end_time}:00`
      : addHour(startDateTime);
    start = { dateTime: startDateTime, timeZone: "Europe/Rome" };
    end = { dateTime: endTime, timeZone: "Europe/Rome" };
  } else {
    start = { date: dateStr };
    end = { date: dateStr };
  }

  const description = [
    apt.description || "",
    "",
    `crm_appointment_id=${apt.id}`,
    `crm_sync=true`,
    `crm_last_update=${new Date().toISOString()}`,
  ].join("\n");

  return {
    summary: apt.title,
    description,
    start,
    end,
    ...(apt.formatted_address ? { location: apt.formatted_address } : {}),
  };
}

function addHour(dateTime: string): string {
  const d = new Date(dateTime);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

// ---- MAIN ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userId = userData.user.id;
    const body = await req.json();
    const { action, companyId, appointmentId } = body;

    if (!companyId) return json({ error: "companyId required" }, 400);

    switch (action) {
      case "pull-busy-slots":
        return pullBusySlots(userId, companyId);
      case "push-event":
        if (!appointmentId) return json({ error: "appointmentId required" }, 400);
        return pushEvent(userId, companyId, appointmentId);
      case "update-event":
        if (!appointmentId) return json({ error: "appointmentId required" }, 400);
        return updateEvent(userId, companyId, appointmentId);
      case "delete-event":
        if (!appointmentId) return json({ error: "appointmentId required" }, 400);
        return deleteEvent(userId, companyId, appointmentId);
      case "full-sync":
        return fullSync(userId, companyId);
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("google-calendar-sync error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
