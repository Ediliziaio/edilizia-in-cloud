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
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsH, "Content-Type": "application/json" } });

  const secret = Deno.env.get("INTERNAL_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
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
    for (const s of (iscrizioni ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth_key: string }>) {
      try {
        const res = await fetch(`${url}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({
            endpoint: s.endpoint, p256dh: s.p256dh, auth_key: s.auth_key,
            title, body: body.body ?? "", url: body.url ?? "/campo", tag: body.tag ?? "campo",
          }),
        });
        if (res.ok) inviate++;
        else if (res.status === 404 || res.status === 410) {
          // Iscrizione morta (browser disinstallato, permesso tolto): via.
          await admin.from("push_subscriptions").delete().eq("id", s.id); scadute++;
        }
      } catch (e) {
        console.warn("[push-notifica] invio fallito:", e instanceof Error ? e.message : e);
      }
    }
    return json(200, { ok: true, destinatari: utenti.length, iscrizioni: iscrizioni?.length ?? 0, inviate, scadute });
  } catch (e) {
    console.error("[push-notifica]", e);
    return json(500, { error: "Errore interno" });
  }
});
