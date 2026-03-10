import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const WEBHOOK_SECRET = Deno.env.get("BILLING_WEBHOOK_SECRET") || "";

async function verifySignature(req: Request, body: string): Promise<boolean> {
  const signature = req.headers.get("x-webhook-signature") || 
                    req.headers.get("x-signature") ||
                    new URL(req.url).searchParams.get("secret");
  
  if (!WEBHOOK_SECRET) {
    console.warn("BILLING_WEBHOOK_SECRET not configured — accepting request (backward compatible)");
    return true;
  }
  
  if (!signature) return false;

  // Simple secret comparison (query param or header)
  if (signature === WEBHOOK_SECRET) return true;

  // HMAC verification
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBytes = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((b: string) => parseInt(b, 16)) || []
    );
    return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(body));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    const provider = new URL(req.url).searchParams.get("provider") || "fattureincloud";
    const bodyText = await req.text();
    
    // Fix #2: Verify webhook authenticity
    const isValid = await verifySignature(req, bodyText);
    if (!isValid) {
      console.warn("Rejected unauthorized webhook attempt from", req.headers.get("x-forwarded-for") || "unknown");
      // Log rejected attempt
      try {
        await supabase.from("billing_sync_log").insert({
          company_id: "00000000-0000-0000-0000-000000000000", // unknown
          provider,
          direction: "pull",
          action: "webhook",
          status: "error",
          error_message: "Unauthorized webhook: invalid or missing signature",
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
    return new Response("error", { status: 500 });
  }
});
