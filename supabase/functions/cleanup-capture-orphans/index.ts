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
 *      AND updated_at < now() - 7 days AND image_storage_paths IS NOT NULL
 *   2. Per ogni run: rimuovi file da storage (batch remove)
 *   3. Cancella i runs dalla tabella
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";

const ORPHAN_DAYS = 7;
const BATCH_SIZE = 50;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // Il segreto del cron ha tre nomi diversi in giro per il progetto e questa
  // ne confrontava uno solo: bastava che il chiamante ne usasse un altro per
  // prendere 401. cronSecretValido() li accetta tutti.
  //
  // Il controllo era anche fail-open: stava dentro `if (cronSecret)`, quindi
  // con la variabile non impostata la funzione restava aperta a chiunque.
  if (!cronSecretValido(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
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
      // I nomi veri delle colonne sono image_storage_paths / audio_storage_path
      // (e c'e' anche sketch_storage_paths, che non veniva mai ripulito):
      // con i nomi sbagliati la query falliva e nessun file e' mai stato tolto.
      .select("id, image_storage_paths, sketch_storage_paths, audio_storage_path, company_id")
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
      if (Array.isArray(run.image_storage_paths)) {
        allPaths.push(...run.image_storage_paths.filter(Boolean));
      }
      if (Array.isArray(run.sketch_storage_paths)) {
        allPaths.push(...run.sketch_storage_paths.filter(Boolean));
      }
      if (run.audio_storage_path) {
        allPaths.push(run.audio_storage_path);
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
