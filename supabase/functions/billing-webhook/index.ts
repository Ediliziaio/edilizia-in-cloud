import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const WEBHOOK_SECRET = Deno.env.get("BILLING_WEBHOOK_SECRET") || "";

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

async function verifySignature(req: Request, body: string): Promise<boolean> {
  // CRITICAL: reject all requests if secret is not configured
  if (!WEBHOOK_SECRET) {
    throw new Error("BILLING_WEBHOOK_SECRET not configured");
  }

  // Only accept signature from headers — never from query params (prevents replay via URL sharing)
  const signature = req.headers.get("x-webhook-signature") || req.headers.get("x-signature");
  if (!signature) return false;

  // Replay protection: check timestamp header (providers must send x-webhook-timestamp)
  const tsHeader = req.headers.get("x-webhook-timestamp");
  if (tsHeader) {
    const tsMs = parseInt(tsHeader, 10) * (tsHeader.length <= 10 ? 1000 : 1); // handle seconds or ms
    if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > REPLAY_WINDOW_MS) {
      return false; // reject stale or malformed timestamp
    }
  }

  // HMAC-SHA256 verification
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBytes = new Uint8Array(
      signature.replace(/^sha256=/, "").match(/.{1,2}/g)?.map((b: string) => parseInt(b, 16)) || []
    );
    if (sigBytes.length === 0) return false;
    return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(body));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    // Startup check: reject immediately if secret not configured
    if (!WEBHOOK_SECRET) {
      console.error("BILLING_WEBHOOK_SECRET not configured — rejecting all requests");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const provider = new URL(req.url).searchParams.get("provider") || "fattureincloud";
    const bodyText = await req.text();
    const requestIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

    // Verify webhook authenticity
    let isValid = false;
    try {
      isValid = await verifySignature(req, bodyText);
    } catch (e) {
      console.error("Signature verification error:", e);
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isValid) {
      console.warn("Rejected unauthorized webhook from IP:", requestIp, "provider:", provider);

      // Extract invoice_id from payload for audit (best effort)
      let payloadInvoiceId: string | null = null;
      try {
        const parsed = JSON.parse(bodyText);
        payloadInvoiceId = parsed?.data?.id?.toString() || parsed?.id?.toString() || null;
      } catch { /* unparseable payload */ }

      // Log rejected attempt with null company_id (not fake UUID)
      try {
        await supabase.from("billing_sync_log").insert({
          company_id: null as unknown as string, // unknown origin
          provider,
          direction: "pull",
          action: "webhook_rejected",
          status: "error",
          error_message: `Unauthorized webhook: invalid or missing signature. IP: ${requestIp}. External ID: ${payloadInvoiceId || "N/A"}`,
        });
      } catch { /* best effort logging */ }

      return new Response("Unauthorized", { status: 401 });
    }

    const body = JSON.parse(bodyText);

    const ficStatusMap: Record<string, string> = {
      ok: "delivered", sending: "sent", not_sent: "issued", error: "issued",
    };
    const itStatusMap: Record<string, string> = {
      Delivered: "delivered", Sent: "sent", Pending: "sent", Error: "issued",
    };

    let externalId: string | undefined;
    let newStatus: string | undefined;
    let sdiId: string | undefined;

    if (provider === "fattureincloud") {
      externalId = body?.data?.id?.toString();
      newStatus = ficStatusMap[body?.data?.status] || "sent";
      sdiId = body?.data?.ei_data?.sdi_id?.toString();
    } else if (provider === "invoicetronic") {
      externalId = body?.id?.toString();
      newStatus = itStatusMap[body?.status] || "sent";
      sdiId = body?.sdi_id?.toString();
    }

    if (externalId) {
      const { data: invoice } = await supabase
        .from("invoices").select("id, company_id")
        .eq("external_id", externalId).eq("external_provider", provider).single();

      if (invoice) {
        await supabase.from("invoices").update({
          external_status: body?.data?.status || body?.status,
          status: newStatus,
          external_sdi_id: sdiId,
          updated_at: new Date().toISOString(),
        }).eq("id", invoice.id);

        await supabase.from("billing_sync_log").insert({
          company_id: invoice.company_id,
          invoice_id: invoice.id,
          provider,
          direction: "pull",
          action: "webhook",
          status: "success",
          response_payload: body,
        });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("billing-webhook error:", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
