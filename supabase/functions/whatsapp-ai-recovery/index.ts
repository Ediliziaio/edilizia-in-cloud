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

const MAX_ATTEMPTS = 5;
const STUCK_THRESHOLD_MIN = 3;
const BATCH_SIZE = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("CRON_SECRET") ?? Deno.env.get("INTERNAL_CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!cronSecret || provided !== cronSecret) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const threshold = new Date(Date.now() - STUCK_THRESHOLD_MIN * 60_000).toISOString();

  const { data: stuck, error: queryErr } = await supabase
    .from("whatsapp_messages")
    .select("id, processing_attempts, company_id")
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

  let processed = 0;
  let failed = 0;

  for (const msg of stuck) {
    const currentAttempts = msg.processing_attempts ?? 0;
    const nextAttempts = currentAttempts + 1;

    // Incrementa counter + timestamp PRIMA di tentare: così se il fetch
    // crasha restiamo con counter aggiornato al prossimo giro.
    await supabase
      .from("whatsapp_messages")
      .update({
        processing_attempts: nextAttempts,
        last_processing_attempt_at: new Date().toISOString(),
      })
      .eq("id", msg.id);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-ai-processor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({ message_id: msg.id }),
      });
      if (!res.ok) {
        throw new Error(`Processor returned status ${res.status}`);
      }
      processed++;
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp-ai-recovery] Attempt ${nextAttempts}/${MAX_ATTEMPTS} failed for ${msg.id}: ${errMsg}`);

      if (nextAttempts >= MAX_ATTEMPTS) {
        await supabase
          .from("whatsapp_messages")
          .update({
            processing_status: "failed_max_retries",
            processing_error: errMsg,
          })
          .eq("id", msg.id);
      } else {
        await supabase
          .from("whatsapp_messages")
          .update({ processing_error: errMsg })
          .eq("id", msg.id);
      }
    }
  }

  return new Response(
    JSON.stringify({ stuck: stuck.length, processed, failed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
