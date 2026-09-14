// ============================================================================
// social-publish-scheduler — pubblica i post programmati e riprende quelli in corso (cron)
// ============================================================================
// Invocato da pg_cron (ogni minuto). Due code:
//  1. social_posts status='scheduled' con scheduled_at <= now → prima pubblicazione
//  2. social_posts status='processing' con next_attempt_at <= now → giro successivo
//     (contenitore Instagram ancora in elaborazione, errore temporaneo da
//     ritentare, o giro precedente interrotto a metà)
// Funziona per OGNI azienda senza configurazione: protetto con header
// x-cron-secret == INTERNAL_CRON_SECRET (env project-wide già configurato; stesso
// schema dei cron silvio/bulk-scheduler). Il cron lo legge dal vault
// (silvio_internal_cron_secret) e lo passa nell'header.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { markPostExhausted, publishSocialPost, type SocialPostRow } from "../_shared/socialPublishCore.ts";
import { MAX_SCHEDULER_CLAIMS } from "../_shared/socialPublishLogic.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";

/** Lucchetto del giro: se la funzione muore a metà, il post torna disponibile dopo 10 min. */
const LEASE_MS = 10 * 60_000;
/** Oltre questo tempo non si prendono altri post: li riprende il giro dopo. */
const TIME_BUDGET_MS = 100_000;
/** Attesa massima per un contenitore Instagram dentro un giro. */
const INLINE_WAIT_MS = 15_000;
const BATCH = 25;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** Errore da migrazione 20280916910000 non ancora applicata. */
function isMissingNewSchema(message: string | undefined): boolean {
  return /next_attempt_at|publish_attempts|schema cache|check constraint|column/i.test(message ?? "");
}

/**
 * Claim atomico per-post (anti doppia pubblicazione): l'UPDATE condizionato
 * sullo stato letto lo vince un solo giro; l'altro riceve 0 righe e salta.
 */
async function claimPost(
  admin: Admin,
  post: SocialPostRow,
  nowIso: string,
): Promise<{ claimed: boolean; attempts: number; error?: string }> {
  const attempts = (post.publish_attempts ?? 0) + 1;
  let query = admin
    .from("social_posts")
    .update({
      status: "processing",
      next_attempt_at: new Date(Date.now() + LEASE_MS).toISOString(),
      publish_attempts: attempts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id)
    .eq("status", post.status);
  query = post.status === "processing" ? query.lte("next_attempt_at", nowIso) : query.lte("scheduled_at", nowIso);
  const { data, error } = await query.select("id");

  if (error) {
    if (post.status === "scheduled" && isMissingNewSchema(error.message)) {
      // Schema vecchio: lucchetto di prima ('failed'), che persist porta a 'published' se riesce.
      const legacy = await admin
        .from("social_posts")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", post.id)
        .eq("status", "scheduled")
        .select("id");
      if (legacy.error) return { claimed: false, attempts, error: legacy.error.message };
      return { claimed: (legacy.data ?? []).length > 0, attempts };
    }
    return { claimed: false, attempts, error: error.message };
  }
  return { claimed: (data ?? []).length > 0, attempts };
}

serveConMetriche("social-publish-scheduler", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const INTERNAL_CRON_SECRET = Deno.env.get("INTERNAL_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!INTERNAL_CRON_SECRET || provided !== INTERNAL_CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  try {
    const startedAt = Date.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();

    // Prima i post già avviati (un Reel che aspetta da minuti ha la precedenza).
    const { data: resumable, error: resumeErr } = await admin
      .from("social_posts")
      .select("*")
      .eq("status", "processing")
      .lte("next_attempt_at", nowIso)
      .order("next_attempt_at", { ascending: true })
      .limit(BATCH);
    if (resumeErr && !isMissingNewSchema(resumeErr.message)) throw resumeErr;

    const { data: due, error } = await admin
      .from("social_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(BATCH);
    if (error) throw error;

    const posts = [...(resumeErr ? [] : resumable ?? []), ...(due ?? [])] as SocialPostRow[];
    let published = 0;
    let pending = 0;
    let skipped = 0;
    let deferred = 0;
    const failures: Array<{ id: string; result: unknown }> = [];

    for (const post of posts) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        deferred += 1;
        continue;
      }

      const claim = await claimPost(admin, post, nowIso);
      if (claim.error) {
        failures.push({ id: post.id, result: { _error: claim.error } });
        continue;
      }
      if (!claim.claimed) {
        skipped += 1; // già preso da un altro giro
        continue;
      }

      try {
        if (claim.attempts > MAX_SCHEDULER_CLAIMS) {
          await markPostExhausted(admin, post);
          failures.push({ id: post.id, result: { _error: "troppi tentativi" } });
          continue;
        }
        const outcome = await publishSocialPost(
          admin,
          { ...post, publish_attempts: claim.attempts },
          { inlineWaitMs: INLINE_WAIT_MS },
        );
        if (outcome.pending) pending += 1;
        else if (outcome.ok) published += 1;
        else failures.push({ id: post.id, result: outcome.result });
      } catch (e) {
        // Il post resta 'processing' col lucchetto: lo riprende il giro dopo la scadenza.
        failures.push({ id: post.id, result: { _error: e instanceof Error ? e.message : String(e) } });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: posts.length, published, pending, skipped, deferred, failed: failures.length, failures }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Errore interno" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
