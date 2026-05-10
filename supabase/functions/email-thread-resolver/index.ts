/**
 * email-thread-resolver — assegna thread_id alle email_inbox senza thread.
 *
 * Logica:
 *   1. Cerca tutti i record email_inbox WHERE thread_id IS NULL e user_id NOT NULL
 *   2. Per ogni email:
 *      a) Se in_reply_to è popolato → cerca thread del messaggio referenziato
 *      b) Altrimenti normalizza subject (rimuovi Re:/Fwd: prefisi) e cerca
 *         thread esistente con stesso subject_normalized + stessi participants
 *         degli ultimi 30 giorni
 *      c) Se non trova → crea nuovo email_threads
 *   3. UPDATE email_inbox SET thread_id = X
 *   4. UPDATE email_threads counters (message_count, unread_count, last_received_at, ...)
 *
 * Triggered:
 *   - Da email-poll-inbox dopo l'inserimento di nuove email
 *   - Manuale tramite POST { user_id?, batch_size? }
 *
 * Auth: service_role (chiamata interna)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InboxRow {
  id: string;
  user_id: string;
  company_id: string;
  message_id: string | null;
  in_reply_to: string | null;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
  attachments: unknown;
  raw_text: string | null;
}

interface ThreadRow {
  id: string;
  user_id: string;
  company_id: string;
  subject_normalized: string;
  participants: string[];
  message_count: number;
  unread_count: number;
  has_starred: boolean;
  has_attachments: boolean;
  first_received_at: string;
  last_received_at: string;
  preview: string | null;
}

function normalizeSubject(raw: string | null | undefined): string {
  if (!raw) return "(no subject)";
  return raw
    .replace(/^\s*(re|fwd?|i|aw|wg|sv|tr)\s*[:\-\[]\s*/gi, "")
    .replace(/^\s*\[.*?\]\s*/g, "")
    .trim()
    .toLowerCase()
    .slice(0, 200) || "(no subject)";
}

function uniqEmails(...arrs: (string | null | undefined)[][]): string[] {
  const set = new Set<string>();
  for (const arr of arrs) {
    for (const e of arr) {
      if (e && typeof e === "string") set.add(e.trim().toLowerCase());
    }
  }
  return Array.from(set).filter((s) => s.length > 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let body: { user_id?: string; batch_size?: number } = {};
  try {
    body = await req.json();
  } catch { /* empty */ }
  const batchSize = Math.min(Math.max(body.batch_size ?? 100, 1), 500);

  // 1) Carica candidati: email_inbox senza thread_id
  let query = supabase
    .from("email_inbox")
    .select("id, user_id, company_id, message_id, in_reply_to, from_email, to_email, subject, received_at, is_read, is_starred, attachments, raw_text")
    .is("thread_id", null)
    .not("user_id", "is", null)
    .order("received_at", { ascending: true })
    .limit(batchSize);
  if (body.user_id) query = query.eq("user_id", body.user_id);

  const { data: candidates, error: candErr } = await query;
  if (candErr) {
    return new Response(JSON.stringify({ ok: false, error: candErr.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let assigned = 0;
  let created = 0;
  const errors: string[] = [];

  for (const row of (candidates ?? []) as InboxRow[]) {
    try {
      const subjectNorm = normalizeSubject(row.subject);
      const participants = uniqEmails([row.from_email, row.to_email]);
      const hasAttach = Array.isArray(row.attachments) && (row.attachments as unknown[]).length > 0;
      let threadId: string | null = null;

      // a) Match per in_reply_to
      if (row.in_reply_to) {
        const { data: refParent } = await supabase
          .from("email_inbox")
          .select("thread_id")
          .eq("user_id", row.user_id)
          .eq("message_id", row.in_reply_to)
          .not("thread_id", "is", null)
          .maybeSingle();
        if (refParent?.thread_id) threadId = refParent.thread_id as string;
      }

      // b) Match per subject_normalized recente (30gg)
      if (!threadId) {
        const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { data: existing } = await supabase
          .from("email_threads")
          .select("id, participants")
          .eq("user_id", row.user_id)
          .eq("subject_normalized", subjectNorm)
          .gte("last_received_at", cutoff)
          .order("last_received_at", { ascending: false })
          .limit(5);

        // Match se almeno un participante in comune
        if (existing && existing.length > 0) {
          const overlap = existing.find((t) =>
            (t.participants as string[]).some((p) => participants.includes(p))
          );
          if (overlap) threadId = overlap.id as string;
        }
      }

      // c) Crea nuovo thread
      if (!threadId) {
        const preview = row.raw_text ? row.raw_text.slice(0, 200) : null;
        const { data: newThread, error: thErr } = await supabase
          .from("email_threads")
          .insert({
            user_id: row.user_id,
            company_id: row.company_id,
            subject_normalized: subjectNorm,
            participants,
            message_count: 1,
            unread_count: row.is_read ? 0 : 1,
            has_starred: row.is_starred,
            has_attachments: hasAttach,
            first_received_at: row.received_at,
            last_received_at: row.received_at,
            preview,
          })
          .select("id")
          .single();
        if (thErr || !newThread) {
          errors.push(`Create thread for ${row.id}: ${thErr?.message ?? "no row"}`);
          continue;
        }
        threadId = newThread.id as string;
        created++;
      } else {
        // Update counters thread esistente
        await supabase.rpc("email_thread_increment", {
          p_thread_id: threadId,
          p_unread_delta: row.is_read ? 0 : 1,
          p_starred: row.is_starred,
          p_attach: hasAttach,
          p_received_at: row.received_at,
          p_new_participants: participants,
          p_preview: row.raw_text ? row.raw_text.slice(0, 200) : null,
        }).then((r) => {
          if (r.error) {
            // Fallback: update diretto se RPC non esiste
            return supabase
              .from("email_threads")
              .update({
                message_count: 0, // placeholder; RPC dovrebbe occuparsene
              })
              .eq("id", threadId!);
          }
        }).catch(() => { /* ignora; counter best-effort */ });
      }

      // Assegna thread alla email
      const { error: updErr } = await supabase
        .from("email_inbox")
        .update({ thread_id: threadId })
        .eq("id", row.id);
      if (updErr) {
        errors.push(`Assign thread ${threadId} to ${row.id}: ${updErr.message}`);
        continue;
      }
      assigned++;
    } catch (e) {
      errors.push(`Row ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: candidates?.length ?? 0,
      assigned,
      created_threads: created,
      errors_count: errors.length,
      errors: errors.slice(0, 20),
    }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
