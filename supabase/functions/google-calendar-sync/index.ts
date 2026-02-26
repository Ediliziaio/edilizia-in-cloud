import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";

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

// encrypt/decrypt/getEncryptionKey imported from _shared/encryption.ts

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
    signal: AbortSignal.timeout(15000),
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
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }
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

  // Clean up stale slots — delete events no longer returned by Google
  if (allGoogleEventIds.length > 0) {
    const { data: existingSlots } = await admin
      .from("google_calendar_busy_slots")
      .select("id, google_event_id")
      .eq("company_id", companyId)
      .eq("user_id", userId);

    const staleIds = (existingSlots || [])
      .filter((s: any) => !allGoogleEventIds.includes(s.google_event_id))
      .map((s: any) => s.id);

    if (staleIds.length > 0) {
      await admin.from("google_calendar_busy_slots").delete().in("id", staleIds);
    }
  } else {
    await admin
      .from("google_calendar_busy_slots")
      .delete()
      .eq("company_id", companyId)
      .eq("user_id", userId);
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

  const { data: apt } = await admin
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();
  if (!apt) return json({ error: "Appointment not found" }, 404);

  const { data: existing } = await admin
    .from("google_calendar_event_map")
    .select("id")
    .eq("appointment_id", appointmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return json({ error: "Already synced", mappingId: existing.id }, 409);

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
      signal: AbortSignal.timeout(15000),
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

  const { data: mapping } = await admin
    .from("google_calendar_event_map")
    .select("*")
    .eq("appointment_id", appointmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!mapping) return json({ error: "No mapping found, use push-event" }, 404);

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
      signal: AbortSignal.timeout(15000),
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
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const errText = await res.text();
      console.error("Delete event failed:", errText);
    }
  } catch (e) {
    console.error("Delete event error:", e);
  }

  await admin.from("google_calendar_event_map").delete().eq("id", mapping.id);

  return json({ success: true });
}

// ---- RECONCILE PRIMARY (Two-Way Sync) ----
async function reconcilePrimary(userId: string, companyId: string): Promise<{ created: number; updated: number; removed: number }> {
  const admin = getSupabaseAdmin();

  // Check platform policy
  const allowTwoWay = await getPlatformSetting("google_calendar_allow_two_way");
  if (allowTwoWay !== "true") {
    console.log("Two-way sync disabled by platform policy");
    return { created: 0, updated: 0, removed: 0 };
  }

  const settings = await getSettings(admin, userId, companyId);
  if (!settings?.primary_calendar_id || settings.sync_mode !== "two_way") {
    return { created: 0, updated: 0, removed: 0 };
  }

  const allowImport = (await getPlatformSetting("google_calendar_allow_google_to_crm_import")) === "true";

  const conn = await getConnection(admin, userId, companyId);
  if (!conn) return { created: 0, updated: 0, removed: 0 };

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return { created: 0, updated: 0, removed: 0 };

  const calId = settings.primary_calendar_id;
  const now = new Date();
  const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "500",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }
  );

  if (!res.ok) {
    console.error("reconcilePrimary: failed to fetch events", await res.text());
    return { created: 0, updated: 0, removed: 0 };
  }

  const data = await res.json();
  const googleEvents: any[] = (data.items || []).filter((e: any) => e.status !== "cancelled");

  // Load all existing mappings for this user
  const { data: existingMappings } = await admin
    .from("google_calendar_event_map")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("google_calendar_id", calId);

  const mappingsByGoogleId = new Map<string, any>();
  (existingMappings || []).forEach((m: any) => mappingsByGoogleId.set(m.google_event_id, m));

  const seenGoogleIds = new Set<string>();
  let created = 0, updated = 0, removed = 0;

  for (const gEvent of googleEvents) {
    const googleEventId = gEvent.id;
    seenGoogleIds.add(googleEventId);

    const mapping = mappingsByGoogleId.get(googleEventId);
    const crmOriginated = isCrmOriginated(gEvent);
    const currentEtag = gEvent.etag || null;

    if (mapping) {
      // Already mapped — check if changed
      if (mapping.etag === currentEtag) {
        // No change, skip
        continue;
      }

      // Etag differs — conflict resolution
      if (mapping.last_updated_by === "crm") {
        // CRM was last to update, but Google etag changed → user edited on Google → Google wins
      }

      // Google wins: update CRM appointment
      const fields = parseGoogleEventToCrmFields(gEvent);
      await admin
        .from("appointments")
        .update({
          title: fields.title,
          appointment_date: fields.date,
          appointment_time: fields.time,
          appointment_end_time: fields.endTime,
          description: fields.description,
          formatted_address: fields.location,
          updated_at: new Date().toISOString(),
        })
        .eq("id", mapping.appointment_id);

      await admin
        .from("google_calendar_event_map")
        .update({
          etag: currentEtag,
          last_synced_at: new Date().toISOString(),
          last_updated_by: "google",
        })
        .eq("id", mapping.id);

      updated++;
    } else if (crmOriginated) {
      // CRM-originated but mapping lost — re-link
      const aptId = extractCrmAppointmentId(gEvent);
      if (aptId) {
        await admin.from("google_calendar_event_map").insert({
          company_id: companyId,
          user_id: userId,
          appointment_id: aptId,
          google_event_id: googleEventId,
          google_calendar_id: calId,
          etag: currentEtag,
          source: "crm",
          last_synced_at: new Date().toISOString(),
          last_updated_by: "google",
        });
      }
    } else if (allowImport) {
      // New Google-only event → import to CRM
      const fields = parseGoogleEventToCrmFields(gEvent);
      const { data: newApt } = await admin
        .from("appointments")
        .insert({
          company_id: companyId,
          created_by: userId,
          title: fields.title || "Evento Google",
          appointment_date: fields.date,
          appointment_time: fields.time,
          appointment_end_time: fields.endTime,
          description: fields.description,
          formatted_address: fields.location,
          appointment_type: "altro",
          status: "confermato",
          is_completed: false,
          is_blocked_slot: false,
        })
        .select("id")
        .single();

      if (newApt) {
        await admin.from("google_calendar_event_map").insert({
          company_id: companyId,
          user_id: userId,
          appointment_id: newApt.id,
          google_event_id: googleEventId,
          google_calendar_id: calId,
          etag: currentEtag,
          source: "google",
          last_synced_at: new Date().toISOString(),
          last_updated_by: "google",
        });
        created++;
      }
    }
  }

  // Clean up mappings for events deleted on Google
  for (const [gId, mapping] of mappingsByGoogleId.entries()) {
    if (!seenGoogleIds.has(gId)) {
      await admin.from("google_calendar_event_map").delete().eq("id", mapping.id);
      removed++;
    }
  }

  return { created, updated, removed };
}

// ---- FULL SYNC ----
async function fullSync(userId: string, companyId: string): Promise<Response> {
  const pullRes = await pullBusySlots(userId, companyId);
  const pullData = await pullRes.json();

  // Run two-way reconciliation if enabled
  const reconcileResult = await reconcilePrimary(userId, companyId);

  return json({ ...pullData, reconcile: reconcileResult, action: "full-sync" });
}

// ---- HELPERS ----
function buildGoogleEvent(apt: any) {
  const hasTime = !!apt.appointment_time;
  const dateStr = apt.appointment_date;

  let start: any;
  let end: any;

  if (hasTime) {
    const startDateTime = `${dateStr}T${apt.appointment_time}:00`;
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

function isCrmOriginated(gEvent: any): boolean {
  const desc = gEvent.description || "";
  return desc.includes("crm_sync=true");
}

function extractCrmAppointmentId(gEvent: any): string | null {
  const desc = gEvent.description || "";
  const match = desc.match(/crm_appointment_id=([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

function parseGoogleEventToCrmFields(gEvent: any): {
  title: string | null;
  date: string;
  time: string | null;
  endTime: string | null;
  description: string | null;
  location: string | null;
} {
  const title = gEvent.summary || null;
  const location = gEvent.location || null;

  // Strip CRM metadata from description
  let description = gEvent.description || "";
  description = description
    .replace(/crm_appointment_id=[0-9a-f-]{36}/gi, "")
    .replace(/crm_sync=true/gi, "")
    .replace(/crm_last_update=[^\n]*/gi, "")
    .replace(/\n{2,}/g, "\n")
    .trim() || null;

  const isAllDay = !!gEvent.start?.date;
  let date: string;
  let time: string | null = null;
  let endTime: string | null = null;

  if (isAllDay) {
    date = gEvent.start.date; // YYYY-MM-DD
  } else {
    const dt = new Date(gEvent.start.dateTime);
    const pad = (n: number) => n.toString().padStart(2, "0");
    date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

    if (gEvent.end?.dateTime) {
      const edt = new Date(gEvent.end.dateTime);
      endTime = `${pad(edt.getHours())}:${pad(edt.getMinutes())}`;
    }
  }

  return { title, date, time, endTime, description, location };
}

// ---- CRON FULL SYNC (all connected users) ----
async function cronFullSync(): Promise<Response> {
  const admin = getSupabaseAdmin();

  // Create audit log row
  const { data: logRow, error: logErr } = await admin
    .from("google_calendar_sync_log")
    .insert({ status: "running" })
    .select("id")
    .single();

  const logId = logRow?.id;
  if (logErr) console.error("cronFullSync: failed to create log row", logErr);

  try {
    const { data: connections, error } = await admin
      .from("google_calendar_connections")
      .select("user_id, company_id")
      .eq("status", "connected");

    if (error) {
      console.error("cronFullSync: failed to fetch connections", error);
      if (logId) {
        await admin.from("google_calendar_sync_log").update({
          status: "failed",
          error_message: error.message,
          completed_at: new Date().toISOString(),
        }).eq("id", logId);
      }
      return json({ error: "Failed to fetch connections" }, 500);
    }

    const total = connections?.length ?? 0;
    if (total === 0) {
      if (logId) {
        await admin.from("google_calendar_sync_log").update({
          status: "completed",
          connections_found: 0,
          completed_at: new Date().toISOString(),
        }).eq("id", logId);
      }
      return json({ synced: 0, message: "No active connections" });
    }

    const results: any[] = [];
    let synced = 0;
    let failed = 0;

    for (const conn of connections!) {
      try {
        console.log(`cronFullSync: syncing user=${conn.user_id} company=${conn.company_id}`);
        const pullRes = await pullBusySlots(conn.user_id, conn.company_id);
        const pullData = await pullRes.json();
        const reconcileResult = await reconcilePrimary(conn.user_id, conn.company_id);
        results.push({
          userId: conn.user_id,
          companyId: conn.company_id,
          pull: pullData,
          reconcile: reconcileResult,
          status: "ok",
        });
        synced++;
      } catch (e: any) {
        console.error(`cronFullSync: error for user=${conn.user_id}`, e);
        results.push({
          userId: conn.user_id,
          companyId: conn.company_id,
          status: "error",
          error: e.message || "Unknown error",
        });
        failed++;
      }
    }

    // Update audit log
    if (logId) {
      await admin.from("google_calendar_sync_log").update({
        status: "completed",
        connections_found: total,
        connections_synced: synced,
        connections_failed: failed,
        results: results,
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    console.log(`cronFullSync: completed. Synced ${synced}, failed ${failed}.`);
    return json({ synced, failed, total, results });
  } catch (globalErr: any) {
    console.error("cronFullSync: global error", globalErr);
    if (logId) {
      await admin.from("google_calendar_sync_log").update({
        status: "failed",
        error_message: globalErr.message || "Unknown global error",
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
    }
    return json({ error: globalErr.message }, 500);
  }
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

    const body = await req.json();
    const { action } = body;

    // Cron full-sync: validate that the token is the anon key (from pg_cron)
    if (action === "cron-full-sync") {
      const token = authHeader.replace("Bearer ", "");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      if (token !== anonKey) {
        return json({ error: "Unauthorized for cron" }, 403);
      }
      return cronFullSync();
    }

    // All other actions require authenticated user
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userId = claimsData.claims.sub as string;
    const { companyId, appointmentId } = body;

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
      case "reconcile":
        const result = await reconcilePrimary(userId, companyId);
        return json({ success: true, reconcile: result });
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("google-calendar-sync error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
