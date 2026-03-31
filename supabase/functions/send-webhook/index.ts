import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function signPayload(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  // Verifica JWT (SEC-013)
  let userId: string;
  let supabaseAdmin: ReturnType<typeof createClient>;
  try {
    ({ userId, supabaseAdmin } = await requireAuth(req, corsH));
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const { webhook_id, event_type, payload, is_test, test_url } = await req.json();

    let targetUrl: string;
    let secret: string | null = null;

    if (is_test && test_url) {
      // Test mode: validazione SSRF — solo HTTPS, niente IP interni (SEC-013)
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(test_url);
      } catch {
        return new Response(JSON.stringify({ error: "test_url non è un URL valido" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (parsedUrl.protocol !== "https:") {
        return new Response(JSON.stringify({ error: "test_url deve usare HTTPS" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const hostname = parsedUrl.hostname.toLowerCase();
      const isInternal =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "0.0.0.0" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.16.") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal");
      if (isInternal) {
        return new Response(JSON.stringify({ error: "test_url non può puntare a indirizzi interni" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      targetUrl = test_url;
    } else {
      // Fetch webhook config from DB
      const { data: webhook, error: wErr } = await supabase
        .from("webhooks")
        .select("id, url, secret, is_active")
        .eq("id", webhook_id)
        .single();

      if (wErr || !webhook) {
        return new Response(
          JSON.stringify({ error: "Webhook not found" }),
          { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      if (!webhook.is_active && !is_test) {
        return new Response(
          JSON.stringify({ error: "Webhook inactive" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      targetUrl = webhook.url;
      secret = webhook.secret;
    }

    const payloadStr = JSON.stringify({
      event: event_type,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Event": event_type,
      "X-Webhook-Timestamp": new Date().toISOString(),
      "User-Agent": "SalesOS-Webhook/1.0",
    };

    if (secret) {
      const sig = await signPayload(secret, payloadStr);
      headers["X-Webhook-Signature"] = `sha256=${sig}`;
    }

    const start = Date.now();
    let httpStatus: number | null = null;
    let responseBody: string | null = null;
    let deliveryStatus: "success" | "failed" = "failed";

    try {
      const resp = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: payloadStr,
        signal: AbortSignal.timeout(10000),
      });
      httpStatus = resp.status;
      responseBody = await resp.text();
      deliveryStatus = resp.ok ? "success" : "failed";
    } catch (err) {
      responseBody = String(err);
    }

    const durationMs = Date.now() - start;

    // Log delivery (skip for test-only calls)
    if (!is_test && webhook_id) {
      await supabase.from("webhook_deliveries").insert({
        webhook_id,
        event_type,
        payload,
        status: deliveryStatus,
        http_status: httpStatus,
        response_body: responseBody?.slice(0, 2000),
        duration_ms: durationMs,
      });
    }

    return new Response(
      JSON.stringify({
        status: deliveryStatus,
        http_status: httpStatus,
        response_body: responseBody?.slice(0, 500),
        duration_ms: durationMs,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
