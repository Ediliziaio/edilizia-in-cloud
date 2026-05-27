import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";
import { getCorsHeaders, jsonResponse as json } from "../_shared/headers.ts";
// P2-5 nota: questo file usa già AbortSignal.timeout(15000) su tutti i fetch
// (pattern nativo equivalente a fetchWithTimeout). Nessuna modifica necessaria.

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const [profileRes, rolesRes] = await Promise.all([
    admin.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if ((rolesRes.data ?? []).some((row: { role?: string }) => row.role === "super_admin")) {
    return true;
  }

  return profileRes.data?.company_id === companyId;
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
    // 2026-05-27 (BUG CRITICO): mancava `await` → ritornava Promise<string>
    // anziché stringa. La Promise srotolata dal caller diventava il valore,
    // MA poi finiva in `Authorization: Bearer [object Promise]` → 401 da
    // Google API. Niente sync funzionava da settimane.
    return await decrypt(conn.access_token_encrypted, encKey);
  }

  // Need refresh
  if (!conn.refresh_token_encrypted) return null;

  const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_calendar_client_secret", "GOOGLE_CALENDAR_CLIENT_SECRET");
  // 2026-05-27 (BUG CRITICO #2): stesso problema sul refresh — mancava await.
  // URLSearchParams.refresh_token=[object Promise] → Google API 400
  // "invalid_grant" → connessione marcata "token_expired" anche se il vero
  // refresh_token era valido. Re-connect inutile, si rimarcava expired.
  const refreshToken = await decrypt(conn.refresh_token_encrypted, encKey);

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
    const errorBody = await tokenRes.text().catch(() => "unknown");
    await admin
      .from("google_calendar_connections")
      .update({ status: "token_expired", last_error: `Refresh token failed: ${errorBody.substring(0, 200)}` })
      .eq("id", conn.id);
    return null;
  }

  const tokens = await tokenRes.json();
  const newAccessToken = tokens.access_token;
  // 2026-05-27 (BUG CRITICO #3): encrypt è async, anche qui mancava await.
  // Risultato: nel DB veniva scritto "[object Promise]" come access_token_encrypted,
  // distruggendo la persistenza del nuovo token e forzando refresh ad ogni call.
  const newAccessTokenEncrypted = await encrypt(newAccessToken, encKey);
  await admin
    .from("google_calendar_connections")
    .update({
      access_token_encrypted: newAccessTokenEncrypted,
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
  // 2026-05-27 (FIX CRITICO UX): prima leggeva SOLO conflict_calendar_ids.
  // Se l'utente non aveva esplicitamente aggiunto calendari ai "conflict"
  // (default vuoto post-OAuth), la sync ritornava 0 senza importare nulla.
  // Risultato: l'utente cliccava "Sincronizza ora", vedeva "Sync OK" ma
  // il calendario CRM restava vuoto perché il SUO calendario primary
  // non veniva mai pollato.
  // ORA: include SEMPRE il primary_calendar_id come default + eventuali
  // conflict_calendar_ids per multi-calendar setup.
  const calendarIdSet = new Set<string>();
  if (settings?.primary_calendar_id) calendarIdSet.add(settings.primary_calendar_id);
  (settings?.conflict_calendar_ids || []).forEach((id: string) => {
    if (id) calendarIdSet.add(id);
  });
  const calendarIds = Array.from(calendarIdSet);
  if (calendarIds.length === 0) {
    return json({ pulled: 0, message: "No calendars configured (né primary né conflict)" });
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
      .select("id, google_event_id, google_calendar_id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .in("google_calendar_id", calendarIds);

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

/**
 * 2026-05-27 (richiesta utente "il calendario marketing è del responsabile"):
 * helper che risolve l'utente effettivo a cui pushare l'evento.
 *
 * Flusso:
 *   1. Se l'appointment ha calendar_id → recupera marketing_calendars.owner_id
 *      → push verso il Google Calendar di QUEL utente (responsabile).
 *   2. Fallback: appointment.assigned_to (chi è stato assegnato in CRM).
 *   3. Fallback finale: userId del caller.
 *
 * Esempio: admin crea appointment per il calendar di Mario (venditore) →
 * l'evento appare nel Google Calendar di Mario, non dell'admin.
 */
async function resolveEffectiveUserId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  apt: { calendar_id?: string | null; assigned_to?: string | null },
  fallbackUserId: string,
): Promise<string> {
  if (apt.calendar_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Fetch appointment PRIMA della connessione: serve per risolvere owner_id
  // del calendar marketing → Google Calendar di quel responsabile.
  const { data: apt } = await admin
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();
  if (!apt) return json({ error: "Appointment not found" }, 404);

  const effectiveUserId = await resolveEffectiveUserId(admin, apt, userId);

  const conn = await getConnection(admin, effectiveUserId, companyId);
  if (!conn) {
    return json({
      error: effectiveUserId !== userId
        ? `Responsabile (${effectiveUserId}) non ha collegato Google Calendar`
        : "Not connected",
    }, 404);
  }

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return json({ error: "Token expired" }, 401);

  const settings = await getSettings(admin, effectiveUserId, companyId);
  if (!settings?.primary_calendar_id) return json({ error: "No primary calendar configured" }, 400);

  const { data: existing } = await admin
    .from("google_calendar_event_map")
    .select("id")
    .eq("appointment_id", appointmentId)
    .eq("user_id", effectiveUserId)
    .maybeSingle();
  if (existing) return json({ error: "Already synced", mappingId: existing.id }, 409);

  const meetRequested = shouldUseGoogleMeet(apt);
  const googleEvent = buildGoogleEvent(apt, { createMeet: meetRequested && !apt.meeting_url });

  const res = await fetch(
    buildGoogleEventUrl(settings.primary_calendar_id, undefined, meetRequested),
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
    console.error("Push event failed:", res.status, errText);
    if (res.status === 401 || res.status === 403) {
      await admin.from("google_calendar_connections").update({ status: "token_expired" }).eq("id", conn.id);
    }
    // 2026-05-27: ritorniamo dettagli (status Google + truncated body)
    // così il frontend può mostrarli nel toast invece di "non-2xx generic".
    return json({
      error: "Failed to create Google event",
      googleStatus: res.status,
      googleError: errText.substring(0, 300),
    }, 502);
  }

  const created = await res.json();
  const meetUrl = await persistMeetDetails(admin, appointmentId, created, meetRequested);

  await admin.from("google_calendar_event_map").insert({
    company_id: companyId,
    user_id: effectiveUserId,
    appointment_id: appointmentId,
    google_event_id: created.id,
    google_calendar_id: settings.primary_calendar_id,
    etag: created.etag || null,
    source: "crm",
    last_synced_at: new Date().toISOString(),
    last_updated_by: "crm",
    last_sync_source: "crm",
    last_sync_at: new Date().toISOString(),
  });

  // Marca la connessione: ultimo push viene dal CRM.
  // Serve al webhook per ignorare l'echo che Google rispedirà entro 15s.
  await admin
    .from("google_calendar_connections")
    .update({
      last_sync_source: "crm",
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return json({ success: true, googleEventId: created.id, meetingUrl: meetUrl });
}

// ---- UPDATE EVENT ----
async function updateEvent(userId: string, companyId: string, appointmentId: string): Promise<Response> {
  const admin = getSupabaseAdmin();
  // 2026-05-27: resolve owner del calendar marketing per update/delete
  const { data: aptForOwner } = await admin
    .from("appointments")
    .select("calendar_id, assigned_to")
    .eq("id", appointmentId)
    .maybeSingle();
  const effectiveUserId = aptForOwner
    ? await resolveEffectiveUserId(admin, aptForOwner, userId)
    : userId;

  const conn = await getConnection(admin, effectiveUserId, companyId);
  if (!conn) return json({ error: "Not connected" }, 404);

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return json({ error: "Token expired" }, 401);

  const { data: mapping } = await admin
    .from("google_calendar_event_map")
    .select("*")
    .eq("appointment_id", appointmentId)
    .eq("user_id", effectiveUserId)
    .maybeSingle();
  if (!mapping) return json({ error: "No mapping found, use push-event" }, 404);

  const { data: apt } = await admin
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();
  if (!apt) return json({ error: "Appointment not found" }, 404);

  const meetRequested = shouldUseGoogleMeet(apt);
  const googleEvent = buildGoogleEvent(apt, { createMeet: meetRequested && !apt.meeting_url });

  const res = await fetch(
    buildGoogleEventUrl(mapping.google_calendar_id!, mapping.google_event_id, meetRequested),
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
    console.error("Update event failed:", res.status, errText);
    return json({
      error: "Failed to update Google event",
      googleStatus: res.status,
      googleError: errText.substring(0, 300),
    }, 502);
  }

  const updated = await res.json();
  const meetUrl = await persistMeetDetails(admin, appointmentId, updated, meetRequested);
  await admin
    .from("google_calendar_event_map")
    .update({
      etag: updated.etag || null,
      last_synced_at: new Date().toISOString(),
      last_updated_by: "crm",
      last_sync_source: "crm",
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", mapping.id);

  // Loop prevention: segna che questo update viene dal CRM
  await admin
    .from("google_calendar_connections")
    .update({
      last_sync_source: "crm",
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return json({ success: true, meetingUrl: meetUrl });
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
          meeting_provider: fields.meetingProvider,
          meeting_url: fields.meetingUrl,
          meeting_status: fields.meetingStatus,
          meeting_created_at: fields.meetingUrl ? new Date().toISOString() : null,
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
      // B12 Fix: only import events with [CRM] prefix unless import_all_google_events is enabled
      const importAll = (settings as any)?.import_all_google_events || false;
      const hasCrmPrefix = (gEvent.summary || "").startsWith("[CRM]");
      if (!importAll && !hasCrmPrefix) continue;

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
          appointment_type: fields.meetingProvider === "google_meet" ? "videocall" : "altro",
          status: "confermato",
          is_completed: false,
          is_blocked_slot: false,
          meeting_provider: fields.meetingProvider,
          meeting_url: fields.meetingUrl,
          meeting_status: fields.meetingStatus,
          meeting_created_at: fields.meetingUrl ? new Date().toISOString() : null,
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

/**
 * 2026-05-27 (cleanup duplicati): scansiona gli eventi Google del primary
 * calendar che hanno `crm_appointment_id=X` in description. Per ogni X,
 * trova in `google_calendar_event_map` il mapping CORRETTO (il primo
 * inserito) e CANCELLA da Google tutti gli altri eventi con stesso
 * appointment_id ma google_event_id diverso.
 *
 * Necessario per pulire i duplicati causati dal bug pre-fix dove
 * trigger pg_net + frontend creavano in parallelo più eventi Google
 * per lo stesso appuntamento CRM.
 *
 * Idempotente: se non ci sono duplicati ritorna { cleaned: 0 }.
 */
async function cleanupCrmDuplicates(userId: string, companyId: string): Promise<{ cleaned: number }> {
  const admin = getSupabaseAdmin();
  const conn = await getConnection(admin, userId, companyId);
  if (!conn) return { cleaned: 0 };

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return { cleaned: 0 };

  const settings = await getSettings(admin, userId, companyId);
  const calId = settings?.primary_calendar_id;
  if (!calId) return { cleaned: 0 };

  // Lista eventi Google nella finestra utile
  const now = new Date();
  const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    maxResults: "500",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) return { cleaned: 0 };
  const data = await res.json();
  const items: any[] = data.items || [];

  // Raggruppa eventi CRM-originated per crm_appointment_id
  const groups = new Map<string, any[]>();
  for (const e of items) {
    if (e.status === "cancelled") continue;
    const desc = e.description || "";
    const m = desc.match(/crm_appointment_id=([0-9a-f-]{36})/i);
    if (!m) continue;
    const aptId = m[1];
    if (!groups.has(aptId)) groups.set(aptId, []);
    groups.get(aptId)!.push(e);
  }

  let cleaned = 0;
  for (const [aptId, events] of groups.entries()) {
    if (events.length <= 1) continue;

    // Trova il mapping CRM ufficiale per quell'appointment
    const { data: mapping } = await admin
      .from("google_calendar_event_map")
      .select("google_event_id")
      .eq("appointment_id", aptId)
      .eq("user_id", userId)
      .maybeSingle();

    const officialId = mapping?.google_event_id ?? events[0].id; // fallback: tieni il primo

    // Cancella da Google tutti gli altri
    for (const e of events) {
      if (e.id === officialId) continue;
      try {
        const delRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(e.id)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(15000),
          }
        );
        if (delRes.ok || delRes.status === 404 || delRes.status === 410) {
          // anche se 404/410 (già gone), pulisco i busy_slots locali
          await admin
            .from("google_calendar_busy_slots")
            .delete()
            .eq("company_id", companyId)
            .eq("user_id", userId)
            .eq("google_event_id", e.id);
          cleaned++;
        } else {
          console.warn(`cleanupCrmDuplicates: delete failed for ${e.id} status=${delRes.status}`);
        }
      } catch (err) {
        console.warn(`cleanupCrmDuplicates: error deleting ${e.id}`, err);
      }
    }
  }

  return { cleaned };
}

// ---- FULL SYNC ----
async function fullSync(userId: string, companyId: string): Promise<Response> {
  // 2026-05-27: prima del pull, pulisci duplicati CRM creati dal bug
  // pre-fix (trigger + frontend in race). Idempotente: 0 cleaned se OK.
  const dupResult = await cleanupCrmDuplicates(userId, companyId);

  const pullRes = await pullBusySlots(userId, companyId);
  const pullData = await pullRes.json();

  // Run two-way reconciliation if enabled
  const reconcileResult = await reconcilePrimary(userId, companyId);

  return json({
    ...pullData,
    reconcile: reconcileResult,
    duplicatesCleaned: dupResult.cleaned,
    action: "full-sync",
  });
}

// ---- HELPERS ----
function buildGoogleEventUrl(calendarId: string, eventId?: string, withConference = false): string {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
  if (!withConference) return base;
  return `${base}?${new URLSearchParams({ conferenceDataVersion: "1" })}`;
}

function shouldUseGoogleMeet(apt: any): boolean {
  return apt?.meeting_provider === "google_meet" || apt?.appointment_type === "videocall";
}

function extractMeetUrl(gEvent: any): string | null {
  if (typeof gEvent?.hangoutLink === "string" && gEvent.hangoutLink) return gEvent.hangoutLink;
  const videoEntry = (gEvent?.conferenceData?.entryPoints || []).find((entry: any) =>
    entry?.entryPointType === "video" && typeof entry?.uri === "string"
  );
  return videoEntry?.uri || null;
}

async function persistMeetDetails(
  admin: ReturnType<typeof getSupabaseAdmin>,
  appointmentId: string,
  gEvent: any,
  meetRequested: boolean
): Promise<string | null> {
  const meetUrl = extractMeetUrl(gEvent);
  if (!meetRequested && !meetUrl) return null;

  const patch = meetUrl
    ? {
        meeting_provider: "google_meet",
        meeting_url: meetUrl,
        meeting_status: "ready",
        meeting_created_at: new Date().toISOString(),
      }
    : {
        meeting_provider: "google_meet",
        meeting_status: "pending",
      };

  const { error } = await admin.from("appointments").update(patch).eq("id", appointmentId);
  if (error) {
    console.error("persistMeetDetails: failed to update appointment", error);
  }
  return meetUrl;
}

/**
 * 2026-05-27 (BUG CRITICO TROVATO): normalizza un valore postgres `time without
 * time zone` (es. "09:00:00" o "09:00:00.000") a "HH:MM:SS" pulito.
 *
 * Era il bug "Errore sincronizzazione Google" che vedeva l'utente quando
 * creava un appuntamento dal CRM. Prima:
 *   `${dateStr}T${apt.appointment_time}:00` → "2026-05-29T09:00:00:00"
 *                                                              ^^^^^^
 *                                                              non-iso, 400 da Google
 *
 * Postgres restituisce "HH:MM:SS" (con secondi) e il codice presumeva
 * "HH:MM" e gli appendeva ":00". Doppio segmento secondi → invalido.
 */
function normalizeTime(t: string): string {
  if (!t) return "00:00:00";
  const cleaned = t.split(".")[0]; // drop ms se presenti
  const parts = cleaned.split(":");
  if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
  if (parts.length >= 3) return `${parts[0]}:${parts[1]}:${parts[2]}`;
  return "00:00:00";
}

function buildGoogleEvent(apt: any, options: { createMeet?: boolean } = {}) {
  const hasTime = !!apt.appointment_time;
  const dateStr = apt.appointment_date;

  let start: any;
  let end: any;

  if (hasTime) {
    const startTimeNorm = normalizeTime(apt.appointment_time);
    const startDateTime = `${dateStr}T${startTimeNorm}`;
    const endTime = apt.appointment_end_time
      ? `${dateStr}T${normalizeTime(apt.appointment_end_time)}`
      : addHour(startDateTime);
    start = { dateTime: startDateTime, timeZone: "Europe/Rome" };
    end = { dateTime: endTime, timeZone: "Europe/Rome" };
  } else {
    start = { date: dateStr };
    end = { date: dateStr };
  }

  const description = [
    apt.description || "",
    shouldUseGoogleMeet(apt) ? "\nVideochiamata: Google Meet" : "",
    apt.meeting_url ? `Link Meet: ${apt.meeting_url}` : "",
    "",
    `crm_appointment_id=${apt.id}`,
    `crm_sync=true`,
    `crm_last_update=${new Date().toISOString()}`,
  ].join("\n");

  const event: Record<string, unknown> = {
    summary: apt.title,
    description,
    start,
    end,
    ...(apt.formatted_address ? { location: apt.formatted_address } : {}),
  };

  if (options.createMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: `eic-${apt.id}-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  return event;
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
  meetingProvider: "none" | "google_meet";
  meetingUrl: string | null;
  meetingStatus: "none" | "ready";
} {
  const title = gEvent.summary || null;
  const location = gEvent.location || null;
  const meetingUrl = extractMeetUrl(gEvent);
  const meetingProvider = meetingUrl ? "google_meet" : "none";
  const meetingStatus = meetingUrl ? "ready" : "none";

  // Strip CRM metadata from description
  let description = gEvent.description || "";
  description = description
    .replace(/crm_appointment_id=[0-9a-f-]{36}/gi, "")
    .replace(/crm_sync=true/gi, "")
    .replace(/crm_last_update=[^\n]*/gi, "")
    .replace(/Videochiamata:\s*Google Meet/gi, "")
    .replace(/Link Meet:\s*https?:\/\/[^\s]+/gi, "")
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

  return { title, date, time, endTime, description, location, meetingProvider, meetingUrl, meetingStatus };
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
    return new Response(null, { headers: getCorsHeaders(req) });
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

    // Service-role calls (from DB trigger): accept userId from body
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let userId: string;
    const { companyId, appointmentId } = body;

    if (token === serviceRoleKey) {
      // Called from PostgreSQL trigger via pg_net with service_role_key
      userId = body.userId;
      if (!userId) return json({ error: "userId required for service calls" }, 400);
    } else {
      // Standard authenticated user call
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: claimsErr } = await supabase.auth.getUser(token);
      if (claimsErr || !user) {
        return json({ error: "Unauthorized" }, 401);
      }
      userId = user.id;
    }

    if (!companyId) return json({ error: "companyId required" }, 400);

    // P0 Security: utenti aziendali solo sulla propria azienda; superadmin abiliti per il contesto piattaforma.
    if (token !== serviceRoleKey) {
      if (!(await verifyCompanyAccess(userId, companyId))) {
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
      case "reconcile": {
        const result = await reconcilePrimary(userId, companyId);
        return json({ success: true, reconcile: result });
      }
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("google-calendar-sync error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
