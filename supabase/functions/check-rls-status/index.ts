import { getCorsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RlsTableInfo {
  table_name: string;
  rls_enabled: boolean;
  policy_count: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    // Full RLS audit: all public tables with RLS status and policy count
    const { data: allTables, error: fullQueryError } = await supabaseAdmin.rpc(
      "get_full_rls_audit" as never
    );

    let tableAudit: RlsTableInfo[] = [];

    if (!fullQueryError && allTables) {
      tableAudit = (allTables as any[]).map((t: any) => ({
        table_name: t.table_name,
        rls_enabled: t.rls_enabled,
        policy_count: Number(t.policy_count ?? 0),
      }));
    } else {
      // Fallback: use the existing get_tables_without_rls RPC
      console.warn("get_full_rls_audit not available, using fallback:", fullQueryError?.message);
      const { data: legacyTables } = await supabaseAdmin.rpc("get_tables_without_rls");
      if (legacyTables) {
        tableAudit = (legacyTables as any[]).map((t: any) => ({
          table_name: t.table_name,
          rls_enabled: false,
          policy_count: 0,
        }));
      }
    }

    const tablesWithoutRls = tableAudit.filter((t) => !t.rls_enabled).map((t) => t.table_name);
    const tablesWithoutPolicies = tableAudit.filter((t) => t.rls_enabled && t.policy_count === 0).map((t) => t.table_name);

    // Record each missing-RLS table as a health metric
    if (tablesWithoutRls.length > 0) {
      const metrics = tablesWithoutRls.map((tableName) => ({
        metric_type: "rls_missing",
        function_name: "check-rls-status",
        error_message: `Tabella senza RLS: public.${tableName}`,
        metadata: { table_name: `public.${tableName}`, event: "manual_scan" },
      }));
      await supabaseAdmin.from("system_health_metrics").insert(metrics).catch(() => null);
    }

    return jsonResponse({
      all_tables: tableAudit,
      tables_without_rls: tablesWithoutRls,
      tables_without_policies: tablesWithoutPolicies,
      count: tablesWithoutRls.length,
      warnings: tablesWithoutPolicies.length,
      scanned_at: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("check-rls-status error:", e);
    return errorResponse("Internal server error", 500);
  }
});
