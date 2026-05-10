/**
 * silvio-action-runner — Cron pg_cron ogni 30s che processa silvio_action_queue.
 *
 * Flusso:
 *   1. Lock atomico: SELECT ... FOR UPDATE SKIP LOCKED su action_queue WHERE
 *      status='queued' AND scheduled_for <= now() LIMIT 10
 *   2. Per ogni action: dispatch al wrapper specifico (send_email, send_whatsapp, ...)
 *   3. Update status → 'done' | 'failed' (con retry max 3x exponential backoff)
 *   4. Log in silvio_action_log
 *
 * Auth: solo service_role (chiamato da pg_cron).
 *
 * Action types supportati V1:
 *   - send_email_lead_welcome
 *   - send_email_lead_followup
 *   - send_email_customer
 *   - send_email_dunning
 *   - book_meeting (stub, V2)
 *   - reply_to_ticket (stub, V2)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("SILVIO_FROM_EMAIL") ?? "silvio@ediliziaincloud.it";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BATCH = 10;
const RETRY_BACKOFF_SEC = [60, 300, 1800]; // 1min, 5min, 30min

interface ActionRow {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  workflow_run_id: string | null;
  step_index: number | null;
  initiated_by: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeSendEmail(payload: Record<string, any>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY non configurata" };
  }
  const to = payload.to;
  const subject = payload.subject;
  const html = payload.html ?? payload.body_md ?? payload.body ?? "";
  const text = payload.text;
  const replyTo = payload.reply_to;
  if (!to || !subject || (!html && !text)) {
    return { ok: false, error: "Payload incompleto: to, subject, html/text obbligatori" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: payload.from ?? FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        subject,
        html: html || undefined,
        text: text || undefined,
        reply_to: replyTo || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, result: { provider_message_id: data.id, provider: "resend" } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function dispatch(action: ActionRow): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const t = action.action_type;
  if (t.startsWith("send_email")) {
    return executeSendEmail(action.payload);
  }
  // V2 placeholders
  if (t === "send_whatsapp") {
    return { ok: false, error: "send_whatsapp non ancora implementato (V2 Twilio/360dialog)" };
  }
  if (t === "send_sms") {
    return { ok: false, error: "send_sms non ancora implementato (V2 Telnyx/Twilio)" };
  }
  if (t.startsWith("make_voice_call")) {
    return { ok: false, error: "make_voice_call non ancora implementato (V2 Vapi/Bland)" };
  }
  if (t === "book_meeting") {
    return { ok: false, error: "book_meeting non ancora implementato (V2 Cal.com)" };
  }
  if (t.startsWith("reply_to_ticket")) {
    return { ok: false, error: "reply_to_ticket: usa silvio_draft_ticket_reply + invio manuale per ora" };
  }
  return { ok: false, error: `action_type sconosciuto: ${t}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const t0 = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) Lock + claim batch via SELECT FOR UPDATE SKIP LOCKED (atomico)
    const { data: claimed, error: claimErr } = await supabase.rpc("silvio_action_queue_claim", {
      p_max: MAX_BATCH,
    });
    if (claimErr) {
      console.error("[action-runner] claim error:", claimErr);
      return jsonRes({ error: claimErr.message, processed: 0 }, 500);
    }

    const actions = (claimed ?? []) as ActionRow[];
    if (actions.length === 0) {
      return jsonRes({ ok: true, processed: 0, idle: true, duration_ms: Date.now() - t0 });
    }

    let succeeded = 0;
    let failed = 0;
    let retried = 0;

    for (const action of actions) {
      const startedAt = new Date().toISOString();
      const result = await dispatch(action);

      // Estrai contact info dal payload (per audit log)
      const payload = action.payload as Record<string, unknown>;
      const contactEmail = (payload.to as string) ?? null;

      if (result.ok) {
        // Success → mark done
        await supabase
          .from("silvio_action_queue")
          .update({
            status: "done",
            executed_at: new Date().toISOString(),
            result: result.result ?? {},
            attempts: action.attempts + 1,
          })
          .eq("id", action.id);

        // Log success
        await supabase.from("silvio_action_log").insert({
          action_id: action.id,
          action_type: action.action_type,
          contact_email: contactEmail,
          payload: action.payload,
          result: result.result ?? {},
          ok: true,
          initiated_by: action.initiated_by,
          cost_provider: action.action_type.startsWith("send_email") ? "resend" : null,
        });

        // Workflow advance (se action era step di workflow)
        if (action.workflow_run_id) {
          await supabase.rpc("silvio_workflow_advance", {
            p_run_id: action.workflow_run_id,
          }).catch((e) => console.warn("[action-runner] workflow advance:", e));
        }

        succeeded += 1;
      } else {
        // Failure → check retry
        const newAttempts = action.attempts + 1;
        const canRetry = newAttempts < action.max_attempts;
        const nextRetryAt = canRetry
          ? new Date(Date.now() + (RETRY_BACKOFF_SEC[Math.min(newAttempts - 1, 2)] * 1000)).toISOString()
          : null;

        if (canRetry) {
          await supabase
            .from("silvio_action_queue")
            .update({
              status: "queued",
              scheduled_for: nextRetryAt,
              attempts: newAttempts,
              last_error: result.error ?? "unknown",
              started_at: startedAt,
            })
            .eq("id", action.id);
          retried += 1;
        } else {
          await supabase
            .from("silvio_action_queue")
            .update({
              status: "failed",
              attempts: newAttempts,
              last_error: result.error ?? "unknown",
              executed_at: new Date().toISOString(),
            })
            .eq("id", action.id);

          // Alert critical: action fallita 3 volte
          await supabase.from("silvio_admin_alerts").insert({
            category: "ops",
            severity: "critical",
            title: `🔥 Action fallita 3x: ${action.action_type}`,
            description: `Azione id ${action.id.slice(0, 8)} ha fallito ${newAttempts} volte. Ultimo errore: ${result.error}`,
            related_entity: { type: "action", id: action.id },
            dedup_key: `action_failed:${action.id}`,
            suggested_action: "Verificare payload + provider config",
          });

          // Log final failure
          await supabase.from("silvio_action_log").insert({
            action_id: action.id,
            action_type: action.action_type,
            contact_email: contactEmail,
            payload: action.payload,
            result: { error: result.error },
            ok: false,
            error_message: result.error,
            initiated_by: action.initiated_by,
          });

          failed += 1;
        }
      }
    }

    return jsonRes({
      ok: true,
      processed: actions.length,
      succeeded,
      failed,
      retried,
      duration_ms: Date.now() - t0,
    });
  } catch (e) {
    console.error("[action-runner] fatal:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
