/**
 * MP-AEDIX-01 — Aedix Brain Daily Snapshot
 *
 * Cron job edge function: itera tutte le companies con `aedix_brain_opt_in=true`
 * e calcola snapshot giornaliero anonimizzato via RPC `aedix_brain_compute_snapshot`.
 *
 * Privacy:
 *   - Pseudonimizzazione SHA-256 + salt env (server-side, RPC SECURITY DEFINER)
 *   - Zero PII nel destination schema aedix_brain.*
 *   - Auto-delete snapshot > 36 mesi (cron separato)
 *
 * Schedula via cron pg_cron alle 03:00 UTC.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

interface CompanyRow {
  id: string;
  name: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  const summary = {
    total_companies: 0,
    snapshots_created: 0,
    skipped: 0,
    errors: 0,
    duration_ms: 0,
    errors_detail: [] as Array<{ company_id: string; message: string }>,
  };

  try {
    // 1. Lista companies con opt-in attivo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies, error } = await (supabase as any)
      .from("companies")
      .select("id, name")
      .eq("aedix_brain_opt_in", true);

    if (error) throw new Error(`Companies query: ${error.message}`);

    const list = (companies ?? []) as CompanyRow[];
    summary.total_companies = list.length;

    // 2. Per ogni company, calcola snapshot via RPC (sequenziale per non saturare DB)
    for (const c of list) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: rpcErr } = await (supabase as any)
          .rpc("aedix_brain_compute_snapshot", { p_company_id: c.id });

        if (rpcErr) {
          summary.errors++;
          summary.errors_detail.push({ company_id: c.id, message: rpcErr.message });
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = data as any;
        if (r?.error) {
          summary.skipped++;
        } else if (r?.success) {
          summary.snapshots_created++;
        }
      } catch (e) {
        summary.errors++;
        summary.errors_detail.push({
          company_id: c.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // 3. Refresh materialized view market_metrics (best-effort)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("refresh_aedix_brain_market_metrics");
    } catch {
      // Se l'RPC non esiste, ignora — la materialized view può essere refreshed
      // anche da pg_cron separato
    }

    summary.duration_ms = Date.now() - t0;
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    return new Response(
      JSON.stringify({
        ...summary,
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
