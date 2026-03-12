import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Require webhook secret
    const secret = Deno.env.get("BILLING_WEBHOOK_SECRET");
    if (!secret) {
      console.error("BILLING_WEBHOOK_SECRET not configured — rejecting webhook");
      return new Response("Server configuration error", { status: 500 });
    }

    // Verify signature
    const signature = req.headers.get("x-webhook-signature") || req.headers.get("x-signature");
    if (!signature) {
      // Log rejected attempt
      await supabase.from("sdi_log").insert({
        company_id: "00000000-0000-0000-0000-000000000000",
        evento: "webhook_rejected",
        messaggio: "Missing signature header",
      }).catch(() => {});
      return new Response("Unauthorized: missing signature", { status: 401 });
    }

    const body = await req.text();

    // HMAC verification
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const expectedSig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

    if (signature !== expectedSig) {
      await supabase.from("sdi_log").insert({
        company_id: "00000000-0000-0000-0000-000000000000",
        evento: "webhook_rejected",
        messaggio: "Invalid signature",
      }).catch(() => {});
      return new Response("Unauthorized: invalid signature", { status: 401 });
    }

    // Parse notification from XML body
    // Extract key fields using simple regex (avoid full XML parser in edge)
    const tipoNotifica = extractTag(body, "TipoNotifica") || extractTag(body, "tipo_notifica") || "";
    const idTrasmissione = extractTag(body, "IdentificativoSdI") || extractTag(body, "sdi_id") || "";
    const erroriRaw = extractTag(body, "Errore") || extractTag(body, "ListaErrori");

    if (!idTrasmissione) {
      return new Response("Missing IdentificativoSdI", { status: 400 });
    }

    // Look up document
    const { data: doc } = await supabase
      .from("documenti_fiscali")
      .select("id, company_id, stato")
      .eq("sdi_id_trasmissione", idTrasmissione)
      .single();

    if (!doc) {
      // Log unknown SDI ID
      await supabase.from("sdi_log").insert({
        company_id: "00000000-0000-0000-0000-000000000000",
        evento: "webhook_unknown",
        sdi_id: idTrasmissione,
        messaggio: `Documento non trovato per SDI ID: ${idTrasmissione}`,
        xml_content: body.slice(0, 5000),
      }).catch(() => {});
      return new Response("OK", { status: 200 });
    }

    // Map notification type to new stato
    let newStato: string | null = null;
    const tipo = tipoNotifica.toUpperCase();

    switch (tipo) {
      case "RC":
        newStato = "consegnata";
        break;
      case "NS":
        newStato = "rifiutata";
        break;
      case "MC":
        // Mancata consegna — SDI deposits in cassetto fiscale, keep current stato
        newStato = null;
        break;
      case "EC":
        // Check EC01 (accepted) or EC02 (rejected)
        if (body.includes("EC01") || body.includes("Accettazione")) {
          newStato = "accettata";
        } else if (body.includes("EC02") || body.includes("Rifiuto")) {
          newStato = "rifiutata";
        }
        break;
      case "DT":
        newStato = "accettata"; // Tacit acceptance
        break;
      default:
        // Unknown type, just log
        break;
    }

    // Update document
    const updateData: Record<string, any> = {
      sdi_stato: tipo || tipoNotifica,
      sdi_notifica_tipo: tipoNotifica,
    };
    if (newStato) updateData.stato = newStato;
    if (tipo === "RC") updateData.sdi_data_consegna = new Date().toISOString();
    if (erroriRaw) updateData.sdi_errori = [{ tipo: tipoNotifica, messaggio: erroriRaw }];

    await supabase.from("documenti_fiscali")
      .update(updateData)
      .eq("id", doc.id);

    // Log
    await supabase.from("sdi_log").insert({
      company_id: doc.company_id,
      documento_id: doc.id,
      evento: "notifica_sdi",
      sdi_id: idTrasmissione,
      tipo_notifica: tipoNotifica,
      messaggio: `Notifica ${tipoNotifica}${newStato ? ` → stato: ${newStato}` : ""}`,
      xml_content: body.slice(0, 5000),
    });

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("sdi-webhook error:", e);
    return new Response("Internal error", { status: 500 });
  }
});

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}
