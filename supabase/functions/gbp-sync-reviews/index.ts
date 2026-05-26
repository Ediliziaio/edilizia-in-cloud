/**
 * gbp-sync-reviews — sincronizza recensioni Google Business Profile
 *
 * POST /functions/v1/gbp-sync-reviews
 * Body: { company_id?: string }  (default: company dell'utente)
 *
 * Fetcha dalle API Google le recensioni della location collegata e fa upsert
 * in `gbp_reviews`. Gestisce token refresh automatico (refresh_token).
 *
 * API endpoint: mybusiness.googleapis.com/v4/{location}/reviews
 *   Richiede accesso al Business Profile API (partner program di Google).
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

/** Refresh access_token se scaduto. Ritorna access_token decifrato e fresco. */
async function getFreshAccessToken(connectionId: string): Promise<string> {
  const db = admin();
  const { data: conn, error } = await db
    .from("gbp_connections")
    .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !conn) throw new Error("Connection not found");

  const encKey = getEncryptionKey();
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const needsRefresh = Date.now() >= expiresAt - 60_000; // refresh se < 1 minuto

  if (!needsRefresh && conn.access_token_encrypted) {
    return await decrypt(conn.access_token_encrypted, encKey);
  }
  if (!conn.refresh_token_encrypted) {
    throw new Error("No refresh token — utente deve ricollegare GBP");
  }

  const clientId = await getPlatformSetting("google_business_client_id", "GOOGLE_BUSINESS_CLIENT_ID");
  const clientSecret = await getPlatformSetting("google_business_client_secret", "GOOGLE_BUSINESS_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("OAuth credentials missing");

  const refreshToken = await decrypt(conn.refresh_token_encrypted, encKey);
  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
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

  if (!refreshRes.ok) {
    const err = await refreshRes.text();
    throw new Error(`refresh failed: ${err}`);
  }
  const tokens = await refreshRes.json() as { access_token: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await db.from("gbp_connections").update({
    access_token_encrypted: await encrypt(tokens.access_token, encKey),
    token_expires_at: newExpiresAt,
  }).eq("id", connectionId);

  return tokens.access_token;
}

interface GbpReviewApi {
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
  name?: string;
}

const STAR_MAP: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
};

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

    const body = (await req.json().catch(() => ({}))) as { company_id?: string };
    const db = admin();

    // Determine company_id
    let companyId = body.company_id;
    if (!companyId) {
      const { data: profile } = await db.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
      companyId = profile?.company_id ?? undefined;
    }
    if (!companyId) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get connection
    const { data: conn, error: connErr } = await db
      .from("gbp_connections")
      .select("id, gbp_account_id, gbp_location_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: "GBP non collegato per questa azienda" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (!conn.gbp_location_id || !conn.gbp_account_id) {
      return new Response(JSON.stringify({ error: "Seleziona prima una location GBP" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get fresh token
    const accessToken = await getFreshAccessToken(conn.id);

    // Fetch reviews (paginated, max 50 per page)
    const reviewsAll: GbpReviewApi[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const url = new URL(
        `https://mybusiness.googleapis.com/v4/${conn.gbp_account_id}/${conn.gbp_location_id}/reviews`,
      );
      url.searchParams.set("pageSize", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const errText = await res.text();
        // Aggiorna last_error
        await db.from("gbp_connections").update({
          last_error: `API ${res.status}: ${errText.slice(0, 200)}`,
        }).eq("id", conn.id);
        throw new Error(`Reviews fetch failed: ${res.status} ${errText.slice(0, 200)}`);
      }
      const json = await res.json() as { reviews?: GbpReviewApi[]; nextPageToken?: string };
      reviewsAll.push(...(json.reviews ?? []));
      pageToken = json.nextPageToken;
      pages++;
    } while (pageToken && pages < 10); // safety cap: 500 review max per sync

    // Upsert in gbp_reviews
    if (reviewsAll.length > 0) {
      const rows = reviewsAll.map((r) => ({
        connection_id: conn.id,
        company_id: companyId,
        gbp_review_id: r.reviewId ?? r.name ?? crypto.randomUUID(),
        gbp_location_id: conn.gbp_location_id,
        reviewer_name: r.reviewer?.displayName ?? null,
        reviewer_profile_photo: r.reviewer?.profilePhotoUrl ?? null,
        star_rating: r.starRating ? STAR_MAP[r.starRating] ?? null : null,
        comment: r.comment ?? null,
        create_time: r.createTime ?? null,
        update_time: r.updateTime ?? null,
        reply_comment: r.reviewReply?.comment ?? null,
        reply_update_time: r.reviewReply?.updateTime ?? null,
        raw: r,
      }));

      const { error: upsertErr } = await db.from("gbp_reviews").upsert(rows, {
        onConflict: "connection_id,gbp_review_id",
        ignoreDuplicates: false,
      });
      if (upsertErr) {
        console.error("[gbp-sync-reviews] upsert error:", upsertErr);
        throw upsertErr;
      }
    }

    // Update connection last_sync
    await db.from("gbp_connections").update({
      last_sync_at: new Date().toISOString(),
      last_sync_review_count: reviewsAll.length,
      last_error: null,
    }).eq("id", conn.id);

    return new Response(JSON.stringify({
      ok: true,
      synced: reviewsAll.length,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[gbp-sync-reviews] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
