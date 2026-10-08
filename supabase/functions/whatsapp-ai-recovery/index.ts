// NB: il cron whatsapp-ai-recovery (jobid 38) è disabilitato — riabilitare dopo il deploy di questo fix.
// P1-1: cron recovery per messaggi WhatsApp stuck in processing_status='received'.
// whatsapp-webhook invoca whatsapp-ai-processor in fire-and-forget; se il
// processor era giù/lento/rate-limited il messaggio restava 'received' per
// sempre. Questo cron (ogni 5 min) riprende i messaggi con:
//   - processing_status = 'received'
//   - created_at più vecchio di STUCK_THRESHOLD_MIN
//   - processing_attempts < MAX_ATTEMPTS
// e li re-invoca. Dopo MAX_ATTEMPTS fallimenti → processing_status='failed_max_retries'.
//
// Auth: solo cron via header x-cron-secret (stesso pattern di retry-failed-webhooks).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { serveConMetriche } from "../_shared/withMetrics.ts";
import { recoverMessage } from "./recoverMessage.ts";
import { recoveryBatch } from "./recoveryBatch.ts";
const MAX_ATTEMPTS = 5;
const STUCK_THRESHOLD_MIN = 3;
const BATCH_SIZE = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serveConMetriche("whatsapp-ai-recovery", async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  // Il cron invia x-cron-secret := current_setting('app.internal_cron_secret'),
  // che corrisponde alla env INTERNAL_CRON_SECRET (stesso pattern di
  // whatsapp-send / whatsapp-operational-reminders). CRON_SECRET resta come
  // fallback legacy per non regredire installazioni che settano solo quello.
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET") ?? Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!cronSecret || provided !== cronSecret) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // whatsapp-ai-processor rifiuta le chiamate senza x-internal-worker-key valido
  // (503/401): senza chiave reale ogni re-invocazione fallirebbe e brucerebbe i
  // tentativi. Meglio fermarsi qui con 503 che inoltrare una chiave vuota.
  const workerKey = Deno.env.get("INTERNAL_WORKER_KEY");
  if (!workerKey) {
    console.error("[whatsapp-ai-recovery] INTERNAL_WORKER_KEY non configurato: il processor rifiuterebbe ogni chiamata. Stop.");
    return new Response(
      JSON.stringify({ error: "service_unavailable", reason: "missing_worker_key" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const threshold = new Date(Date.now() - STUCK_THRESHOLD_MIN * 60_000).toISOString();

  // Anche un crash dopo la prenotazione dell'ultimo tentativo deve emergere.
  // Non tocca mai messaggi processing: esito potenzialmente già eseguito.
  const { error: exhaustedError } = await supabase.from("whatsapp_messages")
    .update({ processing_status: "failed_max_retries", processing_error: "recovery_attempts_exhausted" })
    .eq("direction", "inbound").eq("processing_status", "received")
    .gte("processing_attempts", MAX_ATTEMPTS).lt("last_processing_attempt_at", threshold);
  if (exhaustedError) return new Response(JSON.stringify({ error: "recovery_state_unavailable" }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: stuck, error: queryErr } = await supabase
    .from("whatsapp_messages")
    .select("id, processing_attempts, company_id, wa_number_id, from_phone")
    .eq("direction", "inbound")
    .eq("processing_status", "received")
    .lt("created_at", threshold)
    .lt("processing_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queryErr) {
    console.error("[whatsapp-ai-recovery] Query error:", queryErr);
    return new Response(
      JSON.stringify({ error: queryErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!stuck || stuck.length === 0) {
    return new Response(
      JSON.stringify({ stuck: 0, processed: 0, failed: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { processed, failed, skipped } = await recoveryBatch(stuck,
    msg => JSON.stringify([msg.company_id, msg.wa_number_id, msg.from_phone]),
    msg => recoverMessage(supabase, msg, () => fetch(`${supabaseUrl}/functions/v1/whatsapp-ai-processor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "x-cron-secret": cronSecret,
          "x-internal-worker-key": workerKey,
        },
        body: JSON.stringify({ message_id: msg.id }),
        signal: AbortSignal.timeout(30_000),
      }), MAX_ATTEMPTS));

  return new Response(
    JSON.stringify({ stuck: stuck.length, processed, failed, skipped }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
