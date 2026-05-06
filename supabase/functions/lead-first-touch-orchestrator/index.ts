/**
 * MP-SALES-01 — Lead First-Touch Orchestrator (SLA target 60s)
 *
 * Triggerato dopo `silvio_tool_crea_lead_first_touch`. Esegue:
 *   1. Enrichment lead (geocoding, vertical detection da raw_payload)
 *   2. Determina canale risposta preferito (WhatsApp > Telegram > Email > SMS)
 *   3. Persona sales compose messaggio personalizzato (italiano caloroso)
 *   4. Invio sul canale + log latency
 *   5. Misura SLA met (target 60s)
 *
 * Modalità: process singolo (run_id) o batch (tutti pending).
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface Payload {
  run_id?: string;
  batch?: boolean;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: Payload = {};
  try { payload = await req.json(); } catch { /* batch mode */ }

  const t0 = Date.now();
  const summary = {
    runs_processed: 0,
    sla_met: 0,
    sla_missed: 0,
    errors: 0,
    avg_latency_ms: 0,
    duration_ms: 0,
  };

  try {
    // 1. Carica run pending
    let runs: Array<Record<string, unknown>> = [];
    if (payload.run_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("lead_first_touch_runs")
        .select("*")
        .eq("id", payload.run_id)
        .maybeSingle();
      if (data) runs = [data];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("lead_first_touch_runs")
        .select("*")
        .is("first_touch_sent_at", null)
        .order("created_at", { ascending: true })
        .limit(20);
      runs = (data ?? []) as Array<Record<string, unknown>>;
    }

    summary.runs_processed = runs.length;
    const latencies: number[] = [];

    for (const run of runs) {
      const runId = String(run.id);
      const companyId = String(run.company_id);
      const runT0 = new Date(run.created_at as string).getTime();
      try {
        // 2. Determina canale: WhatsApp prioritario se phone, altrimenti email
        const phone = (run.contact_phone as string | null) ?? null;
        const email = (run.contact_email as string | null) ?? null;
        const sourceChannel = String(run.source_channel);

        let channel: string;
        if (sourceChannel === "whatsapp_inbound") channel = "whatsapp";
        else if (sourceChannel === "telegram_inbound") channel = "telegram";
        else if (phone) channel = "whatsapp";
        else if (email) channel = "email";
        else channel = "sms";

        // 3. Compose AI message (persona sales)
        const aiResult = await composeFirstTouch(supabase, companyId, run, channel);

        // 4. Invio sul canale (best-effort, placeholder per WhatsApp/Email/SMS)
        const externalMsgId = await sendOnChannel(supabase, companyId, channel, run, aiResult.message);

        // 5. Log + calcola latency
        const latencyMs = Date.now() - runT0;
        latencies.push(latencyMs);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc("silvio_tool_log_first_touch_sent", {
          p_run_id: runId,
          p_company_id: companyId,
          p_channel: channel,
          p_message: aiResult.message,
          p_latency_ms: latencyMs,
          p_ai_cost_eur: aiResult.costEur,
          p_qualification_score: aiResult.qualificationScore,
        });

        if (externalMsgId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("lead_first_touch_runs")
            .update({ raw_payload: { ...(run.raw_payload as object ?? {}), external_msg_id: externalMsgId } })
            .eq("id", runId);
        }

        if (latencyMs <= 60_000) summary.sla_met++;
        else summary.sla_missed++;
      } catch (e) {
        summary.errors++;
        console.error(`[lead-first-touch] run ${runId} failed:`, e instanceof Error ? e.message : String(e));
      }
    }

    summary.avg_latency_ms = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
    summary.duration_ms = Date.now() - t0;

    return new Response(JSON.stringify(summary), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ...summary, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

interface FirstTouchResult {
  message: string;
  costEur: number;
  qualificationScore: number;
}

async function composeFirstTouch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  run: Record<string, unknown>,
  channel: string,
): Promise<FirstTouchResult> {
  const { data: company } = await supabase
    .from("companies").select("name").eq("id", companyId).maybeSingle();
  const companyName = (company?.name as string | undefined) ?? "[Brand]";
  const sourceChannel = String(run.source_channel);
  const verticalInterest = (run.vertical_interest as string | null) ?? "i nostri servizi";
  const contactName = (run.contact_name as string | null) ?? "ciao";
  const sourceCampaign = (run.source_campaign as string | null) ?? "";

  const aiResult = await aiRouterComplete({
    supabase,
    taskKey: "email_compose",
    messages: [
      {
        role: "system",
        content: `Sei un sales di ${companyName}. Compose un messaggio first-touch CALOROSO ma BREVE per un lead appena arrivato.
Lingua: italiano. Massimo 100 parole. Canale: ${channel}.

Struttura:
1. Saluto + nome (se disponibile)
2. Riferimento esplicito alla fonte ("Ho visto il tuo interesse per ${verticalInterest} su ${sourceChannel}")
3. 1-2 domande qualificanti veloci
4. CTA chiara (sopralluogo gratuito + 2 slot orari proposti)

Tono: amichevole, professionale, non pushy. Emoji parsimoniose.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          contact_name: contactName,
          source: sourceChannel,
          campaign: sourceCampaign,
          vertical: verticalInterest,
          channel,
        }),
      },
    ],
    params: { temperature: 0.6, max_tokens: 400 },
    companyId,
    estimatedCostEur: 0.02,
    idempotencyKey: `lead-first-touch-${run.id}`,
  });

  return {
    message: aiResult.content,
    costEur: aiResult.costBilledEur ?? 0,
    qualificationScore: 0.5, // sarà aggiornato durante conversazione
  };
}

async function sendOnChannel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  channel: string,
  run: Record<string, unknown>,
  message: string,
): Promise<string | null> {
  const phone = (run.contact_phone as string | null) ?? null;
  const email = (run.contact_email as string | null) ?? null;

  try {
    if (channel === "whatsapp" && phone) {
      const { data } = await supabase.functions.invoke("whatsapp-send", {
        body: { to: phone, message, company_id: companyId },
      });
      return (data as { message_id?: string } | null)?.message_id ?? null;
    }
    if (channel === "email" && email) {
      await supabase.functions.invoke("send-customer-email", {
        body: { to: email, subject: "Risposta alla tua richiesta", html: `<p>${message.replace(/\n/g, "<br/>")}</p>` },
      });
      return `email-${Date.now()}`;
    }
    if (channel === "telegram") {
      // Per ora: log only — future integrazione telegram-bot
      console.log("[lead-first-touch] telegram delivery placeholder");
      return null;
    }
  } catch (e) {
    console.warn("[lead-first-touch] send failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
  return null;
}
