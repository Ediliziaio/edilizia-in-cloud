/**
 * process-scheduled-campaigns — fa partire le campagne email pianificate.
 *
 * Gira dal cron ogni 5 minuti: prende le campagne `scheduled` arrivate all'ora
 * e le passa a send-email-campaign, una alla volta.
 *
 * 24/09/2026: il cron non era MAI esistito. La migrazione di luglio lo creava
 * con `app.supabase_url` e `app.cron_secret`, parametri che su questo database
 * non ci sono: nessuna campagna pianificata è mai partita. Il cron adesso sta
 * in 20280924213000_email_campagne_pianificate_e_statistiche.sql.
 *
 * Tre cose cambiate insieme al cron:
 *  - a pg_net si risponde subito (serveConMetricheRapida): l'invio vero può
 *    durare minuti, e la coda dei cron è una sola;
 *  - chi chiama si controlla con chiamataInterna (i tre segreti dei cron, o la
 *    chiave di servizio), come le altre funzioni dei cron;
 *  - una campagna in ritardo di più di un giorno NON parte da sola: torna in
 *    bozza. Un'offerta pensata per il 31 luglio non deve arrivare a settembre
 *    perché il cron è stato fermo; decide chi l'ha scritta.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";

/** Oltre questo ritardo una campagna pianificata non parte da sola. */
const RITARDO_MASSIMO_ORE = 24;

serveConMetricheRapida("process-scheduled-campaigns", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata(cors);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const adesso = new Date();

    // ── SWEEPER anti-stuck: una campagna può restare in 'sending' per sempre
    // se send-email-campaign muore a metà (timeout edge runtime) — nessuno la
    // ripescava e i destinatari rimanenti non ricevevano mai nulla. Requeue a
    // 'scheduled' dopo 60 min: il claim CAS qui sotto la riprende e
    // send-email-campaign salta i destinatari già consegnati (dedup su
    // email_logs + idempotency_key in email_outbox).
    const stuckBefore = new Date(adesso.getTime() - 60 * 60 * 1000).toISOString();
    const { data: requeued } = await adminClient
      .from("email_campaigns")
      .update({ status: "scheduled" })
      .eq("status", "sending")
      .lt("updated_at", stuckBefore)
      .select("id");
    if (requeued?.length) {
      console.warn(`[process-scheduled-campaigns] requeued ${requeued.length} stuck 'sending' campaigns:`, requeued.map((r: { id: string }) => r.id).join(","));
    }

    // Troppo in ritardo: tornano in bozza, con la data che avevano, invece di
    // partire adesso. Chi le apre vede «Bozza» e ripianifica se ha ancora senso.
    const limiteRitardo = new Date(adesso.getTime() - RITARDO_MASSIMO_ORE * 3_600_000).toISOString();
    const { data: scadute } = await adminClient
      .from("email_campaigns")
      .update({ status: "draft" })
      .eq("status", "scheduled")
      .lt("scheduled_at", limiteRitardo)
      .select("id, name");
    if (scadute?.length) {
      console.warn(`[process-scheduled-campaigns] ${scadute.length} campagne in ritardo di oltre ${RITARDO_MASSIMO_ORE} ore tornate in bozza:`, scadute.map((c: { id: string }) => c.id).join(","));
    }

    // Le campagne arrivate all'ora, fino a 20 per giro.
    const { data: campaigns, error: campError } = await adminClient
      .from("email_campaigns")
      .select("id, name, company_id, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", adesso.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (campError) throw campError;

    let triggered = 0;
    const errors: { id: string; error: string }[] = [];

    for (const campaign of campaigns ?? []) {
      try {
        // Presa in carico atomica: solo se è ancora 'scheduled'. Due giri
        // sovrapposti non possono mandare la stessa campagna due volte.
        const { data: lockedCampaign, error: lockError } = await adminClient
          .from("email_campaigns")
          .update({ status: "sending", sent_at: new Date().toISOString() })
          .eq("id", campaign.id)
          .eq("status", "scheduled")
          .select("id")
          .maybeSingle();

        if (lockError) {
          errors.push({ id: campaign.id, error: lockError.message });
          continue;
        }
        if (!lockedCampaign) continue;

        // send-email-campaign accetta la chiave di servizio come chiamata interna.
        const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email-campaign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ campaignId: campaign.id }),
        });

        if (!sendRes.ok) {
          const errBody = await sendRes.json().catch(() => ({}));
          await adminClient.from("email_campaigns").update({ status: "failed" }).eq("id", campaign.id);
          errors.push({ id: campaign.id, error: (errBody as { error?: string }).error || `HTTP ${sendRes.status}` });
        } else {
          triggered++;
        }
      } catch (err) {
        await adminClient.from("email_campaigns").update({ status: "failed" }).eq("id", campaign.id);
        errors.push({ id: campaign.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, triggered, tornate_in_bozza: scadute?.length ?? 0, errors }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Errore interno" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
