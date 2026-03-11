import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { webhook_id, event_type, payload, is_test, test_url } = await req.json();

    let targetUrl: string;
    let secret: string | null = null;

    if (is_test && test_url) {
      // Test mode with ad-hoc URL (webhook not yet saved)
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
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!webhook.is_active && !is_test) {
        return new Response(
          JSON.stringify({ error: "Webhook inactive" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
