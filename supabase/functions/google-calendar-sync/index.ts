import { costruisciEventoPosa, leggiDateDaEventoGoogle, stesseDate } from "../_shared/posaEvento.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";
import { getCorsHeaders, jsonResponse as json } from "../_shared/headers.ts";
import { serveConMetriche } from "../_shared/withMetrics.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { puoGestireCalendari } from "../_shared/permessiCalendari.ts";
// P2-5 nota: questo file usa già AbortSignal.timeout(15000) su tutti i fetch
// (pattern nativo equivalente a fetchWithTimeout). Nessuna modifica necessaria.

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// Stessa regola di google-calendar-auth: chi collega il calendario in
// un'azienda secondaria (multi-azienda, commercialista, impersonation) deve
// poterlo anche sincronizzare. Prima valeva solo l'azienda del profilo: la
// connessione riusciva e ogni sincronizzazione rispondeva 403.
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  // deno-lint-ignore no-explicit-any
  return canAccessCompany(getSupabaseAdmin() as any, userId, companyId);
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
    // 2026-09-08: non tutti i rifiuti di Google sono definitivi. `invalid_grant`
    // (consenso revocato, refresh token morto) chiude davvero la connessione;
    // un 5xx o un "internal_failure" e' un intoppo loro di qualche minuto.
    // Prima si marcava `token_expired` in ogni caso, e siccome OGNI query di
    // questa funzione filtra `status = connected`, nessun cron riprovava mai
    // piu': due connessioni in produzione erano ferme da giugno e da agosto per
    // un singolo errore temporaneo.
    const permanente = /invalid_grant|invalid_client|unauthorized_client|invalid_request/i.test(errorBody);
    await admin
      .from("google_calendar_connections")
      .update({
        status: permanente ? "token_expired" : conn.status,
        last_error: `Refresh token failed: ${errorBody.substring(0, 200)}`,
      })
      .eq("id", conn.id);
    if (permanente) await avvisaConnessioneScaduta(admin, conn);
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

// Il calendario che smette di sincronizzare non si vede: gli appuntamenti
// semplicemente non arrivano piu'. L'unico segnale era una riga rossa dentro le
// impostazioni, che nessuno apre. Ora il titolare della connessione riceve un
// avviso in campanella, una volta a settimana finche' non ricollega.
async function avvisaConnessioneScaduta(
  admin: ReturnType<typeof getSupabaseAdmin>,
  conn: { id: string; user_id: string; company_id: string; google_account_email?: string | null },
) {
  try {
    const { data: recenti } = await admin
      .from("notifications")
      .select("id")
      .eq("entity_type", "google_calendar_connection")
      .eq("entity_id", conn.id)
      .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())
      .limit(1);
    if (recenti && recenti.length > 0) return;
    await admin.from("notifications").insert({
      company_id: conn.company_id,
      user_id: conn.user_id,
      type: "calendar_alert",
      title: "Google Calendar si e' scollegato",
      body: `${conn.google_account_email || "Il tuo account Google"} non autorizza piu' Edilizia in Cloud: gli appuntamenti non finiscono piu' sul tuo calendario. Ricollegalo da Impostazioni → Mio profilo → Calendari.`,
      entity_type: "google_calendar_connection",
      entity_id: conn.id,
      action_url: "/azienda/impostazioni/mio-profilo",
    });
  } catch (e) {
    console.error("[google-calendar-sync] avviso connessione scaduta:", e instanceof Error ? e.message : String(e));
  }
}

type DirezioneSync = "both" | "to_google" | "from_google";

// Le due schede che parlano di sincronizzazione (Mio profilo → Preferenze sync e
// Utenti → Calendari) scrivevano in due tabelle diverse, e per meta' delle voci
// non le leggeva nessuno: si sceglieva "Solo → Google" e il sistema continuava a
// fare quello che voleva. Ora la direzione ha un solo posto dove viene decisa.
async function preferenzeSync(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  companyId: string,
): Promise<{ attiva: boolean; direzione: DirezioneSync }> {
  const [prefRes, settings] = await Promise.all([
    admin
      .from("user_calendar_preferences")
      .select("sync_enabled, sync_direction")
      .eq("user_id", userId)
      .maybeSingle(),
    getSettings(admin, userId, companyId),
  ]);
  const pref = prefRes.data as { sync_enabled?: boolean | null; sync_direction?: string | null } | null;
  if (pref) {
    return {
      attiva: pref.sync_enabled !== false,
      direzione: (pref.sync_direction as DirezioneSync) || "both",
    };
  }
  // Senza preferenze utente vale la scheda del collegamento: "one_way" li' ha
  // sempre significato "EiC scrive su Google, Google non entra in EiC".
  return { attiva: true, direzione: settings?.sync_mode === "two_way" ? "both" : "to_google" };
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

// Per Google il calendario principale ha due nomi: la parola chiave "primary"
// e l'email dell'account. Le mappe vecchie usano la prima, il passo 3 salva la
// seconda: senza questo confronto lo stesso calendario verrebbe letto due
// volte e ogni appuntamento avrebbe due mappe.
function eIlPrincipale(id: string, primaryId: string | null | undefined, email: string | null | undefined): boolean {
  if (!primaryId) return false;
  const e = (email ?? "").toLowerCase();
  const norm = (x: string) => (e && x.toLowerCase() === e ? "primary" : x);
  return norm(id) === norm(primaryId);
}

/**
 * I calendari Google scelti al passo 3 dei calendari di marketing, per questa
 * connessione. Se uno di loro e' il principale, torna con il nome che usa
 * settings.primary_calendar_id, cosi' coincide con le mappe esistenti.
 */
async function calendariAgganciati(
  admin: ReturnType<typeof getSupabaseAdmin>,
  conn: { id: string; google_account_email?: string | null },
  primaryId: string | null | undefined,
): Promise<Array<{ calendarId: string; marketingCalendarId: string }>> {
  const { data } = await admin
    .from("marketing_calendars")
    .select("id, external_calendar_id")
    .eq("external_connection_id", conn.id)
    .eq("external_provider", "google")
    .eq("is_active", true);
  return ((data ?? []) as Array<{ id: string; external_calendar_id: string | null }>)
    .filter((c) => !!c.external_calendar_id)
    .map((c) => ({
      calendarId: primaryId && eIlPrincipale(c.external_calendar_id as string, primaryId, conn.google_account_email) ? primaryId : (c.external_calendar_id as string),
      marketingCalendarId: c.id,
    }));
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
  // Calendari di squadra collegati su questa connessione: i loro impegni
  // (ferie, altri lavori) servono alla disponibilità delle squadre.
  const { data: calSquadre } = await admin
    .from("external_teams")
    .select("google_calendar_id")
    .eq("google_connection_id", conn.id)
    .eq("google_sync_enabled", true);
  (calSquadre ?? []).forEach((t: any) => t.google_calendar_id && calendarIdSet.add(t.google_calendar_id));
  // Calendari agganciati ai calendari di marketing su questa connessione: se
  // il titolare fissa un impegno direttamente li', deve bloccare gli orari
  // della prenotazione pubblica come gli altri.
  (await calendariAgganciati(admin, conn, settings?.primary_calendar_id)).forEach((c) => calendarIdSet.add(c.calendarId));
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
        // Le pose le mettiamo noi: non sono «occupato» ma lavoro pianificato.
        if (event.extendedProperties?.private?.eic_kind === "posa") continue;

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
/**
 * Dove va scritto l'evento di questo appuntamento (08/09/2026).
 *
 * Prima la destinazione era una sola per utente: due calendari marketing con lo
 * stesso responsabile finivano per forza nello stesso calendario Google. Ora la
 * scelta sta sul calendario marketing (external_connection_id + calendar_id) e
 * `primary_calendar_id` resta solo come ripiego per chi non ha scelto niente.
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

// Dove va l'appuntamento e con l'account di chi.
//
// Un calendario di marketing puo' essere agganciato a un calendario preciso di
// un account preciso (Impostazioni → Calendari → passo 3). Fino al 09/09/2026
// si prendeva il calendario scelto ma il token del RESPONSABILE del calendario:
// se l'amministratore aveva scelto l'account di un collega, Google rispondeva
// 404 e l'appuntamento non arrivava da nessuna parte. Qui l'account e' quello
// dell'aggancio; il responsabile vale solo per chi non ha agganciato niente.
interface BersaglioAppuntamento {
  conn: any;
  userId: string;
  calendarId: string;
  marketingCalendarId: string | null;
}

async function risolviBersaglio(
  admin: ReturnType<typeof getSupabaseAdmin>,
  apt: { calendar_id?: string | null; assigned_to?: string | null },
  fallbackUserId: string,
  companyId: string,
): Promise<{ ok: true; bersaglio: BersaglioAppuntamento } | { ok: false; errore: string; status: number }> {
  if (apt.calendar_id) {
    const { data: cal } = await admin
      .from("marketing_calendars")
      .select("id, name, external_provider, external_connection_id, external_calendar_id")
      .eq("id", apt.calendar_id)
      .maybeSingle();
    const c = cal as { id: string; name?: string; external_provider?: string | null; external_connection_id?: string | null; external_calendar_id?: string | null } | null;
    if (c?.external_provider === "google" && c.external_connection_id && c.external_calendar_id) {
      const conn = await getConnectionById(admin, c.external_connection_id);
      if (!conn || conn.company_id !== companyId) {
        return {
          ok: false,
          status: 404,
          errore: `L'account Google agganciato al calendario "${c.name ?? ""}" non e' disponibile: ricollegalo, o scegline un altro dalle impostazioni del calendario.`,
        };
      }
      const settingsAgg = await getSettings(admin, conn.user_id, companyId);
      const calendarId = settingsAgg?.primary_calendar_id && eIlPrincipale(c.external_calendar_id, settingsAgg.primary_calendar_id, conn.google_account_email)
        ? settingsAgg.primary_calendar_id
        : c.external_calendar_id;
      return { ok: true, bersaglio: { conn, userId: conn.user_id, calendarId, marketingCalendarId: c.id } };
    }
  }
  const userId = await resolveEffectiveUserId(admin, apt, fallbackUserId);
  const conn = await getConnection(admin, userId, companyId);
  if (!conn) {
    return {
      ok: false,
      status: 404,
      errore: userId !== fallbackUserId ? `Responsabile (${userId}) non ha collegato Google Calendar` : "Not connected",
    };
  }
  const settings = await getSettings(admin, userId, companyId);
  if (!settings?.primary_calendar_id) return { ok: false, status: 400, errore: "No primary calendar configured" };
  return { ok: true, bersaglio: { conn, userId, calendarId: settings.primary_calendar_id, marketingCalendarId: apt.calendar_id ?? null } };
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

  const esito = await risolviBersaglio(admin, apt, userId, companyId);
  if (!esito.ok) return json({ error: esito.errore }, esito.status);
  const { conn, userId: effectiveUserId, calendarId: calendarioDestinazione } = esito.bersaglio;

  const prefPush = await preferenzeSync(admin, effectiveUserId, companyId);
  if (!prefPush.attiva || prefPush.direzione === "from_google") {
    return json({ skipped: true, motivo: prefPush.attiva ? "solo Google → EiC" : "sincronizzazione in pausa" });
  }

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return json({ error: "Token expired" }, 401);

  // Un appuntamento ha UN evento, a prescindere da quale account lo ha creato.
  const { data: existing } = await admin
    .from("google_calendar_event_map")
    .select("id")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (existing) return json({ error: "Already synced", mappingId: existing.id }, 409);

  const meetRequested = shouldUseGoogleMeet(apt);
  const googleEvent = buildGoogleEvent(apt, { createMeet: meetRequested && !apt.meeting_url });

  const res = await fetch(
    buildGoogleEventUrl(calendarioDestinazione, undefined, meetRequested),
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
    google_calendar_id: calendarioDestinazione,
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
  // L'evento sta sul calendario dell'account che lo ha creato: lo dice la
  // mappa, non chi sta cliccando adesso ne' il responsabile del calendario
  // (che dal 09/09/2026 puo' essere un altro).
  const { data: mapping } = await admin
    .from("google_calendar_event_map")
    .select("*")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (!mapping) return json({ error: "No mapping found, use push-event" }, 404);
  const effectiveUserId: string = mapping.user_id ?? userId;

  const conn = await getConnection(admin, effectiveUserId, companyId);
  if (!conn) return json({ error: "Not connected" }, 404);

  const prefUpd = await preferenzeSync(admin, effectiveUserId, companyId);
  if (!prefUpd.attiva || prefUpd.direzione === "from_google") {
    return json({ skipped: true, motivo: prefUpd.attiva ? "solo Google → EiC" : "sincronizzazione in pausa" });
  }

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return json({ error: "Token expired" }, 401);

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
//
// 2026-05-27: accetta `googleEventId`/`googleCalendarId` opzionali per
// bypass del mapping lookup. Necessario per il trigger BEFORE DELETE su
// appointments: la FK CASCADE elimina il mapping subito dopo la riga,
// quindi quando l'edge function arriva (async) il mapping non c'è più.
// Il trigger ora legge il mapping PRIMA del cascade e ce lo passa.
async function deleteEvent(
  userId: string,
  companyId: string,
  appointmentId: string,
  hintEventId?: string,
  hintCalendarId?: string,
): Promise<Response> {
  const admin = getSupabaseAdmin();
  // Prova prima il mapping, poi i parametri esplicit "hint" (trigger DB).
  const { data: mapping } = await admin
    .from("google_calendar_event_map")
    .select("*")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  // Il token giusto e' quello dell'account che ha l'evento.
  const effectiveUserId: string = mapping?.user_id ?? userId;
  const conn = await getConnection(admin, effectiveUserId, companyId);
  if (!conn) return json({ error: "Not connected" }, 404);

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return json({ error: "Token expired" }, 401);

  const googleEventId = mapping?.google_event_id ?? hintEventId;
  const googleCalendarId = mapping?.google_calendar_id ?? hintCalendarId;

  if (!googleEventId || !googleCalendarId) {
    return json({ success: true, message: "No mapping or hint found" });
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendarId)}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const errText = await res.text();
      console.error("Delete event failed:", res.status, errText);
    }
  } catch (e) {
    console.error("Delete event error:", e);
  }

  // Cleanup mapping (idempotente: se cascade l'ha già eliminato, no-op)
  if (mapping) {
    await admin.from("google_calendar_event_map").delete().eq("id", mapping.id);
  }
  // Cleanup busy_slot orfano locale per quel google_event_id
  await admin
    .from("google_calendar_busy_slots")
    .delete()
    .eq("company_id", companyId)
    .eq("user_id", effectiveUserId)
    .eq("google_event_id", googleEventId);

  return json({ success: true });
}

// Il ritorno da Google per UN calendario: eventi cambiati la' → appuntamenti
// aggiornati qui, mappe perse ricucite, eventi nuovi importati se la politica
// lo permette. Prima girava solo sul calendario principale: un appuntamento
// spostato su Google dentro il calendario agganciato al passo 3 restava
// fermo in EiC per sempre.
async function reconcileCalendario(
  admin: ReturnType<typeof getSupabaseAdmin>,
  accessToken: string,
  settings: any,
  userId: string,
  companyId: string,
  calId: string,
  marketingCalendarId: string | null,
  allowImport: boolean,
): Promise<{ created: number; updated: number; removed: number }> {
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
          // Se il calendario Google e' agganciato a un calendario di marketing,
          // l'evento importato nasce dentro quel calendario.
          calendar_id: marketingCalendarId,
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
  if (!settings?.primary_calendar_id) return { created: 0, updated: 0, removed: 0 };
  // Gli eventi di Google entrano in EiC solo se l'utente lo ha chiesto:
  // bidirezionale, oppure "solo Google → EiC".
  const prefRec = await preferenzeSync(admin, userId, companyId);
  if (!prefRec.attiva || prefRec.direzione === "to_google") {
    return { created: 0, updated: 0, removed: 0 };
  }

  const allowImport = (await getPlatformSetting("google_calendar_allow_google_to_crm_import")) === "true";

  const conn = await getConnection(admin, userId, companyId);
  if (!conn) return { created: 0, updated: 0, removed: 0 };

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return { created: 0, updated: 0, removed: 0 };

  // Il principale piu' ogni calendario agganciato a un calendario di
  // marketing su questa connessione.
  const agganciati = await calendariAgganciati(admin, conn, settings.primary_calendar_id);
  const daLeggere = new Map<string, string | null>();
  daLeggere.set(settings.primary_calendar_id, null);
  for (const a of agganciati) {
    // Se il principale e' agganciato a un calendario di marketing, gli eventi
    // importati da li' nascono dentro quel calendario.
    daLeggere.set(a.calendarId, a.marketingCalendarId);
  }

  const totale = { created: 0, updated: 0, removed: 0 };
  for (const [calId, marketingCalendarId] of daLeggere) {
    try {
      const r = await reconcileCalendario(admin, accessToken, settings, userId, companyId, calId, marketingCalendarId, allowImport);
      totale.created += r.created;
      totale.updated += r.updated;
      totale.removed += r.removed;
    } catch (e) {
      console.error(`reconcilePrimary: calendario ${calId}`, e instanceof Error ? e.message : String(e));
    }
  }
  return totale;
}

/**
 * Ritorno da Google per un calendario preciso di una connessione precisa:
 * lo chiama il canale webhook del calendario (stesso canale delle pose), cosi'
 * uno spostamento fatto su Google arriva in EiC in pochi secondi invece che al
 * prossimo giro dei 15 minuti.
 */
async function reconcilePerCalendario(connectionId: string, calendarId: string): Promise<{ created: number; updated: number; removed: number; skipped?: string }> {
  const admin = getSupabaseAdmin();
  const conn = await getConnectionById(admin, connectionId);
  if (!conn) return { created: 0, updated: 0, removed: 0, skipped: "connessione non attiva" };
  const settings = await getSettings(admin, conn.user_id, conn.company_id);
  const ePrincipale = eIlPrincipale(calendarId, settings?.primary_calendar_id, conn.google_account_email);
  const idLetto = ePrincipale ? (settings?.primary_calendar_id as string) : calendarId;
  const agganciato = (await calendariAgganciati(admin, conn, settings?.primary_calendar_id)).find((c) => c.calendarId === idLetto);
  if (!agganciato && !ePrincipale) return { created: 0, updated: 0, removed: 0, skipped: "calendario non agganciato" };
  if ((await getPlatformSetting("google_calendar_allow_two_way")) !== "true") return { created: 0, updated: 0, removed: 0, skipped: "two-way spento" };
  const pref = await preferenzeSync(admin, conn.user_id, conn.company_id);
  if (!pref.attiva || pref.direzione === "to_google") return { created: 0, updated: 0, removed: 0, skipped: "direzione" };
  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) return { created: 0, updated: 0, removed: 0, skipped: "token" };
  const allowImport = (await getPlatformSetting("google_calendar_allow_google_to_crm_import")) === "true";
  return reconcileCalendario(admin, accessToken, settings, conn.user_id, conn.company_id, idLetto, agganciato?.marketingCalendarId ?? null, allowImport);
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

// ---- POSE (calendari lavori) ----
// Vedi docs/superpowers/specs/2026-09-08-calendari-lavori-squadre-design.md.

async function getConnectionById(admin: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("id", id)
    .eq("status", "connected")
    .maybeSingle();
  return data;
}

/** Svuota la coda (di un'azienda o di tutte): ogni commessa una volta sola, 3 tentativi. */
async function processOrderQueue(companyId: string | null): Promise<{ processed: number; failed: number }> {
  const admin = getSupabaseAdmin();
  let q = admin
    .from("google_calendar_sync_queue")
    .select("id, company_id, entity_id, attempts")
    .is("processed_at", null)
    .lt("attempts", 3)
    .order("created_at")
    .limit(100);
  if (companyId) q = q.eq("company_id", companyId);
  const { data: righe } = await q;
  const perCommessa = new Map<string, { ids: number[]; attempts: number }>();
  for (const r of righe ?? []) {
    const acc = perCommessa.get(r.entity_id) ?? { ids: [], attempts: 0 };
    acc.ids.push(r.id);
    acc.attempts = Math.max(acc.attempts, r.attempts ?? 0);
    perCommessa.set(r.entity_id, acc);
  }
  let processed = 0, failed = 0;
  for (const [orderId, acc] of perCommessa) {
    try {
      await syncOrderToGoogle(orderId);
      await admin.from("google_calendar_sync_queue").update({ processed_at: new Date().toISOString() }).in("id", acc.ids);
      processed++;
    } catch (e) {
      failed++;
      await admin
        .from("google_calendar_sync_queue")
        .update({ attempts: acc.attempts + 1, last_error: String((e as Error).message).slice(0, 300) })
        .in("id", acc.ids);
    }
  }
  return { processed, failed };
}

interface Bersaglio { external_team_id: string | null; google_connection_id: string; google_calendar_id: string }

const GCAL = "https://www.googleapis.com/calendar/v3/calendars";

/** La commessa raggiunge tutti i suoi calendari: squadre assegnate + Posa aziendale. */
async function syncOrderToGoogle(orderId: string): Promise<{ created: number; updated: number; removed: number }> {
  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, company_id, order_code, client_name, client_phone, description, work_description, tipo_lavoro, indirizzo_lavori, work_address, client_address, work_start_date, work_end_date, work_start_time, work_end_time")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { created: 0, updated: 0, removed: 0 };

  const { data: squadre } = await admin
    .from("order_external_teams")
    .select("external_team:external_teams(id, google_connection_id, google_calendar_id, google_sync_enabled)")
    .eq("order_id", orderId);
  const { data: link } = await admin
    .from("company_calendar_links")
    .select("google_connection_id, google_calendar_id, enabled")
    .eq("company_id", order.company_id)
    .eq("kind", "posa")
    .maybeSingle();

  const bersagli: Bersaglio[] = [];
  for (const r of (squadre ?? []) as any[]) {
    const t = r.external_team;
    if (t?.google_sync_enabled && t.google_connection_id && t.google_calendar_id) {
      bersagli.push({ external_team_id: t.id, google_connection_id: t.google_connection_id, google_calendar_id: t.google_calendar_id });
    }
  }
  if (link?.enabled && link.google_connection_id && link.google_calendar_id) {
    if (!bersagli.some((b) => b.google_calendar_id === link.google_calendar_id)) {
      bersagli.push({ external_team_id: null, google_connection_id: link.google_connection_id, google_calendar_id: link.google_calendar_id });
    }
  }
  // Senza data di inizio non c'è evento: si toglie quello che c'era.
  const bersagliAttivi = order.work_start_date ? bersagli : [];

  const { data: mappe } = await admin.from("google_calendar_order_events").select("*").eq("order_id", orderId);
  let created = 0, updated = 0, removed = 0;

  // 1) via gli eventi dei calendari non più bersaglio
  for (const m of mappe ?? []) {
    if (bersagliAttivi.some((b) => b.google_calendar_id === m.google_calendar_id)) continue;
    const conn = await getConnectionById(admin, m.google_connection_id);
    const token = conn ? await getValidAccessToken(admin, conn) : null;
    if (token) {
      await fetch(`${GCAL}/${encodeURIComponent(m.google_calendar_id)}/events/${encodeURIComponent(m.google_event_id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      }).catch(() => {});
    }
    await admin.from("google_calendar_order_events").delete().eq("id", m.id);
    removed++;
  }

  // 2) crea o aggiorna sui bersagli
  if (bersagliAttivi.length === 0) return { created, updated, removed };
  const evento = costruisciEventoPosa(order as any);
  for (const b of bersagliAttivi) {
    const conn = await getConnectionById(admin, b.google_connection_id);
    const token = conn ? await getValidAccessToken(admin, conn) : null;
    if (!token) {
      await segnaErrorePosa(admin, order.company_id, b, "Account Google non collegato o scaduto");
      continue;
    }
    const esistente = (mappe ?? []).find((m) => m.google_calendar_id === b.google_calendar_id);
    const base = `${GCAL}/${encodeURIComponent(b.google_calendar_id)}/events`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    let res = await fetch(esistente ? `${base}/${encodeURIComponent(esistente.google_event_id)}` : base, {
      method: esistente ? "PATCH" : "POST",
      headers,
      body: JSON.stringify(evento),
      signal: AbortSignal.timeout(15000),
    });
    let mappaId: string | null = esistente?.id ?? null;
    if (esistente && (res.status === 404 || res.status === 410)) {
      // Evento sparito su Google (cancellato a mano): si ricrea.
      await admin.from("google_calendar_order_events").delete().eq("id", esistente.id);
      mappaId = null;
      res = await fetch(base, { method: "POST", headers, body: JSON.stringify(evento), signal: AbortSignal.timeout(15000) });
    }
    if (!res.ok) {
      await segnaErrorePosa(admin, order.company_id, b, `Google ${res.status}: ${(await res.text()).slice(0, 120)}`);
      continue;
    }
    await salvaMappaPosa(admin, order, b, await res.json(), mappaId);
    if (mappaId) updated++; else created++;
    // Loop prevention: il webhook ignora l'eco di Google nei 15s successivi.
    await admin
      .from("google_calendar_connections")
      .update({ last_sync_source: "crm", last_sync_at: new Date().toISOString() })
      .eq("id", conn!.id);
  }
  return { created, updated, removed };
}

async function salvaMappaPosa(admin: ReturnType<typeof getSupabaseAdmin>, order: any, b: Bersaglio, g: any, mappaId: string | null) {
  const adesso = new Date().toISOString();
  const riga = {
    company_id: order.company_id,
    order_id: order.id,
    external_team_id: b.external_team_id,
    google_connection_id: b.google_connection_id,
    google_calendar_id: b.google_calendar_id,
    google_event_id: g.id,
    etag: g.etag ?? null,
    last_updated_by: "eic",
    last_synced_at: adesso,
    last_error: null,
    updated_at: adesso,
  };
  if (mappaId) await admin.from("google_calendar_order_events").update(riga).eq("id", mappaId);
  else await admin.from("google_calendar_order_events").insert(riga);
  if (b.external_team_id) {
    await admin.from("external_teams").update({ google_last_sync_at: adesso, google_last_error: null }).eq("id", b.external_team_id);
  } else {
    await admin.from("company_calendar_links").update({ last_sync_at: adesso, last_error: null }).eq("company_id", order.company_id).eq("kind", "posa");
  }
}

async function segnaErrorePosa(admin: ReturnType<typeof getSupabaseAdmin>, companyId: string, b: Bersaglio, msg: string) {
  if (b.external_team_id) await admin.from("external_teams").update({ google_last_error: msg }).eq("id", b.external_team_id);
  else await admin.from("company_calendar_links").update({ last_error: msg }).eq("company_id", companyId).eq("kind", "posa");
}

/** Legge un calendario di squadra (o Posa) e riporta in EiC gli eventi di commessa cambiati. */
async function pullCalendarOrders(connectionId: string, calendarId: string): Promise<{ changed: number; cancelled: number }> {
  const admin = getSupabaseAdmin();
  const conn = await getConnectionById(admin, connectionId);
  const token = conn ? await getValidAccessToken(admin, conn) : null;
  if (!token) return { changed: 0, cancelled: 0 };
  const params = new URLSearchParams({
    updatedMin: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    singleEvents: "true",
    showDeleted: "true",
    maxResults: "250",
    privateExtendedProperty: "eic_kind=posa",
  });
  const res = await fetch(`${GCAL}/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { changed: 0, cancelled: 0 };
  const eventi = ((await res.json()).items ?? []) as any[];
  let changed = 0, cancelled = 0;
  for (const ev of eventi) {
    const { data: m } = await admin
      .from("google_calendar_order_events")
      .select("*")
      .eq("google_calendar_id", calendarId)
      .eq("google_event_id", ev.id)
      .maybeSingle();
    if (!m) continue;
    if (ev.status === "cancelled") {
      // La squadra ha cancellato la posa dal suo calendario: si toglie la squadra
      // dalla commessa, le date restano. Sul calendario Posa aziendale si ricrea.
      await admin.from("google_calendar_order_events").delete().eq("id", m.id);
      if (m.external_team_id) {
        await admin.from("order_external_teams").delete().eq("order_id", m.order_id).eq("external_team_id", m.external_team_id);
        await avvisaCommessa(admin, m.order_id, m.external_team_id, "ha tolto la posa dal suo calendario", "La squadra è stata tolta dalla commessa; le date restano.");
      } else {
        await admin.from("google_calendar_sync_queue").insert({ company_id: m.company_id, entity_type: "order", entity_id: m.order_id, reason: "ricrea" });
      }
      cancelled++;
      continue;
    }
    if (m.etag === ev.etag) continue;
    const nuove = leggiDateDaEventoGoogle(ev);
    if (!nuove) continue;
    const { data: order } = await admin
      .from("orders")
      .select("id, company_id, work_start_date, work_end_date, work_start_time, work_end_time")
      .eq("id", m.order_id)
      .maybeSingle();
    if (!order) continue;
    await admin
      .from("google_calendar_order_events")
      .update({ etag: ev.etag ?? null, last_updated_by: "google", last_synced_at: new Date().toISOString() })
      .eq("id", m.id);
    const attuali = {
      work_start_date: order.work_start_date ?? "",
      work_end_date: order.work_end_date ?? "",
      work_start_time: order.work_start_time,
      work_end_time: order.work_end_time,
    };
    if (stesseDate(attuali, nuove)) continue; // solo l'eco di un nostro push
    // Vince l'ultimo che ha toccato: qui è Google. Il trigger sulla commessa
    // riaccoda e riallinea gli altri calendari (Posa aziendale, altre squadre).
    await admin.from("orders").update({ ...nuove, updated_at: new Date().toISOString() }).eq("id", order.id);
    const ora = (t: string | null) => (t ? " " + t.slice(0, 5) : "");
    await avvisaCommessa(
      admin, order.id, m.external_team_id, "ha spostato la posa",
      `${nuove.work_start_date}${ora(nuove.work_start_time)} → ${nuove.work_end_date}${ora(nuove.work_end_time)}`,
    );
    changed++;
  }
  return { changed, cancelled };
}

async function avvisaCommessa(admin: ReturnType<typeof getSupabaseAdmin>, orderId: string, teamId: string | null, cosa: string, dettaglio: string) {
  const { data: o } = await admin.from("orders").select("company_id, order_code, assigned_to, created_by").eq("id", orderId).maybeSingle();
  if (!o) return;
  const dest = o.assigned_to ?? o.created_by;
  if (!dest) return;
  let chi = "Il calendario Posa";
  if (teamId) {
    const { data: t } = await admin.from("external_teams").select("name").eq("id", teamId).maybeSingle();
    chi = t?.name ? `Squadra ${t.name}` : "Una squadra";
  }
  await admin.rpc("create_notification", {
    p_company_id: o.company_id,
    p_user_id: dest,
    p_type: "order",
    p_title: `${chi} ${cosa}: ${o.order_code ?? "commessa"}`,
    p_body: dettaglio,
    p_entity_type: "order",
    p_entity_id: orderId,
    p_action_url: `/azienda/ordini/${orderId}`,
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

// Gli appuntamenti nati mentre il collegamento era rotto non arrivavano mai su
// Google: il push falliva sul momento e non ci riprovava piu' nessuno, cosi' chi
// ricollegava il calendario si ritrovava i giorni successivi vuoti. Qui ogni
// giro recupera i primi arretrati, pochi per volta.
async function recuperaAppuntamentiSenzaEvento(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  companyId: string,
): Promise<number> {
  const oggi = new Date().toISOString().slice(0, 10);
  const { data: futuri } = await admin
    .from("appointments")
    .select("id")
    .eq("company_id", companyId)
    .eq("assigned_to", userId)
    .gte("appointment_date", oggi)
    .not("status", "in", '("cancelled","annullato")')
    .order("appointment_date")
    .limit(50);
  const ids = (futuri ?? []).map((a: { id: string }) => a.id);
  // Anche gli appuntamenti dei calendari di marketing agganciati a QUESTA
  // connessione: il responsabile puo' non avere Google, e allora nessun altro
  // giro del cron li avrebbe mai presi.
  const conn = await getConnection(admin, userId, companyId);
  const agganciati = conn ? await calendariAgganciati(admin, conn, null) : [];
  if (agganciati.length > 0) {
    const { data: deiCalendari } = await admin
      .from("appointments")
      .select("id")
      .eq("company_id", companyId)
      .in("calendar_id", agganciati.map((a) => a.marketingCalendarId))
      .gte("appointment_date", oggi)
      .not("status", "in", '("cancelled","annullato")')
      .order("appointment_date")
      .limit(50);
    for (const a of (deiCalendari ?? []) as Array<{ id: string }>) if (!ids.includes(a.id)) ids.push(a.id);
  }
  if (ids.length === 0) return 0;

  const { data: mappati } = await admin
    .from("google_calendar_event_map")
    .select("appointment_id")
    .in("appointment_id", ids);
  const gia = new Set((mappati ?? []).map((m: { appointment_id: string }) => m.appointment_id));

  let spinti = 0;
  for (const id of ids.filter((x) => !gia.has(x)).slice(0, 10)) {
    try {
      const res = await pushEvent(userId, companyId, id);
      if (res.status === 200) spinti++;
    } catch (e) {
      console.error("recuperaAppuntamentiSenzaEvento:", e instanceof Error ? e.message : String(e));
    }
  }
  return spinti;
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

    let inPausa = 0;
    for (const conn of connections!) {
      try {
        const pref = await preferenzeSync(admin, conn.user_id, conn.company_id);
        if (!pref.attiva) {
          // "Sincronizzazione attiva" spenta nella scheda dell'utente: fino a
          // oggi quell'interruttore non fermava proprio niente.
          inPausa++;
          continue;
        }
        console.log(`cronFullSync: syncing user=${conn.user_id} company=${conn.company_id}`);
        const pullRes = await pullBusySlots(conn.user_id, conn.company_id);
        const pullData = await pullRes.json();
        const reconcileResult = await reconcilePrimary(conn.user_id, conn.company_id);
        const recuperati = pref.direzione === "from_google"
          ? 0
          : await recuperaAppuntamentiSenzaEvento(admin, conn.user_id, conn.company_id);
        results.push({
          userId: conn.user_id,
          companyId: conn.company_id,
          pull: pullData,
          reconcile: reconcileResult,
          recuperati,
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

    // Pose: coda in uscita e rilettura dei calendari di squadra (rete di
    // sicurezza per i webhook persi; il grosso passa dai canali).
    let coda: { processed: number; failed: number } = { processed: 0, failed: 0 };
    let calendariRiletti = 0;
    try {
      coda = await processOrderQueue(null);
      const { data: watches } = await admin.from("google_calendar_watches").select("connection_id, calendar_id");
      for (const w of watches ?? []) {
        await pullCalendarOrders(w.connection_id, w.calendar_id).catch((e) => console.error("cron pull-calendar", e));
        calendariRiletti++;
      }
    } catch (e) {
      console.error("cronFullSync: pose", e);
    }
    results.push({ pose: { coda, calendariRiletti } });
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

    // Il registro delle sincronizzazioni tiene un mese: ogni riga porta dentro
    // il risultato completo in JSON e in un mese sono gia' 2 MB su un database
    // che ne ha 1000 in tutto.
    await admin
      .from("google_calendar_sync_log")
      .delete()
      .lt("started_at", new Date(Date.now() - 30 * 864e5).toISOString());

    console.log(`cronFullSync: completed. Synced ${synced}, failed ${failed}, in pausa ${inPausa}.`);
    return json({ synced, failed, inPausa, total, results });
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
serveConMetriche("google-calendar-sync", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Chiamate interne (trigger/cron via pg_net): x-cron-secret, come
    // cliente-notifica. Niente JWT: il segreto sta nel vault e nell'env.
    // I trigger passano anche un Authorization (chiave anon) per superare il
    // gateway con verify_jwt: il permesso vero è il segreto.
    if (cronSecretValido(req)) {
      const interno = await req.json();
      if (interno.action === "cron-full-sync") return cronFullSync();
      if (interno.action === "process-order-queue") return json(await processOrderQueue(interno.companyId ?? null));
      // Notifica push di Google (google-calendar-webhook): rilettura completa
      // del calendario principale di quella connessione.
      if (interno.action === "full-sync") {
        if (!interno.userId || !interno.companyId) return json({ error: "userId e companyId richiesti" }, 400);
        return fullSync(interno.userId, interno.companyId);
      }
      if (interno.action === "pull-calendar") {
        if (!interno.connectionId || !interno.calendarId) return json({ error: "connectionId e calendarId richiesti" }, 400);
        // Lo stesso canale serve alle pose (commesse) e agli appuntamenti dei
        // calendari di marketing agganciati: si rileggono entrambi.
        const pose = await pullCalendarOrders(interno.connectionId, interno.calendarId);
        const appuntamenti = await reconcilePerCalendario(interno.connectionId, interno.calendarId).catch((e) => ({
          created: 0, updated: 0, removed: 0, skipped: e instanceof Error ? e.message : String(e),
        }));
        return json({ ...pose, appuntamenti });
      }
      // Appuntamenti: dal trigger di cancellazione (che non ha una service key
      // da usare) e dalle prenotazioni pubbliche. L'utente, se manca, e' il
      // responsabile dell'appuntamento.
      if (["push-event", "update-event", "delete-event"].includes(interno.action)) {
        if (!interno.appointmentId || !interno.companyId) return json({ error: "appointmentId e companyId richiesti" }, 400);
        let uid: string | null = interno.userId ?? null;
        if (!uid) {
          const { data: a } = await getSupabaseAdmin()
            .from("appointments")
            .select("assigned_to, created_by")
            .eq("id", interno.appointmentId)
            .maybeSingle();
          uid = (a as { assigned_to?: string | null; created_by?: string | null } | null)?.assigned_to
            ?? (a as { created_by?: string | null } | null)?.created_by ?? null;
        }
        if (!uid) return json({ error: "utente non determinabile" }, 400);
        if (interno.action === "push-event") return pushEvent(uid, interno.companyId, interno.appointmentId);
        if (interno.action === "update-event") return updateEvent(uid, interno.companyId, interno.appointmentId);
        return deleteEvent(uid, interno.companyId, interno.appointmentId, interno.googleEventId, interno.googleCalendarId);
      }
      return json({ error: `Unknown internal action: ${interno.action}` }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { action } = body;

    // Sincronizzazione di tutte le connessioni: solo col segreto interno (ramo
    // sopra). Prima bastava un JWT del progetto, cioè anche la chiave anon
    // pubblica: chiunque poteva far partire il giro su tutte le aziende.
    if (action === "cron-full-sync") {
      return json({ error: "Unauthorized for cron" }, 403);
    }

    // Service-role calls (from DB trigger): accept userId from body
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let userId: string;
    const { companyId, appointmentId, googleEventId, googleCalendarId } = body;

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
      // Scheda utente (Impostazioni → Utenti → Calendario): chi gestisce i
      // calendari può rileggere quello di un collega. Prima body.userId era
      // ignorato e «Sincronizza ora» aggiornava il calendario di chi cliccava.
      // Solo letture: gli eventi si scrivono sempre come chi li crea.
      const bersaglio = typeof body.userId === "string" ? body.userId : null;
      if (bersaglio && bersaglio !== userId && (action === "full-sync" || action === "pull-busy-slots")) {
        const admin = getSupabaseAdmin();
        const { data: conn } = await admin.from("google_calendar_connections").select("id").eq("user_id", bersaglio).eq("company_id", companyId).maybeSingle();
        if (!conn) return json({ error: "Il collega non ha Google Calendar collegato in questa azienda" }, 404);
        if (!(await puoGestireCalendari(admin, userId, companyId))) {
          return json({ error: "Serve il permesso di gestire i calendari per sincronizzare quello di un collega" }, 403);
        }
        userId = bersaglio;
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
        return deleteEvent(userId, companyId, appointmentId, googleEventId, googleCalendarId);
      case "full-sync":
        return fullSync(userId, companyId);
      case "push-order": {
        if (!body.orderId) return json({ error: "orderId required" }, 400);
        // La commessa deve essere dell'azienda verificata sopra.
        if (token !== serviceRoleKey) {
          const { data: ord } = await getSupabaseAdmin().from("orders").select("company_id").eq("id", body.orderId).maybeSingle();
          if ((ord as { company_id?: string } | null)?.company_id !== companyId) return json({ error: "Company mismatch" }, 403);
        }
        return json(await syncOrderToGoogle(body.orderId));
      }
      case "process-order-queue":
        return json(await processOrderQueue(companyId));
      case "pull-calendar": {
        if (!body.connectionId || !body.calendarId) return json({ error: "connectionId e calendarId richiesti" }, 400);
        // Il calendario Google usato deve essere di una connessione dell'azienda.
        if (token !== serviceRoleKey) {
          const { data: c } = await getSupabaseAdmin().from("google_calendar_connections").select("company_id").eq("id", body.connectionId).maybeSingle();
          if ((c as { company_id?: string } | null)?.company_id !== companyId) return json({ error: "Company mismatch" }, 403);
        }
        return json(await pullCalendarOrders(body.connectionId, body.calendarId));
      }
      case "reconcile": {
        const result = await reconcilePrimary(userId, companyId);
        return json({ success: true, reconcile: result });
      }
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("google-calendar-sync error:", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
