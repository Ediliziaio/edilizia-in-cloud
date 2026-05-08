/**
 * cleanup-capture-orphans — Cron job giornaliero
 *
 * Elimina file storage rimasti orfani da preventivo_da_foto_runs in stato
 * failed/pending/analyzing_images da più di 7 giorni (run mai completati).
 *
 * Invocato da pg_cron o da cron trigger esterno (Supabase cron).
 * Scopo: evitare accumulo di file in documenti-smart bucket.
 *
 * Strategia:
 *   1. Trova runs con status IN ('failed','pending','analyzing_images')
 *      AND updated_at < now() - 7 days AND image_paths IS NOT NULL
 *   2. Per ogni run: rimuovi file da storage (batch remove)
 *   3. Cancella i runs dalla tabella
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/headers.ts";

const ORPHAN_DAYS = 7;
const BATCH_SIZE = 50;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // Verifica che sia una chiamata cron o admin (x-cron-secret header)
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const providedSecret = req.headers.get("x-cron-secret");
    if (providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  const cutoff = new Date(Date.now() - ORPHAN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let runsDeleted = 0;
  let filesDeleted = 0;
  const errors: string[] = [];

  try {
    // 1. Recupera runs orfani
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orphanRuns, error: fetchErr } = await (supabase as any)
      .from("preventivo_da_foto_runs")
      .select("id, image_paths, audio_path, company_id")
      .in("status", ["failed", "pending", "analyzing_images"])
      .lt("updated_at", cutoff)
      .limit(BATCH_SIZE);

    if (fetchErr) throw new Error(`fetch_runs: ${fetchErr.message}`);
    if (!orphanRuns || orphanRuns.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, runs_deleted: 0, files_deleted: 0, message: "no orphans" }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // 2. Raccoglie tutti i path storage da eliminare
    const allPaths: string[] = [];
    for (const run of orphanRuns) {
      if (Array.isArray(run.image_paths)) {
        allPaths.push(...run.image_paths.filter(Boolean));
      }
      if (run.audio_path) {
        allPaths.push(run.audio_path);
      }
    }

    // 3. Elimina file storage (in batch da 100 — limit API)
    if (allPaths.length > 0) {
      for (let i = 0; i < allPaths.length; i += 100) {
        const batch = allPaths.slice(i, i + 100);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: removeErr } = await (supabase as any).storage
          .from("documenti-smart")
          .remove(batch);
        if (removeErr) {
          errors.push(`storage_remove batch ${i}: ${removeErr.message}`);
        } else {
          filesDeleted += batch.length;
        }
      }
    }

    // 4. Elimina runs dalla tabella
    const runIds = orphanRuns.map((r: { id: string }) => r.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteErr } = await (supabase as any)
      .from("preventivo_da_foto_runs")
      .delete()
      .in("id", runIds);

    if (deleteErr) {
      errors.push(`delete_runs: ${deleteErr.message}`);
    } else {
      runsDeleted = runIds.length;
    }
  } catch (e: any) {
    errors.push(`fatal: ${e.message}`);
  }

  console.log(`[cleanup-capture-orphans] runs=${runsDeleted} files=${filesDeleted} errors=${errors.length}`);

  return new Response(
    JSON.stringify({
      ok: errors.length === 0,
      runs_deleted: runsDeleted,
      files_deleted: filesDeleted,
      errors,
      cutoff,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
