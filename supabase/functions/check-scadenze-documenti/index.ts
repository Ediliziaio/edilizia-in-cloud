/**
 * check-scadenze-documenti
 * Chiamata dal cron pg_cron alle 08:00 ogni giorno.
 * 1. Aggiorna stato scadenze documenti operai
 * 2. Trova documenti in scadenza/scaduti
 * 3. Crea notifiche nel DB (tabella notifications)
 * 4. Chiama send-push-notification per le subscription registrate
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Solo chiamate autorizzate (da cron o service role)
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader.includes(serviceKey) && !authHeader.includes("Bearer")) {
    return errorResponse("Non autorizzato", 401);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey,
  );

  try {
    const oggi = new Date().toISOString().split("T")[0]; // "yyyy-MM-dd"
    const fra30  = new Date(); fra30.setDate(fra30.getDate() + 30);
    const fra60  = new Date(); fra60.setDate(fra60.getDate() + 60);

    // ── 1. Aggiorna stati documenti ────────────────────────────────────────────
    const { data: updated, error: updateErr } = await supabaseAdmin.rpc(
      "aggiorna_stati_documenti_operai",
    );
    if (updateErr) {
      console.error("Errore aggiornamento stati:", updateErr.message);
    }
    console.log(`Stati aggiornati: ${updated ?? 0}`);

    // ── 2. Trova documenti che scadono nei prossimi 30 giorni o già scaduti ─────
    const { data: docs, error: docsErr } = await supabaseAdmin
      .from("documenti_operai")
      .select(
        "id, company_id, operaio_id, nome_file, data_scadenza, stato, tipo:tipi_documento_operaio(nome, alert_giorni_prima)",
      )
      .in("stato", ["scaduto", "in_scadenza"])
      .not("data_scadenza", "is", null);

    if (docsErr) {
      console.error("Errore fetch documenti:", docsErr.message);
      return errorResponse("Errore fetch documenti", 500);
    }

    console.log(`Documenti da notificare: ${docs?.length ?? 0}`);

    if (!docs || docs.length === 0) {
      return jsonResponse({ updated: updated ?? 0, notifiche: 0 });
    }

    // ── 3. Raggruppa per operaio e crea/aggiorna notifiche in DB ───────────────
    const notificheCreate: string[] = [];

    for (const doc of docs) {
      const tipoNome = (doc.tipo as { nome?: string } | null)?.nome ?? "Documento";
      const giorni = doc.data_scadenza
        ? Math.round(
            (new Date(doc.data_scadenza + "T00:00:00").getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;

      let titolo: string;
      let messaggio: string;

      if (giorni < 0) {
        titolo = `⚠️ Documento scaduto`;
        messaggio = `${tipoNome} è scaduto ${Math.abs(giorni)} giorni fa`;
      } else if (giorni === 0) {
        titolo = `⚠️ Documento scade oggi`;
        messaggio = `${tipoNome} scade oggi`;
      } else {
        titolo = `📋 Documento in scadenza`;
        messaggio = `${tipoNome} scade tra ${giorni} giorni`;
      }

      // Scrivi notifica nel DB (tabella notifications esistente)
      const { data: notif, error: notifErr } = await supabaseAdmin
        .from("notifications")
        .upsert(
          {
            company_id: doc.company_id,
            user_id: doc.operaio_id,
            title: titolo,
            message: messaggio,
            type: "documento_scadenza",
            reference_id: doc.id,
            reference_type: "documento_operaio",
            read: false,
          },
          {
            onConflict: "company_id,user_id,reference_id,type",
            ignoreDuplicates: false,
          },
        )
        .select("id")
        .single();

      if (!notifErr && notif?.id) {
        notificheCreate.push(notif.id);

        // ── 4. Invia push notification se l'utente ha una subscription ──────────
        const { data: subscriptions } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth_key")
          .eq("user_id", doc.operaio_id);

        for (const sub of subscriptions ?? []) {
          try {
            await supabaseAdmin.functions.invoke("send-push-notification", {
              body: {
                endpoint: sub.endpoint,
                p256dh: sub.p256dh,
                auth_key: sub.auth_key,
                title: titolo,
                body: messaggio,
                url: "/campo/documenti",
                tag: `doc-scadenza-${doc.id}`,
              },
            });
          } catch (pushErr) {
            console.warn(`Push fallita per ${sub.id}:`, pushErr);
          }
        }
      }
    }

    return jsonResponse({
      updated: updated ?? 0,
      notifiche: notificheCreate.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore interno";
    console.error("check-scadenze-documenti error:", msg);
    return errorResponse(msg, 500);
  }
});
