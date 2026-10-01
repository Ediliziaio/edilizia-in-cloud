/**
 * push-notifica — manda una Web Push a uno o più utenti.
 *
 * Chiamata dal database (trigger → pg_net) con header `x-cron-secret`:
 * niente JWT utente, perché a scatenarla è un evento (rapportino approvato,
 * assegnazione a un cantiere, promemoria, messaggio in chat di cantiere).
 *
 * Body: { user_id?: string, user_ids?: string[], title: string, body?: string, url?: string, tag?: string }
 * Per ogni iscrizione push dell'utente (tabella push_subscriptions) inoltra a
 * send-push-notification, che fa l'invio VAPID vero e proprio.
 *
 * 26/09/2026: gli invii partono tutti insieme (prima uno dopo l'altro, dentro
 * gli 8 secondi che pg_net concede) e a pg_net si risponde subito
 * (serveConMetricheRapida): una funzione lenta ferma la coda di tutti i cron.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { chiamataInternaValida } from "../_shared/chiamataInterna.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";

// Access token FCM HTTP v1 dal service account (JWT RS256 → oauth2). Niente
// dipendenze: WebCrypto basta.
async function tokenFcm(sa: { client_email: string; private_key: string; token_uri?: string }): Promise<string> {
  const b64 = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "RS256", typ: "JWT" });
  const claims = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  const sigB64 = btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${sigB64}` }),
  });
  if (!res.ok) throw new Error(`oauth2 ${res.status}`);
  return (await res.json()).access_token as string;
}

serveConMetricheRapida("push-notifica", async (req: Request) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsH, "Content-Type": "application/json" } });

  // Il segreto del cron (quello che manda campo_push_invia) o la chiave di servizio.
  if (!chiamataInternaValida(req)) {
    return json(401, { error: "Non autorizzato" });
  }

  try {
    const body = await req.json();
    const utenti: string[] = Array.isArray(body.user_ids)
      ? body.user_ids
      : body.user_id ? [body.user_id] : [];
    const title = String(body.title ?? "").trim();
    if (!utenti.length || !title) return json(400, { error: "user_id(s) e title obbligatori" });

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: iscrizioni, error } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", utenti.slice(0, 200));
    if (error) return json(500, { error: error.message });

    let inviate = 0, scadute = 0;
    const esiti = await Promise.allSettled(
      ((iscrizioni ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth_key: string }>).map(async (s) => {
        const res = await fetch(`${url}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({
            endpoint: s.endpoint, p256dh: s.p256dh, auth_key: s.auth_key,
            title, body: body.body ?? "", url: body.url ?? "/", tag: body.tag ?? "campo",
          }),
        });
        if (res.ok) {
          inviate++;
        } else if (res.status === 404 || res.status === 410) {
          // Iscrizione morta (browser disinstallato, permesso tolto): via.
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          scadute++;
        } else {
          console.warn("[push-notifica] invio non riuscito:", res.status);
        }
      }),
    );
    for (const e of esiti) {
      if (e.status === "rejected") console.warn("[push-notifica] invio fallito:", e.reason instanceof Error ? e.reason.message : e.reason);
    }
    // ── App nativa (Capacitor): token FCM in push_tokens. Serve il service account
    //    Firebase nel secret FCM_SERVICE_ACCOUNT_JSON; senza, si conta e basta.
    let native = { token: 0, inviate: 0, scadute: 0, configurato: false };
    const { data: tokens } = await admin.from("push_tokens").select("id, token, platform").in("user_id", utenti.slice(0, 200));
    native.token = tokens?.length ?? 0;
    const saJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
    if (native.token > 0 && saJson) {
      native.configurato = true;
      try {
        const accessToken = await tokenFcm(JSON.parse(saJson));
        const projectId = JSON.parse(saJson).project_id;
        for (const t of tokens as Array<{ id: string; token: string; platform: string }>) {
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ message: {
              token: t.token,
              notification: { title, body: String(body.body ?? "") },
              data: { url: String(body.url ?? "/campo"), tag: String(body.tag ?? "campo") },
              android: { priority: "high", notification: { channel_id: "campo" } },
              apns: { payload: { aps: { sound: "default" } } },
            } }),
          });
          if (res.ok) native.inviate++;
          else {
            const txt = await res.text();
            if (res.status === 404 || /UNREGISTERED|NOT_FOUND/.test(txt)) { await admin.from("push_tokens").delete().eq("id", t.id); native.scadute++; }
            else console.warn("[push-notifica] FCM", res.status, txt.slice(0, 160));
          }
        }
      } catch (e) {
        console.warn("[push-notifica] FCM non disponibile:", e instanceof Error ? e.message : e);
      }
    }
    return json(200, { ok: true, destinatari: utenti.length, iscrizioni: iscrizioni?.length ?? 0, inviate, scadute, native });
  } catch (e) {
    console.error("[push-notifica]", e);
    return json(500, { error: "Errore interno" });
  }
});
