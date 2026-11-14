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
 *
 * Poi (14/11/2026) gli originali dei contratti letti con l'AI e mai entrati in una
 * commessa: documenti-smart/<azienda>/ai-contratti/, più vecchi di 30 giorni e non
 * citati da un'ipotesi del simulatore. L'elenco lo decide originali_ai_da_pulire().
 * Gira anche quando non ci sono run orfani.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";

const ORPHAN_DAYS = 7;
const BATCH_SIZE = 50;
const ORIGINALI_AI_GIORNI = 30;

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
    // Senza run orfani si passa comunque agli originali dei contratti (sotto).
    if (orphanRuns && orphanRuns.length > 0) {

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
    }
  } catch (e: any) {
    errors.push(`fatal: ${e.message}`);
  }

  // Originali dei contratti letti con l'AI e mai entrati in una commessa.
  let originaliAiDeleted = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: originali, error: errOriginali } = await (supabase as any)
      .rpc("originali_ai_da_pulire", { p_giorni: ORIGINALI_AI_GIORNI, p_limite: 200 });
    if (errOriginali) throw new Error(`originali_ai_da_pulire: ${errOriginali.message}`);
    const percorsi = ((originali ?? []) as unknown[]).filter((p): p is string => typeof p === "string" && p.includes("/ai-contratti/"));
    for (let i = 0; i < percorsi.length; i += 100) {
      const batch = percorsi.slice(i, i + 100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: removeErr } = await (supabase as any).storage.from("documenti-smart").remove(batch);
      if (removeErr) errors.push(`originali_ai batch ${i}: ${removeErr.message}`);
      else originaliAiDeleted += batch.length;
    }
  } catch (e: any) {
    errors.push(`originali_ai: ${e.message}`);
  }

  console.log(`[cleanup-capture-orphans] runs=${runsDeleted} files=${filesDeleted} originali_ai=${originaliAiDeleted} errors=${errors.length}`);

  return new Response(
    JSON.stringify({
      ok: errors.length === 0,
      runs_deleted: runsDeleted,
      files_deleted: filesDeleted,
      originali_ai_deleted: originaliAiDeleted,
      errors,
      cutoff,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
