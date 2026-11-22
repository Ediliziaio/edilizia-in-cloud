/**
 * push-notifica — manda gli avvisi ai browser e ai dispositivi nativi dell'utente.
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

import { preparaInvioNativo, pushNativeConfigurate, type TokenNativo } from "../_shared/pushNativa.ts";

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
    const { data: tokens, error: erroreToken } = await admin.from("push_tokens")
      .select("id, user_id, token, platform").in("user_id", utenti.slice(0, 200));
    if (erroreToken) console.warn("[push-notifica] Lettura dispositivi non riuscita");
    const configurate = pushNativeConfigurate(Deno.env.get);
    const native = { token: tokens?.length ?? 0, inviate: 0, scadute: 0, configurato: configurate.android || configurate.ios };
    await Promise.allSettled(["ios", "android"].map(async piattaforma => {
      const dispositivi = (tokens ?? []).filter(t => t.platform === piattaforma) as TokenNativo[];
      if (!dispositivi.length) return;
      try {
        const invia = await preparaInvioNativo(piattaforma, Deno.env.get);
        if (!invia) return;
        for (let inizio = 0; inizio < dispositivi.length; inizio += 16) {
          const esiti = await Promise.allSettled(dispositivi.slice(inizio, inizio + 16).map(async t => {
            const esito = await invia(t, { url: body.url, tag: body.tag });
            if (esito === "inviata") native.inviate++;
            else if (esito === "scaduta") {
              // Non eliminare il token se nel frattempo è stato rinnovato o intestato a un altro accesso.
              await admin.from("push_tokens").delete().eq("id", t.id).eq("token", t.token).eq("user_id", t.user_id);
              native.scadute++;
            } else console.warn("[push-notifica] Dispositivo rifiutato da", piattaforma);
          }));
          if (esiti.some(e => e.status === "rejected")) console.warn("[push-notifica] Tentativo di invio interrotto su", piattaforma);
        }
      } catch {
        console.warn("[push-notifica] Servizio nativo non disponibile su", piattaforma);
      }
    }));
    return json(200, { ok: true, destinatari: utenti.length, iscrizioni: iscrizioni?.length ?? 0, inviate, scadute, native });
  } catch (e) {
    console.error("[push-notifica]", e);
    return json(500, { error: "Errore interno" });
  }
});
