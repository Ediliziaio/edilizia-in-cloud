import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  try {
    const provider = new URL(req.url).searchParams.get("provider") || "fattureincloud";
    const body = await req.json();

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
