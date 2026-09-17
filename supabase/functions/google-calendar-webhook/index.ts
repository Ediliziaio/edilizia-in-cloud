import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { corsHeaders, jsonResponse as json } from "../_shared/headers.ts";
import { puoGestireCalendari } from "../_shared/permessiCalendari.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";

function getAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/**
 * Chiede a google-calendar-sync una rilettura. Passa dal database perché la
 * funzione ha verify_jwt: il solo x-cron-secret veniva respinto dal gateway
 * (401) e le notifiche di Google non producevano nessuna sincronizzazione.
 */
async function sveglia(admin: ReturnType<typeof getAdmin>, action: string, body: Record<string, unknown>): Promise<void> {
  const { error } = await admin.rpc("calendario_esterno_sveglia", {
    p_funzione: "google-calendar-sync",
    p_action: action,
    p_body: body,
  });
  if (error) console.error(`[google-calendar-webhook] ${action} non avviata:`, error.message);
}

/**
 * Un canale per calendario (calendari lavori, 08/09/2026). Il canale storico
 * per-connessione resta per il calendario marketing; qui ogni calendario di
 * squadra (o Posa aziendale) ha il suo, in google_calendar_watches.
 */
async function tokenValido(admin: ReturnType<typeof getAdmin>, conn: any): Promise<string | null> {
  const encKey = getEncryptionKey();
  const scaduto = conn.token_expires_at && new Date(conn.token_expires_at) < new Date(Date.now() + 120_000);
  if (!scaduto) return await decrypt(conn.access_token_encrypted, encKey);
  if (!conn.refresh_token_encrypted) return null;
  const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_calendar_client_secret", "GOOGLE_CALENDAR_CLIENT_SECRET");
  const refreshToken = await decrypt(conn.refresh_token_encrypted, encKey);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!tokenRes.ok) return null;
  const tokens = await tokenRes.json();
  await admin.from("google_calendar_connections").update({
    access_token_encrypted: await encrypt(tokens.access_token, encKey),
    token_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : conn.token_expires_at,
  }).eq("id", conn.id);
  return tokens.access_token as string;
}

async function avviaWatchCalendario(admin: ReturnType<typeof getAdmin>, conn: any, calendarId: string): Promise<{ ok: boolean; error?: string }> {
  const token = await tokenValido(admin, conn);
  if (!token) return { ok: false, error: "Token Google non valido" };
  const { data: vecchio } = await admin
    .from("google_calendar_watches")
    .select("id, channel_id, resource_id")
    .eq("connection_id", conn.id)
    .eq("calendar_id", calendarId)
    .maybeSingle();
  if (vecchio?.channel_id && vecchio.resource_id) {
    await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: vecchio.channel_id, resourceId: vecchio.resource_id }),
    }).catch(() => {});
  }
  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomUUID() + "-" + crypto.randomUUID();
  const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: channelId,
      type: "web_hook",
      address: `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-webhook`,
      token: channelToken,
      expiration: String(expiration),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[google-calendar-webhook] watch calendario fallito:", calendarId, err);
    return { ok: false, error: `Google ${res.status}` };
  }
  const data = await res.json();
  await admin.from("google_calendar_watches").upsert({
    connection_id: conn.id,
    calendar_id: calendarId,
    channel_id: channelId,
    resource_id: data.resourceId ?? null,
    channel_token: channelToken,
    expiry_at: new Date(expiration).toISOString(),
  }, { onConflict: "connection_id,calendar_id" });
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = getAdmin();
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── Google push notification webhook ──
  if (req.method === "POST" && !action) {
    const channelId = req.headers.get("x-goog-channel-id");
    const channelToken = req.headers.get("x-goog-channel-token");
    const resourceState = req.headers.get("x-goog-resource-state");

    if (!channelId || resourceState === "sync") {
      // Initial sync notification from Google - just acknowledge
      return json({ ok: true });
    }

    console.log(`[google-calendar-webhook] Push received: channel=${channelId}, state=${resourceState}`);

    // Canale di un calendario di squadra / Posa → rilettura di QUEL calendario.
    const { data: watch } = await admin
      .from("google_calendar_watches")
      .select("id, connection_id, calendar_id, channel_token, last_notified_at")
      .eq("channel_id", channelId)
      .maybeSingle();
    if (watch) {
      if (watch.channel_token !== channelToken) return new Response("Invalid channel token", { status: 403 });
      if (watch.last_notified_at && Date.now() - new Date(watch.last_notified_at).getTime() < 10_000) {
        return json({ ok: true, debounced: true });
      }
      await admin.from("google_calendar_watches").update({ last_notified_at: new Date().toISOString() }).eq("id", watch.id);
      await sveglia(admin, "pull-calendar", { connectionId: watch.connection_id, calendarId: watch.calendar_id });
      return json({ ok: true, calendar: watch.calendar_id });
    }

    // Find the connection by webhook_channel_id
    const { data: conn } = await admin
      .from("google_calendar_connections")
      .select("id, user_id, company_id, webhook_channel_token, last_webhook_processed_at, last_sync_source, last_sync_at")
      .eq("webhook_channel_id", channelId)
      .eq("status", "connected")
      .maybeSingle();

    if (!conn) {
      console.log("[google-calendar-webhook] No matching connection for channel:", channelId);
      return json({ ok: true });
    }

    // SEC: verifica channel_token (se registrato) — evita CSRF/spoofing
    // Fail-open se il token non è stato registrato (retrocompat con watch
    // creati prima di questa feature)
    if (conn.webhook_channel_token && conn.webhook_channel_token !== channelToken) {
      console.warn(`[google-calendar-webhook] Invalid token for channel ${channelId}`);
      return new Response("Invalid channel token", { status: 403 });
    }

    // DEBOUNCE: se abbiamo processato un webhook da questo channel entro
    // 10s, skip (evita N full-sync quando Google manda burst di eventi).
    // 10s lascia tempo a Google di batchare modifiche consecutive.
    const DEBOUNCE_MS = 10_000;
    if (conn.last_webhook_processed_at) {
      const lastMs = new Date(conn.last_webhook_processed_at).getTime();
      if (Date.now() - lastMs < DEBOUNCE_MS) {
        console.log(`[google-calendar-webhook] Debounced: last sync ${Math.round((Date.now() - lastMs) / 1000)}s ago`);
        return json({ ok: true, debounced: true });
      }
    }

    // SYNC LOOP PREVENTION: se abbiamo fatto un push CRM→Google entro 15s,
    // il webhook che ora arriva è probabilmente l'echo di quel push.
    // Skippa per evitare di sovrascrivere il CRM con dati che provengono
    // dal CRM stesso.
    const LOOP_COOLDOWN_MS = 15_000;
    if (conn.last_sync_source === "crm" && conn.last_sync_at) {
      const lastMs = new Date(conn.last_sync_at).getTime();
      if (Date.now() - lastMs < LOOP_COOLDOWN_MS) {
        console.log(`[google-calendar-webhook] Loop prevention: CRM just pushed ${Math.round((Date.now() - lastMs) / 1000)}s ago`);
        // aggiorna last_webhook_processed_at ma NON triggerare sync
        await admin
          .from("google_calendar_connections")
          .update({ last_webhook_processed_at: new Date().toISOString() })
          .eq("id", conn.id);
        return json({ ok: true, loop_prevented: true });
      }
    }

    // Marca il webhook come processato (prima di triggerare il sync, per
    // garantire il debounce anche se il sync fallisce)
    await admin
      .from("google_calendar_connections")
      .update({
        last_webhook_processed_at: new Date().toISOString(),
        last_sync_source: "google",
      })
      .eq("id", conn.id);

    // Rilettura del calendario: passa dal database (calendario_esterno_sveglia),
    // che manda segreto e chiave per il gateway di google-calendar-sync.
    await sveglia(admin, "full-sync", { userId: conn.user_id, companyId: conn.company_id });

    return json({ ok: true });
  }

  // ── Register watch ──
  if (action === "register_calendar_watch") {
    const body = await req.json();
    const { connectionId, calendarId } = body;
    if (!connectionId || !calendarId) return json({ error: "connectionId e calendarId richiesti" }, 400);
    const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET");
    const isInternal = !!internalSecret && req.headers.get("x-cron-secret") === internalSecret;
    const { data: conn } = await admin
      .from("google_calendar_connections")
      .select("*")
      .eq("id", connectionId)
      .eq("status", "connected")
      .maybeSingle();
    if (!conn) return json({ error: "Connessione Google non trovata" }, 404);
    // Il principale ha gia' il canale della connessione: un secondo canale
    // sullo stesso calendario farebbe partire ogni sincronizzazione due volte.
    {
      const { data: st } = await admin
        .from("google_calendar_settings")
        .select("primary_calendar_id")
        .eq("connection_id", conn.id)
        .maybeSingle();
      const primary = (st as { primary_calendar_id?: string | null } | null)?.primary_calendar_id;
      const email = String(conn.google_account_email ?? "").toLowerCase();
      const norm = (x: string) => (email && x.toLowerCase() === email ? "primary" : x);
      if (primary && norm(String(calendarId)) === norm(primary)) {
        return json({ ok: true, skipped: "principale: il canale della connessione copre gia' questo calendario" });
      }
    }
    if (!isInternal) {
      const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      // Il canale di un calendario altrui: permesso sui calendari
      // nell'azienda della connessione (prima: admin di qualunque azienda).
      if (user.id !== conn.user_id && !(await puoGestireCalendari(admin, user.id, conn.company_id))) {
        return json({ error: "Serve il permesso di gestire i calendari" }, 403);
      }
    }
    const esito = await avviaWatchCalendario(admin, conn, calendarId);
    return json(esito, esito.ok ? 200 : 502);
  }

  if (action === "register_watch") {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const { companyId, userId: bodyUserId } = body;
    if (!companyId) return json({ error: "companyId required" }, 400);

    let resolvedUserId: string;

    if (token === serviceRoleKey) {
      // Called from handleCallback (auto-register after OAuth): find the just-connected user
      if (bodyUserId) {
        resolvedUserId = bodyUserId;
      } else {
        // Find the most recently connected user for this company
        const { data: latestConn } = await admin
          .from("google_calendar_connections")
          .select("user_id")
          .eq("company_id", companyId)
          .eq("status", "connected")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!latestConn) return json({ error: "No connected Google Calendar" }, 404);
        resolvedUserId = latestConn.user_id;
      }
    } else {
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      resolvedUserId = user.id;
    }

    const { data: conn } = await admin
      .from("google_calendar_connections")
      .select("*")
      .eq("company_id", companyId)
      .eq("user_id", resolvedUserId)
      .eq("status", "connected")
      .maybeSingle();

    if (!conn) return json({ error: "No connected Google Calendar" }, 404);

    // B13 Fix: use primary_calendar_id from settings, not the non-existent calendar_id field
    const { data: settings } = await admin
      .from("google_calendar_settings")
      .select("primary_calendar_id")
      .eq("company_id", companyId)
      .eq("user_id", resolvedUserId)
      .maybeSingle();

    // 2026-05-27 (BUG CRITICO): decrypt/encrypt sono async, mancavano await.
    // Risultato: "[object Promise]" come Bearer token → 401 Google API.
    const encKey = getEncryptionKey();
    const accessToken = await decrypt(conn.access_token_encrypted, encKey);

    const calendarId = settings?.primary_calendar_id || "primary";
    const channelId = crypto.randomUUID();
    // SEC: genera token randomico che Google rispedirà in x-goog-channel-token.
    // Serve per verificare che le push arrivino davvero dal watch registrato.
    const channelToken = crypto.randomUUID() + "-" + crypto.randomUUID();
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-webhook`;
    const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    const watchRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: channelId,
          type: "web_hook",
          address: webhookUrl,
          token: channelToken, // Google restituisce questo in x-goog-channel-token
          expiration: String(expiration),
        }),
      }
    );

    if (!watchRes.ok) {
      const errText = await watchRes.text();
      console.error("[google-calendar-webhook] Watch registration failed:", errText);

      if (watchRes.status === 401 || watchRes.status === 403) {
        // Try token refresh
        const clientId = await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID");
        const clientSecret = await getPlatformSetting("google_calendar_client_secret", "GOOGLE_CALENDAR_CLIENT_SECRET");
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
        });

        if (tokenRes.ok) {
          const tokens = await tokenRes.json();
          const newAccessTokenEncrypted = await encrypt(tokens.access_token, encKey);
          await admin.from("google_calendar_connections").update({
            access_token_encrypted: newAccessTokenEncrypted,
          }).eq("id", conn.id);

          // Retry watch with new token
          const retryRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${tokens.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                id: channelId,
                type: "web_hook",
                address: webhookUrl,
                token: channelToken,
                expiration: String(expiration),
              }),
            }
          );

          if (!retryRes.ok) {
            return json({ error: "Watch registration failed after token refresh" }, 502);
          }

          const retryData = await retryRes.json();
          await admin.from("google_calendar_connections").update({
            webhook_channel_id: channelId,
            webhook_channel_token: channelToken,
            webhook_resource_id: retryData.resourceId || null,
            webhook_expiry_at: new Date(expiration).toISOString(),
          }).eq("id", conn.id);

          return json({ success: true, channelId, expiration: new Date(expiration).toISOString() });
        }

        return json({ error: "Token refresh and watch registration failed" }, 502);
      }

      return json({ error: "Watch registration failed" }, 502);
    }

    const watchData = await watchRes.json();

    await admin.from("google_calendar_connections").update({
      webhook_channel_id: channelId,
      webhook_channel_token: channelToken,
      webhook_resource_id: watchData.resourceId || null,
      webhook_expiry_at: new Date(expiration).toISOString(),
    }).eq("id", conn.id);

    return json({ success: true, channelId, expiration: new Date(expiration).toISOString() });
  }

  // ── Renew watches (called by cron) ──
  if (action === "renew_watches") {
    // Solo il job google-calendar-renew-watches-6h: prima nessun controllo,
    // chiunque poteva far rinnovare i canali di tutte le connessioni.
    if (!cronSecretValido(req)) return json({ error: "Unauthorized" }, 401);
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // expiring within 24h

    // Canali per calendario (squadre / Posa): stessa scadenza, stessa cadenza.
    let rinnovatiCalendari = 0;
    const { data: watchScadenti } = await admin
      .from("google_calendar_watches")
      .select("id, connection_id, calendar_id")
      .lt("expiry_at", cutoff);
    for (const w of watchScadenti ?? []) {
      const { data: c } = await admin.from("google_calendar_connections").select("*").eq("id", w.connection_id).eq("status", "connected").maybeSingle();
      if (!c) continue;
      const esito = await avviaWatchCalendario(admin, c, w.calendar_id);
      if (esito.ok) rinnovatiCalendari++;
    }
    console.log(`[google-calendar-webhook] canali calendario rinnovati: ${rinnovatiCalendari}`);

    // Anche le connessioni SENZA canale: la registrazione dopo l'OAuth e'
    // "non critica" e se fallisce li' non ci riprovava piu' nessuno — quella
    // connessione restava per sempre senza avvisi da Google.
    const { data: expiring } = await admin
      .from("google_calendar_connections")
      .select("id, user_id, company_id, access_token_encrypted, refresh_token_encrypted, webhook_channel_id, webhook_resource_id")
      .eq("status", "connected")
      .or(`webhook_channel_id.is.null,webhook_expiry_at.lt.${cutoff}`);

    let renewed = 0;

    if (expiring) {
      const encKey = getEncryptionKey();

      for (const conn of expiring) {
        try {
          // Stop old watch
          if (conn.webhook_channel_id && conn.webhook_resource_id) {
            const accessToken = await decrypt(conn.access_token_encrypted, encKey);
            await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                id: conn.webhook_channel_id,
                resourceId: conn.webhook_resource_id,
              }),
            }).catch(() => {}); // Ignore errors on stop
          }

          // Register new watch — B13 Fix: fetch primary_calendar_id from settings
          const { data: connSettings } = await admin
            .from("google_calendar_settings")
            .select("primary_calendar_id")
            .eq("company_id", conn.company_id)
            .eq("user_id", conn.user_id)
            .maybeSingle();
          const accessToken = await decrypt(conn.access_token_encrypted, encKey);
          const calendarId = connSettings?.primary_calendar_id || "primary";
          const newChannelId = crypto.randomUUID();
          const newChannelToken = crypto.randomUUID() + "-" + crypto.randomUUID();
          const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-webhook`;
          const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

          const watchRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                id: newChannelId,
                type: "web_hook",
                address: webhookUrl,
                token: newChannelToken,
                expiration: String(expiration),
              }),
            }
          );

          if (watchRes.ok) {
            const watchData = await watchRes.json();
            await admin.from("google_calendar_connections").update({
              webhook_channel_id: newChannelId,
              webhook_channel_token: newChannelToken,
              webhook_resource_id: watchData.resourceId || null,
              webhook_expiry_at: new Date(expiration).toISOString(),
            }).eq("id", conn.id);
            renewed++;
          }
        } catch (err) {
          console.error(`[google-calendar-webhook] Renew failed for conn ${conn.id}:`, err);
        }
      }
    }

    return json({ message: "Watch renewal complete", renewed });
  }

  return json({ error: "Unknown action" }, 400);
});
