/**
 * fea-genera-otp-sms
 * Genera un OTP per una signature_request e lo invia via SMS (Telnyx).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getCorsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const telnyxApiKey = Deno.env.get("TELNYX_API_KEY");
    const telnyxFrom = Deno.env.get("TELNYX_FROM_NUMBER");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { signature_request_id, phone } = body as { signature_request_id: string; phone: string };

    if (!signature_request_id || !phone) {
      return errorResponse("signature_request_id e phone sono obbligatori", 400);
    }

    // Genera OTP a 6 cifre
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const scadenza = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minuti

    // Hash OTP con SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(otp);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const otpHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Aggiorna signature_request con hash + scadenza + telefono + canale
    const { error: updateErr } = await supabase
      .from("signature_requests")
      .update({
        otp_hash: otpHash,
        otp_scadenza: scadenza,
        signer_phone: phone,
        otp_canale: "sms",
      })
      .eq("id", signature_request_id);

    if (updateErr) throw updateErr;

    // Invia SMS via Telnyx (se configurato)
    if (telnyxApiKey && telnyxFrom) {
      const smsBody = {
        from: telnyxFrom,
        to: phone,
        text: `Il tuo codice OTP per la firma digitale è: ${otp}. Valido 15 minuti.`,
      };

      const smsRes = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${telnyxApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(smsBody),
      });

      if (!smsRes.ok) {
        console.error("Telnyx SMS error:", {
          status:     smsRes.status,
          statusText: smsRes.statusText,
        });
        return errorResponse("Errore invio SMS", 502);
      }
    } else {
      console.warn("[fea-genera-otp-sms] Telnyx non configurato: OTP generato ma SMS non inviato", {
        signature_request_id,
      });
    }

    return jsonResponse({ success: true, message: "OTP inviato via SMS" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("fea-genera-otp-sms error:", message);
    return errorResponse(message, 500);
  }
});
