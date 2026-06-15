/**
 * outreach-track-open — pixel di APERTURA per il cold outreach (opt-in).
 *
 * Chiamato direttamente dai client di posta del prospect (verify_jwt=false), serve
 * una GIF 1×1 trasparente e registra l'apertura sulla riga `outreach_send_queue`
 * identificata dal parametro `q`. A differenza di `email-tracking` (campagne,
 * ancorato a email_logs/campaign_id) qui la chiave è l'id della riga di coda
 * outreach: per questo è un endpoint dedicato.
 *
 *   GET /outreach-track-open?q=<send_queue_id>&sig=<hmac>
 *     → update outreach_send_queue
 *          set open_count = open_count + 1,
 *              opened_at  = coalesce(opened_at, now())
 *        where id = q
 *     → 200 image/gif (1×1 trasparente), no-store.
 *
 * SEC: la firma HMAC (`outreach_open|<queueId>`, segreto EMAIL_TRACKING_SECRET)
 * viene verificata constant-time prima di scrivere — senza firma chiunque
 * indovini l'UUID potrebbe gonfiare i contatori. Fail-safe: se il segreto NON è
 * configurato si serve comunque la GIF ma NON si registra nulla (coerente con il
 * dispatcher che, senza segreto, non inietta proprio il pixel). Il pixel viene
 * iniettato SOLO per le sequenze con track_opens=true (default OFF → cold protetto).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secureHeaders } from "../_shared/headers.ts";
import { getEmailTrackingSecret, verifyOutreachOpenSig } from "../_shared/emailTrackingSignature.ts";

// GIF 1×1 trasparente (stessa del tracking campagne).
const PIXEL_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

function pixelResponse(): Response {
  return new Response(PIXEL_GIF, {
    status: 200,
    headers: {
      ...secureHeaders,
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

Deno.serve(async (req) => {
  // Solo GET (è un'immagine): qualsiasi altro metodo → pixel innocuo, niente scrittura.
  const url = new URL(req.url);
  const queueId = url.searchParams.get("q");
  const sig = url.searchParams.get("sig");

  // Senza id valido non c'è nulla da registrare: serviamo comunque la GIF.
  if (!queueId) return pixelResponse();

  // SEC: verifica firma HMAC. In assenza del segreto NON registriamo (fail-safe):
  // il dispatcher, senza segreto, non inietta nemmeno il pixel — qui chiudiamo il
  // cerchio non scrivendo eventi non firmabili. La GIF si serve sempre.
  const secret = getEmailTrackingSecret();
  if (!secret) {
    console.warn("outreach-track-open: EMAIL_TRACKING_SECRET non configurato — apertura non registrata");
    return pixelResponse();
  }
  const valid = await verifyOutreachOpenSig(secret, queueId, sig);
  if (!valid) {
    console.warn("outreach-track-open: firma assente/non valida — apertura ignorata", { queueId });
    return pixelResponse();
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const now = new Date().toISOString();

    // Incremento atomico via RPC se disponibile; altrimenti read-modify-write.
    // L'RPC `outreach_register_open` (migrazione 20270821000000) fa
    // open_count+1 e opened_at=coalesce in un solo statement (no race).
    const { error: rpcErr } = await admin.rpc("outreach_register_open", { p_queue_id: queueId });
    if (rpcErr) {
      // Fallback se l'RPC non è ancora applicata: leggi + scrivi (best-effort).
      const { data: row } = await admin
        .from("outreach_send_queue")
        .select("open_count, opened_at")
        .eq("id", queueId)
        .maybeSingle();
      if (row) {
        await admin
          .from("outreach_send_queue")
          .update({
            open_count: ((row as { open_count: number | null }).open_count ?? 0) + 1,
            opened_at: (row as { opened_at: string | null }).opened_at ?? now,
          })
          .eq("id", queueId);
      }
    }
  } catch (err) {
    console.error("outreach-track-open error:", err instanceof Error ? err.message : err);
    // Non rompere il rendering dell'email: serviamo la GIF comunque.
  }

  return pixelResponse();
});
