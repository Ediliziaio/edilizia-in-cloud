/**
 * gbp-reply-review — risponde a una recensione Google Business Profile
 *
 * POST /functions/v1/gbp-reply-review
 * Body: { review_id: string (UUID interno gbp_reviews.id), reply_text: string }
 *
 * API endpoint (richiede approvazione Google):
 *   PUT https://mybusiness.googleapis.com/v4/{name}/reply
 *   Body: { comment: string }
 *
 * Aggiorna `gbp_reviews.reply_comment`, `triage_status='replied'`, `replied_via_eic=true`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getEncryptionKey, encrypt, decrypt } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getFreshAccessToken(connectionId: string): Promise<string> {
  const db = admin();
  const { data: conn } = await db
    .from("gbp_connections")
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

  const clientId = await getPlatformSetting("google_business_client_id", "GOOGLE_BUSINESS_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_business_client_secret", "GOOGLE_BUSINESS_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("OAuth credentials missing");

  const refreshToken = await decrypt(conn.refresh_token_encrypted, encKey);
  const res = await fetch("https://oauth2.googleapis.com/token", {
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
  if (!res.ok) throw new Error(`refresh failed: ${await res.text()}`);
  const tokens = await res.json() as { access_token: string; expires_in: number };

  await db.from("gbp_connections").update({
    access_token_encrypted: await encrypt(tokens.access_token, encKey),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq("id", connectionId);

  return tokens.access_token;
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
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as { review_id?: string; reply_text?: string };
    if (!body.review_id || !body.reply_text || !body.reply_text.trim()) {
      return new Response(JSON.stringify({ error: "review_id e reply_text richiesti" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (body.reply_text.length > 4096) {
      return new Response(JSON.stringify({ error: "Reply troppo lunga (max 4096 char)" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const db = admin();

    // Load review + verify company ownership
    const { data: review, error: revErr } = await db
      .from("gbp_reviews")
      .select(`
        id, company_id, connection_id, gbp_review_id, gbp_location_id,
        gbp_connections!inner(id, company_id, gbp_account_id, gbp_location_id)
      `)
      .eq("id", body.review_id)
      .maybeSingle();
    if (revErr || !review) {
      return new Response(JSON.stringify({ error: "Recensione non trovata" }), {
        status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify user belongs to that company
    const { data: profile } = await db.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    if (profile?.company_id !== review.company_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fresh token
    const accessToken = await getFreshAccessToken(review.connection_id);

    // PUT reply to Google
    const reviewName = `${review.gbp_location_id}/reviews/${review.gbp_review_id}`;
    const replyRes = await fetch(
      `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment: body.reply_text }),
        signal: AbortSignal.timeout(20000),
      },
    );

    if (!replyRes.ok) {
      const errText = await replyRes.text();
      console.error("[gbp-reply-review] PUT failed:", replyRes.status, errText);
      return new Response(JSON.stringify({
        error: `Google API ${replyRes.status}: ${errText.slice(0, 300)}`,
      }), {
        status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const replyJson = await replyRes.json() as { comment?: string; updateTime?: string };

    // Update local row
    await db.from("gbp_reviews").update({
      reply_comment: replyJson.comment ?? body.reply_text,
      reply_update_time: replyJson.updateTime ?? new Date().toISOString(),
      replied_via_eic: true,
      triage_status: "replied",
    }).eq("id", body.review_id);

    return new Response(JSON.stringify({
      ok: true,
      reply: replyJson.comment ?? body.reply_text,
      update_time: replyJson.updateTime,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[gbp-reply-review] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
