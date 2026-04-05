import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { corsHeaders, jsonResponse as json } from "../_shared/headers.ts";

function getAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
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
    const resourceState = req.headers.get("x-goog-resource-state");

    if (!channelId || resourceState === "sync") {
      // Initial sync notification from Google - just acknowledge
      return json({ ok: true });
    }

    console.log(`[google-calendar-webhook] Push received: channel=${channelId}, state=${resourceState}`);

    // Find the connection by webhook_channel_id
    const { data: conn } = await admin
      .from("google_calendar_connections")
      .select("id, user_id, company_id, calendar_id")
      .eq("webhook_channel_id", channelId)
      .eq("status", "connected")
      .maybeSingle();

    if (!conn) {
      console.log("[google-calendar-webhook] No matching connection for channel:", channelId);
      return json({ ok: true });
    }

    // Trigger a sync by calling google-calendar-sync
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    try {
      const syncRes = await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          action: "full-sync",
          userId: conn.user_id,
          companyId: conn.company_id,
        }),
      });

      const syncResult = await syncRes.json();
      console.log("[google-calendar-webhook] Sync triggered:", syncResult);
    } catch (err) {
      console.error("[google-calendar-webhook] Sync trigger failed:", err);
    }

    return json({ ok: true });
  }

  // ── Register watch ──
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

    const encKey = getEncryptionKey();
    const accessToken = decrypt(conn.access_token_encrypted, encKey);

    const calendarId = settings?.primary_calendar_id || "primary";
    const channelId = crypto.randomUUID();
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

        if (tokenRes.ok) {
          const tokens = await tokenRes.json();
          await admin.from("google_calendar_connections").update({
            access_token_encrypted: encrypt(tokens.access_token, encKey),
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
      webhook_resource_id: watchData.resourceId || null,
      webhook_expiry_at: new Date(expiration).toISOString(),
    }).eq("id", conn.id);

    return json({ success: true, channelId, expiration: new Date(expiration).toISOString() });
  }

  // ── Renew watches (called by cron) ──
  if (action === "renew_watches") {
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // expiring within 24h

    const { data: expiring } = await admin
      .from("google_calendar_connections")
      .select("id, user_id, company_id, access_token_encrypted, refresh_token_encrypted, webhook_channel_id, webhook_resource_id")
      .eq("status", "connected")
      .not("webhook_channel_id", "is", null)
      .lt("webhook_expiry_at", cutoff);

    let renewed = 0;

    if (expiring) {
      const encKey = getEncryptionKey();

      for (const conn of expiring) {
        try {
          // Stop old watch
          if (conn.webhook_channel_id && conn.webhook_resource_id) {
            const accessToken = decrypt(conn.access_token_encrypted, encKey);
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
          const accessToken = decrypt(conn.access_token_encrypted, encKey);
          const calendarId = connSettings?.primary_calendar_id || "primary";
          const newChannelId = crypto.randomUUID();
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
                expiration: String(expiration),
              }),
            }
          );

          if (watchRes.ok) {
            const watchData = await watchRes.json();
            await admin.from("google_calendar_connections").update({
              webhook_channel_id: newChannelId,
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
