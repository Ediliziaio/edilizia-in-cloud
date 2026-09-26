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
 * GET  → { publicKey } — la chiave PUBBLICA, per iscrivere il browser con la
 *        stessa chiave che firma gli invii (26/09/2026: l'app ne teneva una copia
 *        fissa nel codice, che nessuno controllava combaciasse con il segreto).
 *
 * POST (solo chiamate interne: push-notifica con la chiave di servizio, o il
 * cron) body: {
 *   endpoint: string,
 *   p256dh: string,
 *   auth_key: string,
 *   title: string,
 *   body: string,
 *   url?: string,
 *   tag?: string
 * }
 * Iscrizione scaduta o revocata (il servizio push risponde 404/410): risponde
 * 410, così chi chiama la cancella.
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";

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

  // La chiave pubblica non è un segreto: serve al browser per iscriversi.
  if (req.method === "GET") {
    return jsonResponse({ publicKey: vapidPublicKey });
  }

  // Inviare invece sì: fino al 26/09/2026 bastava la chiave anon (pubblica) per
  // mandare, a nome nostro, una notifica con testo e link a scelta a qualunque
  // iscrizione di cui si conoscesse l'indirizzo. Nessuna pagina la chiama.
  if (!chiamataInternaValida(req)) {
    return rispostaNonAutorizzata(corsH);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  try {
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
      // La home porta ognuno alla sua area; il service worker accetta comunque
      // solo indirizzi del sito.
      url: url ?? "/",
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
    // web-push mette il codice HTTP in statusCode («Received unexpected response
    // code» è sempre lo stesso messaggio): cercare «410» nel testo non scattava
    // mai, e le iscrizioni morte restavano per sempre.
    const statusCode = (e as { statusCode?: number } | null)?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      return jsonResponse({ sent: false, reason: "subscription_expired" }, 410);
    }
    const msg = e instanceof Error ? e.message : "Errore interno";
    console.error("send-push error:", statusCode ?? "", msg);
    return errorResponse(msg, 500);
  }
});
