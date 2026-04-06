/**
 * send-push-notification
 * Invia una notifica Web Push a una subscription specifica.
 * Usa il protocollo VAPID (RFC 8292) con npm:web-push.
 *
 * Segreti Supabase richiesti:
 *   VAPID_PUBLIC_KEY  — chiave pubblica VAPID (Base64url)
 *   VAPID_PRIVATE_KEY — chiave privata VAPID (Base64url)
 *   VAPID_SUBJECT     — es. "mailto:admin@tuazienda.it"
 *
 * Generazione: npx web-push generate-vapid-keys
 *
 * POST body: {
 *   endpoint: string,
 *   p256dh: string,
 *   auth_key: string,
 *   title: string,
 *   body: string,
 *   url?: string,
 *   tag?: string
 * }
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

// Usa npm: specifier (supportato in Supabase Edge Functions / Deno 1.37+)
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);

  const vapidPublicKey  = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject    = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@ediliziaincloud.it";

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("Chiavi VAPID mancanti — configura VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY");
    return errorResponse("Configurazione VAPID mancante", 503);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  try {
    // Accetta sia chiamate autenticate (dal frontend) sia da edge function interne
    let body: Record<string, string>;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Body JSON non valido");
    }

    const { endpoint, p256dh, auth_key, title, body: msgBody, url, tag } = body;
    if (!endpoint || !p256dh || !auth_key || !title) {
      return errorResponse("Parametri obbligatori mancanti: endpoint, p256dh, auth_key, title");
    }

    const payload = JSON.stringify({
      title,
      body: msgBody ?? "",
      url: url ?? "/azienda/personale?tab=documenti",
      tag: tag ?? "eic",
    });

    const subscription = {
      endpoint,
      keys: { p256dh, auth: auth_key },
    };

    await webpush.sendNotification(subscription, payload, {
      TTL: 86400, // 24h
    });

    return jsonResponse({ sent: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore interno";
    // 410 Gone = subscription scaduta/revocata → gestisci sul chiamante
    if (msg.includes("410") || msg.includes("Gone")) {
      return jsonResponse({ sent: false, reason: "subscription_expired" }, 200);
    }
    console.error("send-push error:", msg);
    return errorResponse(msg, 500);
  }
});
