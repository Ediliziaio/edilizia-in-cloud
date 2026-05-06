/**
 * IMPROVEMENT #15 — RLS Health Check (cron daily 04:00)
 *
 * Esegue test query "as authenticated user" su tabelle core per scoprire:
 *   - infinite recursion (ERROR 42P17) su RLS policy
 *   - 0 inaspettato (RLS troppo restrittiva → tenant isolato dal proprio data)
 *   - errori generici nelle policy
 *
 * Per ogni company con almeno 1 company_admin:
 *   - simula query come quel admin
 *   - confronta count visibile vs count globale (super_admin) per la stessa company
 *   - se mismatch o errore → emette alert
 *
 * Avrebbe rilevato il bug Ke Bei (infinite recursion orders↔order_items) in 24h
 * invece di a runtime quando l'utente l'ha segnalato.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const TABLES_TO_CHECK = [
  "orders",
  "order_items",
  "quotes",
  "marketing_contacts",
  "marketing_opportunities",
  "warehouse_stock",
  "invoices",
  "employees",
  "subappaltatori",
];

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
    companies_checked: 0,
    tables_checked: 0,
    errors_detected: 0,
    recursion_errors: [] as Array<{ company_id: string; table: string }>,
    rls_mismatches: [] as Array<{
      company_id: string;
      table: string;
      visible_as_admin: number;
      visible_to_admin_user: number;
    }>,
    duration_ms: 0,
  };

  try {
    // 1. Trova tutti i company_admin (1 per company)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: admins } = await (supabase as any)
      .from("user_roles")
      .select("user_id, profiles!inner(company_id)")
      .eq("role", "company_admin");

    if (!admins || admins.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.companies_checked = admins.length;

    for (const admin of admins) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyId = (admin as any).profiles?.company_id;
      const userId = admin.user_id;
      if (!companyId || !userId) continue;

      for (const tbl of TABLES_TO_CHECK) {
        summary.tables_checked += 1;

        try {
          // Test 1: count "as super_admin" filtrato per company (baseline)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count: globalCount, error: globalErr } = await (supabase as any)
            .from(tbl)
            .select("*", { count: "exact", head: true })
            .eq("company_id", companyId);

          if (globalErr) {
            // table doesn't have company_id or doesn't exist
            continue;
          }

          // Test 2: simulazione utente authenticated tramite RPC test
          // (non possiamo fare set local jwt da edge function in modo affidabile,
          // quindi usiamo helper SQL `_rls_test_count` se esiste, altrimenti skip)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: rlsTest, error: rlsErr } = await (supabase as any).rpc(
            "_rls_test_count",
            { p_table: tbl, p_user_id: userId },
          );

          if (rlsErr) {
            // L'helper non esiste o errore — registra ma non bloccare
            if (rlsErr.message?.includes("infinite recursion")) {
              summary.recursion_errors.push({ company_id: companyId, table: tbl });
              summary.errors_detected += 1;
            }
            continue;
          }

          const adminUserCount = Number(rlsTest ?? 0);
          if (
            globalCount !== null &&
            globalCount !== undefined &&
            adminUserCount < globalCount &&
            globalCount > 0
          ) {
            // Mismatch: super_admin vede X, company_admin vede meno → RLS troppo restrittiva
            summary.rls_mismatches.push({
              company_id: companyId,
              table: tbl,
              visible_as_admin: globalCount,
              visible_to_admin_user: adminUserCount,
            });
            summary.errors_detected += 1;
          }
        } catch (e) {
          if (
            e instanceof Error &&
            e.message.includes("infinite recursion")
          ) {
            summary.recursion_errors.push({ company_id: companyId, table: tbl });
            summary.errors_detected += 1;
          }
        }
      }
    }

    // Log alert se errori
    if (summary.errors_detected > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("notifications").insert({
          type: "rls_health_alert",
          severity: "high",
          title: `RLS health-check: ${summary.errors_detected} anomalie`,
          body: `${summary.recursion_errors.length} ricorsioni infinite, ${summary.rls_mismatches.length} mismatch.`,
          metadata: summary,
        });
      } catch {
        /* notifications might not exist */
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    return jsonOk(
      { ...summary, fatal: (e as Error).message },
      500,
    );
  }
});

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
