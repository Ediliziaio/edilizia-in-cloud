import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEncryptionKey, decrypt } from "../_shared/encryption.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { getCorsHeaders, jsonResponse as json } from "../_shared/headers.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ---- CalDAV HTTP helper ----
async function caldavRequest(
  url: string,
  method: string,
  appleId: string,
  appPassword: string,
  body?: string,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const headers: Record<string, string> = {
    "Authorization": "Basic " + btoa(`${appleId}:${appPassword}`),
    ...extraHeaders,
  };
  if (!headers["Content-Type"]) {
    headers["Content-Type"] = "application/xml; charset=utf-8";
  }
  return fetch(url, {
    method,
    headers,
    body,
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
}

// ---- iCalendar builder ----
function formatICalDate(dateStr: string, timeStr: string | null): string {
  if (!timeStr) {
    // All-day: YYYYMMDD
    return dateStr.replace(/-/g, "");
  }
  // With time: YYYYMMDDTHHMMSS
  const d = dateStr.replace(/-/g, "");
  const t = timeStr.replace(/:/g, "").substring(0, 6);
  return `${d}T${t}`;
}

function addHour(dateStr: string, timeStr: string): string {
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  dt.setHours(dt.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function buildICalendar(apt: any): string {
  const uid = `apt-${apt.id}@ediliziacloud`;
  const hasTime = !!apt.appointment_time;
  const dateStr = apt.appointment_date;
  const timeStr = apt.appointment_time?.substring(0, 5) || null;
  const endTimeStr = apt.appointment_end_time?.substring(0, 5) || (timeStr ? addHour(dateStr, timeStr) : null);

  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  let dtstart: string;
  let dtend: string;

  if (hasTime && timeStr) {
    dtstart = `DTSTART;TZID=Europe/Rome:${formatICalDate(dateStr, timeStr)}00`;
    dtend = `DTEND;TZID=Europe/Rome:${formatICalDate(dateStr, endTimeStr)}00`;
  } else {
    dtstart = `DTSTART;VALUE=DATE:${formatICalDate(dateStr, null)}`;
    dtend = `DTEND;VALUE=DATE:${formatICalDate(dateStr, null)}`;
  }

  const description = [
    apt.description || "",
    "",
    `crm_appointment_id=${apt.id}`,
    `crm_sync=true`,
    `crm_last_update=${new Date().toISOString()}`,
  ].join("\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Edilizia in Cloud//IT",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    dtstart,
    dtend,
    `SUMMARY:${(apt.title || "Appuntamento").replace(/\n/g, "\\n")}`,
    `DESCRIPTION:${description}`,
    ...(apt.formatted_address ? [`LOCATION:${apt.formatted_address.replace(/\n/g, "\\n")}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

// ---- Get connection + credentials ----
async function getConnectionWithCredentials(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  companyId: string
): Promise<{ conn: any; appleId: string; appPassword: string } | null> {
  const { data: conn } = await admin
    .from("apple_calendar_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("status", "connected")
    .maybeSingle();

  if (!conn) return null;

  const encKey = getEncryptionKey();
  try {
    const appPassword = await decrypt(conn.app_password_encrypted, encKey);
    return { conn, appleId: conn.apple_id_email, appPassword };
  } catch {
    return null;
  }
}

async function getCredentialsByConnectionId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  connectionId: string,
  companyId: string,
): Promise<{ conn: any; appleId: string; appPassword: string } | null> {
  const { data: conn } = await admin
    .from("apple_calendar_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("company_id", companyId)
    .eq("status", "connected")
    .maybeSingle();
  if (!conn) return null;
  try {
    const appPassword = await decrypt(conn.app_password_encrypted, getEncryptionKey());
    return { conn, appleId: conn.apple_id_email, appPassword };
  } catch {
    return null;
  }
}

// Dove va l'appuntamento e con l'account di chi. Il calendario di marketing
// puo' essere agganciato a un calendario Apple preciso (passo 3): fino al
// 09/09/2026 quella scelta si salvava e poi non la leggeva nessuno, l'evento
// finiva sempre sul calendario principale del responsabile.
async function risolviBersaglio(
  admin: ReturnType<typeof getSupabaseAdmin>,
  apt: { calendar_id?: string | null; assigned_to?: string | null },
  fallbackUserId: string,
  companyId: string,
): Promise<{ ok: true; creds: { conn: any; appleId: string; appPassword: string }; userId: string; calendarUrl: string } | { ok: false; errore: string; status: number }> {
  if (apt.calendar_id) {
    const { data: cal } = await admin
      .from("marketing_calendars")
      .select("id, name, external_provider, external_connection_id, external_calendar_id")
      .eq("id", apt.calendar_id)
      .maybeSingle();
    const c = cal as { name?: string; external_provider?: string | null; external_connection_id?: string | null; external_calendar_id?: string | null } | null;
    if (c?.external_provider === "apple" && c.external_connection_id && c.external_calendar_id) {
      const creds = await getCredentialsByConnectionId(admin, c.external_connection_id, companyId);
      if (!creds) {
        return { ok: false, status: 404, errore: `L'account Apple agganciato al calendario "${c.name ?? ""}" non e' disponibile: ricollegalo o scegline un altro.` };
      }
      return { ok: true, creds, userId: creds.conn.user_id, calendarUrl: c.external_calendar_id };
    }
  }
  const userId = await resolveEffectiveUserId(admin, apt, fallbackUserId);
  const creds = await getConnectionWithCredentials(admin, userId, companyId);
  if (!creds) {
    return { ok: false, status: 404, errore: userId !== fallbackUserId ? `Il responsabile (${userId}) non ha collegato Apple Calendar` : "Apple Calendar non connesso" };
  }
  const { data: settings } = await admin
    .from("apple_calendar_settings")
    .select("primary_calendar_url")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings?.primary_calendar_url) return { ok: false, status: 400, errore: "Nessun calendario principale configurato" };
  return { ok: true, creds, userId, calendarUrl: settings.primary_calendar_url };
}

// ---- OWNER EFFETTIVO ----
// 2026-08-18: allineato al comportamento di google-calendar-sync. Chi fissa
// l'appuntamento spesso NON e' chi lo esegue (il call center prenota per il
// commerciale): l'evento va sul calendario del RESPONSABILE, non su quello di
// chi ha cliccato. Senza questa risoluzione, un appuntamento creato dallo
// staff per un collega non trovava nessuna connessione e finiva in 404.
async function resolveEffectiveUserId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  apt: { calendar_id?: string | null; assigned_to?: string | null },
  fallbackUserId: string,
): Promise<string> {
  if (apt.calendar_id) {
    const { data: cal } = await admin
      .from("marketing_calendars")
      .select("owner_id")
      .eq("id", apt.calendar_id)
      .maybeSingle();
    const ownerId = (cal as { owner_id?: string } | null)?.owner_id;
    if (ownerId) return ownerId;
  }
  if (apt.assigned_to) return apt.assigned_to;
  return fallbackUserId;
}

// ---- PUSH EVENT ----
async function pushEvent(userId: string, companyId: string, appointmentId: string): Promise<Response> {
  const admin = getSupabaseAdmin();

  // L'appuntamento si legge PRIMA della connessione: serve a sapere di CHI e'
  // il calendario di destinazione (owner del marketing calendar o assegnatario).
  const { data: apt } = await admin
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();
  if (!apt) return json({ error: "Appuntamento non trovato" }, 404);

  const esito = await risolviBersaglio(admin, apt, userId, companyId);
  if (!esito.ok) return json({ error: esito.errore }, esito.status);
  const { creds, userId: effectiveUserId, calendarUrl } = esito;

  // Un appuntamento ha UN evento, a prescindere da chi lo ha creato.
  const { data: existing } = await admin
    .from("apple_calendar_event_map")
    .select("id")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (existing) return json({ error: "Già sincronizzato", mappingId: existing.id }, 409);

  const uid = `apt-${apt.id}@ediliziacloud`;
  const icsData = buildICalendar(apt);
  const eventUrl = calendarUrl.replace(/\/$/, "") + `/${uid}.ics`;

  const res = await caldavRequest(
    eventUrl,
    "PUT",
    creds.appleId,
    creds.appPassword,
    icsData,
    { "Content-Type": "text/calendar; charset=utf-8" }
  );

  if (!res.ok && res.status !== 201 && res.status !== 204) {
    const errText = await res.text();
    console.error("Apple push event failed:", res.status, errText);
    return json({ error: `Errore CalDAV: ${res.status}` }, 502);
  }

  const etag = res.headers.get("ETag") || null;

  await admin.from("apple_calendar_event_map").insert({
    company_id: companyId,
    // owner effettivo, non chi ha cliccato: altrimenti update/delete
    // successivi non ritroverebbero la mappatura.
    user_id: effectiveUserId,
    appointment_id: appointmentId,
    caldav_event_url: eventUrl,
    caldav_uid: uid,
    caldav_calendar_url: calendarUrl,
    source: "crm",
    etag,
    last_synced_at: new Date().toISOString(),
    last_updated_by: "crm",
  });

  return json({ success: true, eventUrl });
}

// ---- UPDATE EVENT ----
async function updateEvent(userId: string, companyId: string, appointmentId: string): Promise<Response> {
  const admin = getSupabaseAdmin();

  // L'evento sta sull'account che lo ha creato: lo dice la mappa, non chi
  // sta cliccando adesso ne' il responsabile del calendario.
  const { data: mapping } = await admin
    .from("apple_calendar_event_map")
    .select("*")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  const effectiveUserId: string = mapping?.user_id ?? userId;
  const creds = await getConnectionWithCredentials(admin, effectiveUserId, companyId);
  if (!creds) return json({ error: "Apple Calendar non connesso" }, 404);
  if (!mapping) return json({ error: "Nessuna mappatura trovata, usa push-event" }, 404);

  const { data: apt } = await admin
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();
  if (!apt) return json({ error: "Appuntamento non trovato" }, 404);

  const icsData = buildICalendar(apt);

  const res = await caldavRequest(
    mapping.caldav_event_url,
    "PUT",
    creds.appleId,
    creds.appPassword,
    icsData,
    { "Content-Type": "text/calendar; charset=utf-8" }
  );

  if (!res.ok && res.status !== 201 && res.status !== 204) {
    const errText = await res.text();
    console.error("Apple update event failed:", res.status, errText);
    return json({ error: `Errore CalDAV: ${res.status}` }, 502);
  }

  const etag = res.headers.get("ETag") || null;

  await admin
    .from("apple_calendar_event_map")
    .update({
      etag,
      last_synced_at: new Date().toISOString(),
      last_updated_by: "crm",
      updated_at: new Date().toISOString(),
    })
    .eq("id", mapping.id);

  return json({ success: true });
}

// ---- DELETE EVENT ----
async function deleteEvent(userId: string, companyId: string, appointmentId: string): Promise<Response> {
  const admin = getSupabaseAdmin();

  // L'evento sta sull'account che lo ha creato: lo dice la mappa, non chi
  // sta cliccando adesso ne' il responsabile del calendario.
  const { data: mapping } = await admin
    .from("apple_calendar_event_map")
    .select("*")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  const effectiveUserId: string = mapping?.user_id ?? userId;
  const creds = await getConnectionWithCredentials(admin, effectiveUserId, companyId);
  if (!creds) return json({ error: "Apple Calendar non connesso" }, 404);
  if (!mapping) return json({ success: true, message: "Nessuna mappatura trovata" });

  try {
    const res = await caldavRequest(
      mapping.caldav_event_url,
      "DELETE",
      creds.appleId,
      creds.appPassword
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.error("Apple delete event failed:", res.status);
    }
  } catch (e) {
    console.error("Apple delete event error:", e);
  }

  await admin.from("apple_calendar_event_map").delete().eq("id", mapping.id);
  return json({ success: true });
}

// ---- PULL BUSY SLOTS ----
async function pullBusySlots(userId: string, companyId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  const creds = await getConnectionWithCredentials(admin, userId, companyId);
  if (!creds) return json({ error: "Apple Calendar non connesso" }, 404);

  const { data: settings } = await admin
    .from("apple_calendar_settings")
    .select("conflict_calendar_urls, primary_calendar_url, block_busy_slots")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  // Gather calendar URLs to pull from
  const calUrls: string[] = [];
  if (settings?.primary_calendar_url) calUrls.push(settings.primary_calendar_url);
  if (settings?.conflict_calendar_urls?.length) {
    for (const u of settings.conflict_calendar_urls) {
      if (!calUrls.includes(u)) calUrls.push(u);
    }
  }
  // Calendari agganciati ai calendari di marketing su questa connessione: un
  // impegno messo direttamente li' deve bloccare gli orari come gli altri.
  const { data: agganciati } = await admin
    .from("marketing_calendars")
    .select("external_calendar_id")
    .eq("external_connection_id", creds.conn.id)
    .eq("external_provider", "apple")
    .eq("is_active", true);
  for (const a of (agganciati ?? []) as Array<{ external_calendar_id: string | null }>) {
    if (a.external_calendar_id && !calUrls.includes(a.external_calendar_id)) calUrls.push(a.external_calendar_id);
  }

  if (calUrls.length === 0) {
    return json({ pulled: 0, message: "Nessun calendario configurato" });
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // Format for CalDAV: 20260101T000000Z
  const formatCalDAVDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const reportBody = `<?xml version='1.0' encoding='UTF-8'?>
<c:calendar-query xmlns:d='DAV:' xmlns:c='urn:ietf:params:xml:ns:caldav'>
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name='VCALENDAR'>
      <c:comp-filter name='VEVENT'>
        <c:time-range start='${formatCalDAVDate(timeMin)}' end='${formatCalDAVDate(timeMax)}'/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  let totalPulled = 0;
  const allUids: string[] = [];

  for (const calUrl of calUrls) {
    try {
      const res = await caldavRequest(
        calUrl,
        "REPORT",
        creds.appleId,
        creds.appPassword,
        reportBody,
        { "Depth": "1" }
      );

      if (!res.ok) {
        console.error(`Apple REPORT failed for ${calUrl}:`, res.status);
        continue;
      }

      const text = await res.text();
      const responses = text.split(/<[dD]:response>/i).slice(1);

      for (const resp of responses) {
        const calDataMatch = resp.match(/<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/i);
        if (!calDataMatch) continue;

        const icsText = calDataMatch[1];

        // Parse VEVENT
        const veventMatch = icsText.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i);
        if (!veventMatch) continue;

        const vevent = veventMatch[1];
        const uidMatch = vevent.match(/^UID:(.+)$/im);
        const summaryMatch = vevent.match(/^SUMMARY:(.+)$/im);
        const dtstartMatch = vevent.match(/^DTSTART[^:]*:(.+)$/im);
        const dtendMatch = vevent.match(/^DTEND[^:]*:(.+)$/im);

        if (!uidMatch || !dtstartMatch) continue;

        const uid = uidMatch[1].trim();
        const summary = summaryMatch?.[1]?.trim() || null;
        const dtstartRaw = dtstartMatch[1].trim();
        const dtendRaw = dtendMatch?.[1]?.trim() || dtstartRaw;

        // Skip CRM-originated events
        if (icsText.includes("crm_sync=true")) continue;

        const isAllDay = dtstartRaw.length === 8; // YYYYMMDD

        const parseCalDate = (raw: string): string => {
          if (raw.length === 8) {
            // Date-only: YYYYMMDD
            return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00Z`;
          }
          // DateTime: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
          const d = raw.slice(0, 8);
          const t = raw.slice(9, 15);
          const isUtc = raw.endsWith("Z");
          return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}${isUtc ? "Z" : ""}`;
        };

        const startAt = parseCalDate(dtstartRaw);
        const endAt = parseCalDate(dtendRaw);

        allUids.push(uid);

        await admin.from("apple_calendar_busy_slots").upsert(
          {
            company_id: companyId,
            user_id: userId,
            caldav_uid: uid,
            caldav_calendar_url: calUrl,
            start_at: startAt,
            end_at: endAt,
            summary,
            is_all_day: isAllDay,
          },
          { onConflict: "company_id,user_id,caldav_uid" }
        );

        totalPulled++;
      }
    } catch (e) {
      console.error(`Error pulling Apple calendar ${calUrl}:`, e);
    }
  }

  // Clean stale slots
  if (allUids.length > 0) {
    const { data: existingSlots } = await admin
      .from("apple_calendar_busy_slots")
      .select("id, caldav_uid")
      .eq("company_id", companyId)
      .eq("user_id", userId);

    const staleIds = (existingSlots || [])
      .filter((s: any) => s.caldav_uid && !allUids.includes(s.caldav_uid))
      .map((s: any) => s.id);

    if (staleIds.length > 0) {
      await admin.from("apple_calendar_busy_slots").delete().in("id", staleIds);
    }
  } else {
    // No events found → clear all
    await admin
      .from("apple_calendar_busy_slots")
      .delete()
      .eq("company_id", companyId)
      .eq("user_id", userId);
  }

  // Update last_sync_at
  await admin
    .from("apple_calendar_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("user_id", userId);

  return json({ pulled: totalPulled });
}

// ---- FULL SYNC ----
async function fullSync(userId: string, companyId: string): Promise<Response> {
  const pullRes = await pullBusySlots(userId, companyId);
  const pullData = await pullRes.json();
  return json({ ...pullData, action: "full-sync" });
}

// ---- CRON FULL SYNC ----
async function cronFullSync(): Promise<Response> {
  const admin = getSupabaseAdmin();

  const { data: connections, error } = await admin
    .from("apple_calendar_connections")
    .select("user_id, company_id")
    .eq("status", "connected");

  if (error) {
    console.error("cronFullSync: failed to fetch connections", error);
    return json({ error: "Failed to fetch connections" }, 500);
  }

  const total = connections?.length ?? 0;
  if (total === 0) return json({ synced: 0, message: "No active connections" });

  let synced = 0;
  let failed = 0;
  const results: any[] = [];

  for (const conn of connections!) {
    try {
      const pullRes = await pullBusySlots(conn.user_id, conn.company_id);
      const pullData = await pullRes.json();
      results.push({ userId: conn.user_id, companyId: conn.company_id, pull: pullData, status: "ok" });
      synced++;
    } catch (e: any) {
      console.error(`cronFullSync: error for user=${conn.user_id}`, e);
      results.push({ userId: conn.user_id, companyId: conn.company_id, status: "error", error: e.message });
      failed++;
    }
  }

  console.log(`Apple cronFullSync: completed. Synced ${synced}, failed ${failed}.`);
  return json({ synced, failed, total, results });
}

// ---- MAIN ----
serveConMetriche("apple-calendar-sync", async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Chiamate interne (trigger di cancellazione via pg_net): x-cron-secret,
    // come google-calendar-sync. L'utente, se manca, e' il responsabile.
    if (!req.headers.get("Authorization") && cronSecretValido(req)) {
      const interno = await req.json();
      if (!["push-event", "update-event", "delete-event"].includes(interno.action)) return json({ error: "Unknown internal action" }, 400);
      if (!interno.appointmentId || !interno.companyId) return json({ error: "appointmentId e companyId richiesti" }, 400);
      let uid: string | null = interno.userId ?? null;
      if (!uid) {
        const { data: a } = await getSupabaseAdmin().from("appointments").select("assigned_to, created_by").eq("id", interno.appointmentId).maybeSingle();
        const riga = a as { assigned_to?: string | null; created_by?: string | null } | null;
        uid = riga?.assigned_to ?? riga?.created_by ?? null;
      }
      if (!uid) return json({ error: "utente non determinabile" }, 400);
      if (interno.action === "push-event") return pushEvent(uid, interno.companyId, interno.appointmentId);
      if (interno.action === "update-event") return updateEvent(uid, interno.companyId, interno.appointmentId);
      return deleteEvent(uid, interno.companyId, interno.appointmentId);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { action } = body;

    // Cron full-sync: serve la service_role o il segreto dei cron.
    //
    // Prima era accettata anche la chiave ANON, che non e' un segreto: sta
    // dentro il bundle del sito ed e' leggibile da chiunque apra il browser.
    // Bastava quella per far partire la sincronizzazione di tutti i calendari.
    if (action === "cron-full-sync") {
      const token = authHeader.replace("Bearer ", "");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      if (token !== serviceRoleKey && !cronSecretValido(req)) {
        return json({ error: "Unauthorized for cron" }, 403);
      }
      return cronFullSync();
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let userId: string;
    const { companyId, appointmentId } = body;

    if (token === serviceRoleKey) {
      userId = body.userId;
      if (!userId) return json({ error: "userId required for service calls" }, 400);
    } else {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: claimsErr } = await supabaseClient.auth.getUser(token);
      if (claimsErr || !user) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
    }

    if (!companyId) return json({ error: "companyId required" }, 400);

    // Security: validate companyId (skip for service_role calls)
    if (token !== serviceRoleKey) {
      const admin = getSupabaseAdmin();
      const { data: profile } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();
      if (!profile || profile.company_id !== companyId) {
        return json({ error: "Company mismatch" }, 403);
      }
    }

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
        return json({ error: `Azione sconosciuta: ${action}` }, 400);
    }
  } catch (e: any) {
    console.error("apple-calendar-sync error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
