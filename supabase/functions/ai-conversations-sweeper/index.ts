/**
 * ai-conversations-sweeper — riconciliazione chiamate vocali appese
 *
 * IL PROBLEMA CHE RISOLVE (pattern soldi, stesso del render):
 * initiate-outbound-call crea la conversazione con status='in_progress' e la
 * chiusura arriva SOLO dal webhook post-call di ElevenLabs. Se quel webhook si
 * perde (outage, secret ruotato, rete), la chiamata resta aperta per sempre e
 * — peggio — NON viene mai fatturata: costo ElevenLabs pagato da noi, crediti
 * del cliente mai scalati. Un cron "verde" non dice nulla: serve chi va a
 * chiedere a ElevenLabs com'è finita davvero.
 *
 * COME LO RISOLVE (zero duplicazione della pipeline):
 * per ogni conversazione in_progress più vecchia di GRACE_MINUTES interroga
 * `GET /v1/convai/conversations/{id}`. Se risulta conclusa, NON rifà i calcoli
 * di billing qui: costruisce un payload identico a quello del webhook, lo
 * FIRMA con lo stesso ELEVENLABS_WEBHOOK_SECRET (HMAC SHA-256 hex, header
 * xi-signature) e lo POSTa a elevenlabs-webhook. Tutta la pipeline vera —
 * transcript, sentiment, statistiche, addebito atomico, dual-write v2 — gira
 * una volta sola, lì. Il fix del segnaposto (commit 6b1809740) garantisce che
 * l'UPDATE completi la riga invece di skipparla.
 *
 * Casi terminali senza fatturazione:
 *  - ElevenLabs risponde 404 (conversazione mai nata: chiamata fallita al
 *    setup) → status='failed', nota in metadata, nessun addebito.
 *  - Ancora attiva ma più vecchia di HARD_TIMEOUT_HOURS → 'failed' difensivo:
 *    una chiamata reale non dura ore, ed è meglio un mancato addebito visibile
 *    di una riga aperta per sempre.
 *
 * Auth: cron secret (cronAuth condiviso) o service-role.
 * Schedulazione: ogni 15 minuti (vedi migration; da creare col deploy).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

const GRACE_MINUTES = 10;       // sotto i 10 min la chiamata può essere davvero in corso
const HARD_TIMEOUT_HOURS = 3;   // oltre: chiudi comunque, una telefonata non dura ore
const MAX_PER_RUN = 20;         // le run sono frequenti: niente batch enormi

const EL_BASE = "https://api.elevenlabs.io/v1";

type ElTranscriptMsg = { role?: string; message?: string };
interface ElConversation {
  agent_id?: string;
  status?: string; // initiated | in-progress | processing | done | failed
  transcript?: ElTranscriptMsg[];
  metadata?: { call_duration_secs?: number; [k: string]: unknown };
  analysis?: { transcript_summary?: string };
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!cronSecretValido(req) && authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const webhookSecret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  const apiKey = await getPlatformSetting("elevenlabs_api_key", "ELEVENLABS_API_KEY");
  if (!webhookSecret || !apiKey) {
    // Config incompleta: rumore, non silenzio — questo errore finisce nei log
    // del cron e in cron_http_failures, non in un catch muto.
    return json({ error: "ELEVENLABS_WEBHOOK_SECRET o API key mancanti" }, 503);
  }

  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();
  const { data: stuck, error: qErr } = await admin
    .from("ai_agent_conversations")
    .select("id, elevenlabs_conversation_id, started_at, company_id")
    .eq("status", "in_progress")
    .lt("started_at", cutoff)
    .order("started_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (qErr) return json({ error: qErr.message }, 500);
  if (!stuck || stuck.length === 0) return json({ ok: true, swept: 0 });

  const hardTimeoutMs = HARD_TIMEOUT_HOURS * 3_600_000;
  let reconciled = 0, failed = 0, stillRunning = 0, errors = 0;

  for (const conv of stuck) {
    const convId = conv.elevenlabs_conversation_id as string | null;
    const age = Date.now() - new Date(conv.started_at as string).getTime();

    // Senza id ElevenLabs non c'è nulla da chiedere: chiudi difensivo.
    if (!convId) {
      await marcaFallita(admin, conv.id as string, "sweeper: nessun conversation_id ElevenLabs");
      failed++;
      continue;
    }

    try {
      const res = await fetch(`${EL_BASE}/convai/conversations/${convId}`, {
        headers: { "xi-api-key": apiKey },
      });

      if (res.status === 404) {
        await marcaFallita(admin, conv.id as string, "sweeper: conversazione inesistente su ElevenLabs (404)");
        failed++;
        continue;
      }
      if (!res.ok) {
        console.error(`[SWEEPER] EL ${res.status} su ${convId}`);
        errors++;
        continue; // transitorio: riprova alla prossima run
      }

      const el = (await res.json()) as ElConversation;
      const elStatus = (el.status ?? "").toLowerCase();
      const finita = elStatus === "done" || elStatus === "failed";

      if (!finita) {
        if (age > hardTimeoutMs) {
          await marcaFallita(
            admin, conv.id as string,
            `sweeper: ancora "${elStatus}" dopo ${HARD_TIMEOUT_HOURS}h — chiusura difensiva`,
          );
          failed++;
        } else {
          stillRunning++;
        }
        continue;
      }

      // Conclusa: ricostruisci il payload del webhook e lascialo lavorare.
      // agent_id qui è l'ID ElevenLabs (il webhook risolve l'agente interno).
      const payload = JSON.stringify({
        agent_id: el.agent_id,
        conversation_id: convId,
        status: elStatus === "done" ? "completed" : "failed",
        duration_seconds: el.metadata?.call_duration_secs ?? 0,
        messages_count: el.transcript?.length ?? 0,
        transcript: el.transcript ?? [],
        summary: el.analysis?.transcript_summary,
        metadata: { reconciled_by_sweeper: true },
      });

      const whRes = await fetch(`${supabaseUrl}/functions/v1/elevenlabs-webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-signature": await hmacHex(webhookSecret, payload),
        },
        body: payload,
      });

      if (whRes.ok) {
        reconciled++;
      } else {
        console.error(`[SWEEPER] webhook ${whRes.status} su ${convId}: ${await whRes.text().catch(() => "")}`);
        errors++;
      }
    } catch (e) {
      console.error(`[SWEEPER] errore su ${convId}:`, e instanceof Error ? e.message : e);
      errors++;
    }
  }

  console.log(`[SWEEPER] riconciliate=${reconciled} fallite=${failed} in corso=${stillRunning} errori=${errors}`);
  return json({ ok: true, swept: stuck.length, reconciled, failed, still_running: stillRunning, errors });

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

async function marcaFallita(
  admin: ReturnType<typeof createClient>,
  rowId: string,
  nota: string,
) {
  // Guard su status: se nel frattempo il webhook vero è arrivato, non toccare.
  await admin
    .from("ai_agent_conversations")
    .update({ status: "failed", metadata: { sweeper_note: nota } })
    .eq("id", rowId)
    .eq("status", "in_progress");
}
